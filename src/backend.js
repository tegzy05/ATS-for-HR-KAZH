// Data layer: Firestore (data), Cloud Storage (files), Cloud Function (AI scoring).
//
// Returns the same snake_case, nested shapes the UI already expects, so the
// screens do not need to know how the data is stored.
//
// Firestore layout
//   tenders/{id}        title, status, ..., tender_positions[], tender_required_documents[]
//   applications/{id}   applicant fields, status, application_documents[],
//                       experts{ [expertId]: { ...expert, tender_positions (snapshot),
//                                              scores{A,B,C}, disqualification } }
// Scores and disqualifications are nested map fields, so HR edits update one
// field at a time and two reviewers never overwrite each other's work.

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, query, orderBy,
  serverTimestamp, deleteField, FieldPath,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions, firebaseConfig } from './firebase';
import { APPLICANT_TYPES, REQUIRED_DOCUMENT_TYPES, DISQUALIFICATION_REASONS } from './referenceData';

// ============================================================
// Helpers
// ============================================================

// Storage object names are kept ASCII-safe so links never break. The original
// file name is still saved next to the path for display.
function safeStorageName(name) {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot).replace(/[^A-Za-z0-9.]/g, '') : '';
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'file';
  return `${base}${ext}`;
}

function toIso(value) {
  if (!value) return null;
  return typeof value.toDate === 'function' ? value.toDate().toISOString() : value;
}

const bySortOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);
const newId = () => crypto.randomUUID();

async function uploadFile(path, file) {
  await uploadBytes(ref(storage, path), file);
  return path;
}

function publicFileUrl(path) {
  if (!path) return null;
  return `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/${encodeURIComponent(path)}?alt=media`;
}

// ============================================================
// Справочники (kept in code, see referenceData.js)
// ============================================================

export async function fetchApplicantTypes() {
  return APPLICANT_TYPES;
}

export async function fetchRequiredDocumentTypes() {
  return [...REQUIRED_DOCUMENT_TYPES].sort(bySortOrder);
}

export async function fetchDisqualificationReasons() {
  return [...DISQUALIFICATION_REASONS].sort((a, b) => a.code - b.code);
}

// ============================================================
// Тендеры
// ============================================================

export async function fetchTenders() {
  const snap = await getDocs(query(collection(db, 'tenders'), orderBy('created_at', 'desc')));
  return snap.docs.map((d) => {
    const t = d.data();
    return {
      ...t,
      id: d.id,
      created_at: toIso(t.created_at),
      tender_positions: [...(t.tender_positions || [])].sort(bySortOrder),
      tender_required_documents: [...(t.tender_required_documents || [])].sort(bySortOrder),
    };
  });
}

export async function createTender({ title, applicantTypeKey, positions, requiredDocs, jdFile }) {
  let jdFilePath = null;
  let jdFileName = null;

  if (jdFile) {
    jdFilePath = await uploadFile(`tender-docs/${Date.now()}_${safeStorageName(jdFile.name)}`, jdFile);
    jdFileName = jdFile.name;
  }

  const tenderRef = doc(collection(db, 'tenders'));
  const tender = {
    title,
    applicant_type_key: applicantTypeKey,
    jd_file_path: jdFilePath,
    jd_file_name: jdFileName,
    status: 'open',
    created_at: serverTimestamp(),
    tender_positions: (positions || []).map((p, i) => ({
      id: newId(),
      name: p.name,
      is_international: !!p.isInternational,
      weight: Number(p.weight) || 0,
      sort_order: i,
      criterion_a_label: p.criterionA.label,
      criterion_a_weight: p.criterionA.weight,
      criterion_a_requirement: p.criterionA.requirement ?? '',
      criterion_b_label: p.criterionB.label,
      criterion_b_weight: p.criterionB.weight,
      criterion_b_requirement: p.criterionB.requirement ?? '',
      criterion_c_label: p.criterionC.label,
      criterion_c_weight: p.criterionC.weight,
      criterion_c_requirement: p.criterionC.requirement ?? '',
    })),
    tender_required_documents: (requiredDocs || []).map((docName, i) => ({
      id: newId(), doc_name: docName, sort_order: i,
    })),
  };

  await setDoc(tenderRef, tender);
  return { ...tender, id: tenderRef.id };
}

export function getTenderJdUrl(jdFilePath) {
  return publicFileUrl(jdFilePath);
}

// ============================================================
// Заявки
// ============================================================

export async function fetchApplications() {
  const snap = await getDocs(query(collection(db, 'applications'), orderBy('submitted_at', 'desc')));
  return snap.docs.map((d) => {
    const a = d.data();
    const experts = Object.values(a.experts || {})
      .sort(bySortOrder)
      .map((e) => ({
        ...e,
        application_id: d.id,
        expert_scores: Object.entries(e.scores || {}).map(([criterion, s]) => ({
          criterion, ...s, updated_at: toIso(s.updated_at),
        })),
        expert_disqualifications: e.disqualification
          ? [{ ...e.disqualification, created_at: toIso(e.disqualification.created_at) }]
          : [],
      }));
    const { experts: _raw, ...rest } = a;
    return {
      ...rest,
      id: d.id,
      submitted_at: toIso(a.submitted_at),
      application_documents: a.application_documents || [],
      application_experts: experts,
    };
  });
}

