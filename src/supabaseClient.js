import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tdjzkcfcaakvwbojilox.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5aSGyW8AouEVet-0u_tIfA_cxrnPA57';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ai-score-expert`;

// ============================================================
// Справочники
// ============================================================

export async function fetchApplicantTypes() {
  const { data, error } = await supabase.from('applicant_types').select('*');
  if (error) throw error;
  return data;
}

export async function fetchRequiredDocumentTypes() {
  const { data, error } = await supabase.from('required_document_types').select('*').order('sort_order');
  if (error) throw error;
  return data;
}

export async function fetchDisqualificationReasons() {
  const { data, error } = await supabase.from('disqualification_reasons').select('*').order('code');
  if (error) throw error;
  return data;
}

// ============================================================
// Тендеры
// ============================================================

export async function fetchTenders() {
  const { data, error } = await supabase
    .from('tenders')
    .select('*, tender_positions(*), tender_required_documents(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createTender({ title, applicantTypeKey, positions, requiredDocs, jdFile }) {
  let jdFilePath = null;
  let jdFileName = null;

  if (jdFile) {
    const path = `${Date.now()}_${jdFile.name}`;
    const { error: uploadError } = await supabase.storage.from('tender-docs').upload(path, jdFile);
    if (uploadError) throw uploadError;
    jdFilePath = path;
    jdFileName = jdFile.name;
  }

  const { data: tender, error: tenderError } = await supabase
    .from('tenders')
    .insert({ title, applicant_type_key: applicantTypeKey, jd_file_path: jdFilePath, jd_file_name: jdFileName, status: 'open' })
    .select()
    .single();
  if (tenderError) throw tenderError;

  if (positions?.length) {
    const rows = positions.map((p, i) => ({
      tender_id: tender.id,
      name: p.name,
      is_international: p.isInternational,
      weight: p.weight,
      sort_order: i,
      criterion_a_label: p.criterionA.label,
      criterion_a_weight: p.criterionA.weight,
      criterion_a_requirement: p.criterionA.requirement,
      criterion_b_label: p.criterionB.label,
      criterion_b_weight: p.criterionB.weight,
      criterion_b_requirement: p.criterionB.requirement,
      criterion_c_label: p.criterionC.label,
      criterion_c_weight: p.criterionC.weight,
      criterion_c_requirement: p.criterionC.requirement,
    }));
    const { error: posError } = await supabase.from('tender_positions').insert(rows);
    if (posError) throw posError;
  }

  if (requiredDocs?.length) {
    const rows = requiredDocs.map((doc, i) => ({ tender_id: tender.id, doc_name: doc, sort_order: i }));
    const { error: docsError } = await supabase.from('tender_required_documents').insert(rows);
    if (docsError) throw docsError;
  }

  return tender;
}

export function getTenderJdUrl(jdFilePath) {
  if (!jdFilePath) return null;
  const { data } = supabase.storage.from('tender-docs').getPublicUrl(jdFilePath);
  return data.publicUrl;
}

// ============================================================
// Заявки
// ============================================================

export async function fetchApplications() {
  const { data, error } = await supabase
    .from('applications')
    .select(`
      *,
      application_documents(*),
      application_experts(*, expert_scores(*), expert_disqualifications(*), tender_positions(*))
    `)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createApplication({ tenderId, applicantTypeKey, personal, documents, experts }) {
  const { data: application, error: appError } = await supabase
    .from('applications')
    .insert({
      tender_id: tenderId,
      applicant_type_key: applicantTypeKey,
      full_name: personal.fullName,
      firm_name: personal.firmName || null,
      email: personal.email,
      phone: personal.phone,
      address: personal.address,
      citizenship: personal.citizenship,
      status: 'submitted',
    })
    .select()
    .single();
  if (appError) throw appError;

  // Загружаем документы в Storage и записываем метаданные
  for (const doc of documents) {
    const path = `${application.id}/${Date.now()}_${doc.file.name}`;
    const { error: uploadError } = await supabase.storage.from('application-docs').upload(path, doc.file);
    if (uploadError) throw uploadError;

    const { error: docRowError } = await supabase.from('application_documents').insert({
      application_id: application.id,
      doc_name: doc.docName,
      file_path: path,
      file_name: doc.file.name,
      size_kb: Math.round(doc.file.size / 1024),
      mime_type: doc.file.type,
    });
    if (docRowError) throw docRowError;
  }

  // Записываем экспертов, распределённых по позициям
  for (const expert of experts) {
    let cvFilePath = null, cvFileName = null;
    if (expert.cvFile) {
      const path = `${application.id}/cv_${Date.now()}_${expert.cvFile.name}`;
      const { error: cvUploadError } = await supabase.storage.from('application-docs').upload(path, expert.cvFile);
      if (cvUploadError) throw cvUploadError;
      cvFilePath = path;
      cvFileName = expert.cvFile.name;
    }

    const { error: expertError } = await supabase.from('application_experts').insert({
      application_id: application.id,
      tender_position_id: expert.tenderPositionId,
      full_name: expert.fullName,
      citizenship: expert.citizenship,
      cv_file_path: cvFilePath,
      cv_file_name: cvFileName,
      education_summary: expert.educationSummary,
      general_experience_years: expert.generalExperienceYears || null,
      relevant_projects: expert.relevantProjects,
      country_experience: expert.countryExperience,
    });
    if (expertError) throw expertError;
  }

  return application;
}

export async function updateApplicationStatus(applicationId, status) {
  const { error } = await supabase.from('applications').update({ status }).eq('id', applicationId);
  if (error) throw error;
}

export function getDocumentFileUrl(filePath) {
  if (!filePath) return null;
  const { data } = supabase.storage.from('application-docs').getPublicUrl(filePath);
  return data.publicUrl;
}

// ============================================================
// AI-скоринг эксперта (вызывает Edge Function, ключ Anthropic на сервере)
// ============================================================

export async function requestAiScore(expert, position) {
  const response = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      expert: {
        fullName: expert.full_name,
        citizenship: expert.citizenship,
        educationSummary: expert.education_summary,
        generalExperienceYears: expert.general_experience_years,
        relevantProjects: expert.relevant_projects,
        countryExperience: expert.country_experience,
      },
      position: {
        name: expert.tender_positions.name,
        isInternational: expert.tender_positions.is_international,
        criterionA: {
          label: expert.tender_positions.criterion_a_label,
          weight: expert.tender_positions.criterion_a_weight,
          requirement: expert.tender_positions.criterion_a_requirement,
        },
        criterionB: {
          label: expert.tender_positions.criterion_b_label,
          weight: expert.tender_positions.criterion_b_weight,
          requirement: expert.tender_positions.criterion_b_requirement,
        },
        criterionC: {
          label: expert.tender_positions.criterion_c_label,
          weight: expert.tender_positions.criterion_c_weight,
          requirement: expert.tender_positions.criterion_c_requirement,
        },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI scoring failed: ${text}`);
  }

  return response.json();
}

export async function saveExpertScore(applicationExpertId, criterion, rating, justification, source, reviewedBy = null) {
  const { error } = await supabase.from('expert_scores').upsert(
    {
      application_expert_id: applicationExpertId,
      criterion,
      rating,
      justification,
      source,
      reviewed_by: reviewedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'application_expert_id,criterion' }
  );
  if (error) throw error;
}

export async function setExpertDisqualification(applicationExpertId, reasonCode, reasonText, flaggedBy = null) {
  const { error } = await supabase.from('expert_disqualifications').upsert(
    { application_expert_id: applicationExpertId, reason_code: reasonCode, reason_text: reasonText, flagged_by: flaggedBy },
    { onConflict: 'application_expert_id' }
  );
  if (error) throw error;
}

export async function clearExpertDisqualification(applicationExpertId) {
  const { error } = await supabase.from('expert_disqualifications').delete().eq('application_expert_id', applicationExpertId);
  if (error) throw error;
}