export async function createApplication({ tenderId, applicantTypeKey, personal, documents, experts }) {
  const tenderSnap = await getDoc(doc(db, 'tenders', tenderId));
  if (!tenderSnap.exists()) throw new Error('Тендер не найден — возможно, он был удалён.');
  const positions = tenderSnap.data().tender_positions || [];

  const appRef = doc(collection(db, 'applications'));

  // Upload every file first, then write the application in one piece, so a
  // failed upload never leaves a half-saved application behind.
  const applicationDocuments = [];
  for (const d of documents) {
    const path = await uploadFile(`application-docs/${appRef.id}/${Date.now()}_${safeStorageName(d.file.name)}`, d.file);
    applicationDocuments.push({
      id: newId(),
      doc_name: d.docName,
      file_path: path,
      file_name: d.file.name,
      size_kb: Math.round(d.file.size / 1024),
      mime_type: d.file.type || null,
    });
  }

  const expertMap = {};
  for (let i = 0; i < experts.length; i++) {
    const e = experts[i];
    let cvFilePath = null;
    let cvFileName = null;
    if (e.cvFile) {
      cvFilePath = await uploadFile(`application-docs/${appRef.id}/cv_${Date.now()}_${safeStorageName(e.cvFile.name)}`, e.cvFile);
      cvFileName = e.cvFile.name;
    }

    const position = positions.find((p) => p.id === e.tenderPositionId);
    if (!position) throw new Error(`Позиция «${e.positionName || e.tenderPositionId}» не найдена в тендере.`);

    const years = Number(e.generalExperienceYears);
    const id = newId();
    expertMap[id] = {
      id,
      sort_order: i,
      tender_position_id: e.tenderPositionId,
      tender_positions: position, // snapshot used for scoring
      full_name: e.fullName,
      citizenship: e.citizenship ?? '',
      cv_file_path: cvFilePath,
      cv_file_name: cvFileName,
      education_summary: e.educationSummary ?? '',
      general_experience_years: Number.isFinite(years) && e.generalExperienceYears !== '' ? years : null,
      relevant_projects: e.relevantProjects ?? '',
      country_experience: e.countryExperience ?? '',
      scores: {},
    };
  }

  const application = {
    tender_id: tenderId,
    applicant_type_key: applicantTypeKey,
    full_name: personal.fullName,
    firm_name: personal.firmName || null,
    email: personal.email,
    phone: personal.phone ?? '',
    address: personal.address ?? '',
    citizenship: personal.citizenship ?? '',
    status: 'submitted',
    submitted_at: serverTimestamp(),
    application_documents: applicationDocuments,
    experts: expertMap,
  };

  await setDoc(appRef, application);
  return { ...application, id: appRef.id };
}

export async function updateApplicationStatus(applicationId, status) {
  await updateDoc(doc(db, 'applications', applicationId), { status });
}

export function getDocumentFileUrl(filePath) {
  return publicFileUrl(filePath);
}

// ============================================================
// AI-скоринг эксперта (Cloud Function; ключ Anthropic хранится на сервере)
// ============================================================

const aiScoreExpert = httpsCallable(functions, 'aiScoreExpert');

export async function requestAiScore(expert, position) {
  const { data } = await aiScoreExpert({
    expert: {
      fullName: expert.full_name,
      citizenship: expert.citizenship,
      educationSummary: expert.education_summary,
      generalExperienceYears: expert.general_experience_years,
      relevantProjects: expert.relevant_projects,
      countryExperience: expert.country_experience,
    },
    position: {
      name: position.name,
      isInternational: position.is_international,
      criterionA: {
        label: position.criterion_a_label,
        weight: position.criterion_a_weight,
        requirement: position.criterion_a_requirement,
      },
      criterionB: {
        label: position.criterion_b_label,
        weight: position.criterion_b_weight,
        requirement: position.criterion_b_requirement,
      },
      criterionC: {
        label: position.criterion_c_label,
        weight: position.criterion_c_weight,
        requirement: position.criterion_c_requirement,
      },
    },
  });
  return data;
}

// `expert` is an item of application.application_experts (it carries both its
// own id and the id of the application document that contains it).

export async function saveExpertScore(expert, criterion, rating, justification, source, reviewedBy = null) {
  const value = Math.round(Math.min(100, Math.max(0, Number(rating) || 0)));
  await updateDoc(
    doc(db, 'applications', expert.application_id),
    new FieldPath('experts', expert.id, 'scores', criterion),
    { rating: value, justification: justification ?? '', source, reviewed_by: reviewedBy, updated_at: serverTimestamp() },
  );
}

export async function setExpertDisqualification(expert, reasonCode, reasonText, flaggedBy = null) {
  await updateDoc(
    doc(db, 'applications', expert.application_id),
    new FieldPath('experts', expert.id, 'disqualification'),
    { reason_code: reasonCode, reason_text: reasonText ?? '', flagged_by: flaggedBy, created_at: serverTimestamp() },
  );
}

export async function clearExpertDisqualification(expert) {
  await updateDoc(
    doc(db, 'applications', expert.application_id),
    new FieldPath('experts', expert.id, 'disqualification'),
    deleteField(),
  );
}
