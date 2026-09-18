import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  fetchApplicantTypes, fetchRequiredDocumentTypes, fetchDisqualificationReasons,
  fetchTenders, createTender, getTenderJdUrl,
  fetchApplications, createApplication, updateApplicationStatus,
  getDocumentFileUrl, requestAiScore, saveExpertScore,
  setExpertDisqualification, clearExpertDisqualification,
} from './supabaseClient';

// ==================================================================
// Дизайн-токены
// ==================================================================

const T = {
  ink: '#161B22', ink2: '#3D4451', muted: '#767D8A', faint: '#A7ACB6',
  line: '#E4E1D9', lineStrong: '#CFCBC0', bg: '#F7F5F0', surface: '#FFFFFF',
  surfaceSunken: '#EFECE4', accent: '#1F3A5F', accentHover: '#16293F', accentSoft: '#E7EDF3',
  green: '#1D7A5C', greenSoft: '#E4F2EC', amber: '#9C6B0E', amberSoft: '#FBF0DC',
  red: '#B03A2E', redSoft: '#FBEAE7', purple: '#5B4E9C', purpleSoft: '#EDEAF7',
  radius: 10, radiusLg: 14, font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

function pillStyle(tone) {
  const map = {
    blue: { bg: T.accentSoft, text: T.accent }, green: { bg: T.greenSoft, text: T.green },
    red: { bg: T.redSoft, text: T.red }, amber: { bg: T.amberSoft, text: T.amber },
    purple: { bg: T.purpleSoft, text: T.purple }, gray: { bg: T.surfaceSunken, text: T.ink2 },
  };
  const c = map[tone] || map.gray;
  return { background: c.bg, color: c.text, fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 };
}

const cardStyle = { background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radiusLg, padding: '1.25rem 1.4rem' };
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${T.line}`, background: T.surface, fontSize: 14, color: T.ink, boxSizing: 'border-box', fontFamily: T.font };
const labelStyle = { fontSize: 12.5, color: T.ink2, marginBottom: 5, display: 'block', fontWeight: 600 };
const helpTextStyle = { fontSize: 12, color: T.muted, margin: '4px 0 0' };
const primaryBtn = { background: T.accent, color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.font };
const secondaryBtn = { background: T.surface, border: `1px solid ${T.lineStrong}`, color: T.ink, padding: '10px 18px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.font };
const ghostBtn = { background: 'transparent', border: 'none', color: T.ink2, padding: '8px 4px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.font };
const dangerBtn = { background: T.surface, border: `1px solid ${T.red}55`, color: T.red, padding: '10px 18px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.font };
const successBtn = { background: T.green, color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.font };
const addBtn = { border: `1px dashed ${T.lineStrong}`, background: 'transparent', borderRadius: 8, padding: '9px 14px', fontSize: 13, color: T.ink2, cursor: 'pointer', marginTop: 4, fontFamily: T.font, fontWeight: 600 };
const rowRemoveBtn = { border: 'none', background: 'transparent', borderRadius: 6, padding: '6px 8px', fontSize: 12, color: T.muted, cursor: 'pointer', fontFamily: T.font };
const aiBtn = { background: T.purpleSoft, border: `1px solid ${T.purple}44`, color: T.purple, padding: '8px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.font, display: 'inline-flex', alignItems: 'center', gap: 6 };

function Icon({ name, size = 16, color }) {
  return <i className={`ti ${name}`} style={{ fontSize: size, color, lineHeight: 1 }} aria-hidden="true" />;
}

function Section({ title, description, children }) {
  return (
    <div style={{ ...cardStyle, marginBottom: 14 }}>
      <h2 style={{ fontSize: 15.5, fontWeight: 700, margin: description ? '0 0 3px' : '0 0 14px', color: T.ink }}>{title}</h2>
      {description && <p style={{ fontSize: 12.5, color: T.muted, margin: '0 0 14px' }}>{description}</p>}
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return <h3 style={{ fontSize: 11.5, fontWeight: 700, color: T.muted, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{children}</h3>;
}

function Field({ label, children, error, full, hint }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : 'auto', marginBottom: 2 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && !error && <p style={helpTextStyle}>{hint}</p>}
      {error && <p style={{ fontSize: 12, color: T.red, margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="ti-alert-circle" size={13} />{error}</p>}
    </div>
  );
}

function PreviewField({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${T.line}`, fontSize: 13.5 }}>
      <span style={{ color: T.muted }}>{label}</span>
      <span style={{ color: T.ink, textAlign: 'right', maxWidth: '65%' }}>{value}</span>
    </div>
  );
}

function EmptyState({ icon, title, description, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: T.muted }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: T.surfaceSunken, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        <Icon name={icon} size={20} color={T.muted} />
      </div>
      <p style={{ fontSize: 14.5, fontWeight: 600, color: T.ink2, margin: '0 0 4px' }}>{title}</p>
      <p style={{ fontSize: 13, margin: '0 0 16px', maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>{description}</p>
      {action}
    </div>
  );
}

function Spinner({ size = 16, color }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, border: `2px solid ${color || T.muted}33`,
      borderTopColor: color || T.muted, borderRadius: '50%', animation: 'ats-spin 0.7s linear infinite',
    }} />
  );
}

function PageLoading({ label = 'Загрузка…' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '80px 0', color: T.muted }}>
      <Spinner size={18} /> <span style={{ fontSize: 14 }}>{label}</span>
    </div>
  );
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div style={{ background: T.redSoft, border: `1px solid ${T.red}33`, borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="ti-alert-triangle" size={16} color={T.red} />
        <span style={{ fontSize: 13, color: T.red }}>{message}</span>
      </div>
      {onRetry && <button onClick={onRetry} style={{ ...ghostBtn, color: T.red, padding: '4px 8px' }}>Повторить</button>}
    </div>
  );
}

// ==================================================================
// Главный компонент
// ==================================================================

function App() {
  const [role, setRole] = useState('applicant');
  const [applicantTypes, setApplicantTypes] = useState([]);
  const [requiredDocTypes, setRequiredDocTypes] = useState([]);
  const [disqReasons, setDisqReasons] = useState([]);
  const [tenders, setTenders] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [toast, setToast] = useState(null);

  async function loadAll() {
    setLoading(true);
    setLoadError(null);
    try {
      const [types, docTypes, reasons, tenderList, appList] = await Promise.all([
        fetchApplicantTypes(), fetchRequiredDocumentTypes(), fetchDisqualificationReasons(),
        fetchTenders(), fetchApplications(),
      ]);
      setApplicantTypes(types);
      setRequiredDocTypes(docTypes);
      setDisqReasons(reasons);
      setTenders(tenderList);
      setApplications(appList);
    } catch (err) {
      setLoadError(err.message || 'Не удалось загрузить данные из базы');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  function showToast(message, tone = 'default') {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 3200);
  }

  // Хелперы поиска в справочниках
  const applicantTypeByKey = useMemo(() => {
    const map = {};
    applicantTypes.forEach((t) => { map[t.key] = t; });
    return map;
  }, [applicantTypes]);

  const requiredDocsByType = useMemo(() => {
    const map = {};
    requiredDocTypes.forEach((d) => {
      if (!map[d.applicant_type_key]) map[d.applicant_type_key] = [];
      map[d.applicant_type_key].push(d.doc_name);
    });
    return map;
  }, [requiredDocTypes]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, fontFamily: T.font, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PageLoading label="Подключение к базе данных…" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, fontFamily: T.font, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <Icon name="ti-database-off" size={32} color={T.red} />
          <p style={{ fontSize: 15, fontWeight: 700, margin: '14px 0 6px', color: T.ink }}>Не удалось подключиться к базе</p>
          <p style={{ fontSize: 13, color: T.muted, margin: '0 0 16px' }}>{loadError}</p>
          <button onClick={loadAll} style={primaryBtn}>Попробовать снова</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: T.font, display: 'flex' }}>
      <style>{`
        input:focus, select:focus, textarea:focus { outline: none; border-color: ${T.accent} !important; box-shadow: 0 0 0 3px ${T.accentSoft}; }
        button { transition: opacity .12s, background .12s; }
        button:hover { opacity: 0.88; }
        button:active { opacity: 0.75; }
        * { box-sizing: border-box; }
        ::placeholder { color: ${T.faint}; }
        @keyframes ats-spin { to { transform: rotate(360deg); } }
      `}</style>
      <Sidebar role={role} setRole={setRole} />
      {toast && <Toast message={toast.message} tone={toast.tone} />}
      <div style={{ flex: 1, padding: '32px 40px', maxWidth: 1140 }}>
        {role === 'applicant' ? (
          <ApplicantArea
            tenders={tenders} applications={applications} applicantTypeByKey={applicantTypeByKey}
            requiredDocsByType={requiredDocsByType} showToast={showToast} reloadApplications={loadAll}
          />
        ) : (
          <HRArea
            tenders={tenders} applications={applications} applicantTypeByKey={applicantTypeByKey}
            requiredDocsByType={requiredDocsByType} disqReasons={disqReasons}
            showToast={showToast} reloadAll={loadAll}
          />
        )}
      </div>
    </div>
  );
}

function Sidebar({ role, setRole }) {
  return (
    <div style={{ width: 232, flexShrink: 0, borderRight: `1px solid ${T.line}`, background: T.surface, padding: '22px 16px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px', marginBottom: 28 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: T.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>KJ</div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: T.ink }}>kazAvtoJol</p>
          <p style={{ margin: 0, fontSize: 11, color: T.muted }}>Система отбора заявок</p>
        </div>
      </div>
      <p style={{ fontSize: 11, fontWeight: 700, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 8px 8px' }}>Режим просмотра</p>
      <NavButton active={role === 'applicant'} onClick={() => setRole('applicant')} icon="ti-file-text" label="Кабинет заявителя" />
      <NavButton active={role === 'hr'} onClick={() => setRole('hr')} icon="ti-briefcase" label="Кабинет HR" />
      <div style={{ marginTop: 'auto', padding: '12px 8px 0', borderTop: `1px solid ${T.line}` }}>
        <p style={{ fontSize: 11, color: T.faint, margin: '12px 0 0', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="ti-database" size={12} color={T.faint} /> Данные хранятся в базе Supabase
        </p>
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: 'none', background: active ? T.accentSoft : 'transparent', color: active ? T.accent : T.ink2, padding: '10px 10px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', marginBottom: 2, fontFamily: T.font }}>
      <Icon name={icon} size={17} color={active ? T.accent : T.muted} /> {label}
    </button>
  );
}

function Toast({ message, tone }) {
  const colors = { default: T.ink, danger: T.red, success: T.green };
  return (
    <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: colors[tone] || T.ink, color: '#fff', padding: '11px 20px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, zIndex: 1000, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon name="ti-check" size={16} color="#fff" /> {message}
    </div>
  );
}

function PageHeader({ title, description, action }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 23, fontWeight: 700, margin: '0 0 5px', color: T.ink }}>{title}</h1>
        {description && <p style={{ fontSize: 13.5, color: T.muted, margin: 0, maxWidth: 560 }}>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function BackLink({ onClick, label }) {
  return (
    <button onClick={onClick} style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 18, padding: 0 }}>
      <Icon name="ti-arrow-left" size={15} /> {label}
    </button>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU');
}

function fmtBytes(kb) {
  if (!kb) return '';
  if (kb < 1024) return `${kb} КБ`;
  return `${(kb / 1024).toFixed(1)} МБ`;
}

// ==================================================================
// КАБИНЕТ ЗАЯВИТЕЛЯ
// ==================================================================

function ApplicantArea({ tenders, applications, applicantTypeByKey, requiredDocsByType, showToast, reloadApplications }) {
  const [screen, setScreen] = useState('tenders');
  const [activeTenderId, setActiveTenderId] = useState(null);

  const activeTender = tenders.find((t) => t.id === activeTenderId);
  const openTenders = tenders.filter((t) => t.status === 'open');

  function startApplication(tenderId) {
    setActiveTenderId(tenderId);
    setScreen('form');
  }

  async function handleSubmitted() {
    showToast('Заявка отправлена и передана на рассмотрение', 'success');
    await reloadApplications();
    setScreen('myApps');
  }

  if (screen === 'myApps') {
    return <MyApplications applications={applications} tenders={tenders} applicantTypeByKey={applicantTypeByKey} onBack={() => setScreen('tenders')} onNew={() => setScreen('tenders')} />;
  }
  if (screen === 'form' && activeTender) {
    return (
      <ApplicationForm
        tender={activeTender} applicantType={applicantTypeByKey[activeTender.applicant_type_key]}
        requiredDocs={activeTender.tender_required_documents?.length ? activeTender.tender_required_documents.map((d) => d.doc_name) : requiredDocsByType[activeTender.applicant_type_key] || []}
        onCancel={() => { setScreen('tenders'); setActiveTenderId(null); }}
        onSubmitted={handleSubmitted} showToast={showToast}
      />
    );
  }
  return <TenderList tenders={openTenders} applications={applications} applicantTypeByKey={applicantTypeByKey} onApply={startApplication} onViewMyApps={() => setScreen('myApps')} />;
}

function TenderList({ tenders, applications, applicantTypeByKey, onApply, onViewMyApps }) {
  return (
    <div>
      <PageHeader
        title="Открытые тендеры и вакансии"
        description="Заявка принимается только через форму ниже — загрузка файла резюме произвольного формата не поддерживается."
        action={<button onClick={onViewMyApps} style={secondaryBtn}><Icon name="ti-list-details" size={15} /> Мои заявки ({applications.length})</button>}
      />

      {tenders.length === 0 ? (
        <EmptyState icon="ti-inbox" title="Открытых тендеров нет" description="В данный момент нет активных тендеров или вакансий." />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {tenders.map((t) => {
            const type = applicantTypeByKey[t.applicant_type_key];
            if (!type) return null;
            const count = applications.filter((a) => a.tender_id === t.id).length;
            const positions = t.tender_positions || [];
            const jdUrl = getTenderJdUrl(t.jd_file_path);
            return (
              <div key={t.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={pillStyle('blue')}><Icon name={type.icon} size={12} />{type.label}</span>
                      <span style={{ fontSize: 12, color: T.faint }}>· опубликован {fmtDate(t.created_at)}</span>
                    </div>
                    <h3 style={{ fontSize: 16.5, fontWeight: 700, margin: '0 0 8px', color: T.ink }}>{t.title}</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', fontSize: 13, color: T.ink2, marginBottom: jdUrl ? 8 : 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="ti-list-numbers" size={14} color={T.muted} />{positions.length} {positions.length === 1 ? 'позиция' : 'позиций'} в команде</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="ti-users" size={14} color={T.muted} />{count} {count === 1 ? 'заявка' : 'заявок'}</span>
                    </div>
                    {jdUrl && (
                      <a href={jdUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: T.accent, display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
                        <Icon name="ti-file-description" size={14} /> Скачать полное ТЗ (PDF)
                      </a>
                    )}
                  </div>
                  <button onClick={() => onApply(t.id)} style={{ ...primaryBtn, flexShrink: 0 }}>Подать заявку</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MyApplications({ applications, tenders, applicantTypeByKey, onBack, onNew }) {
  return (
    <div>
      <BackLink onClick={onBack} label="К списку тендеров" />
      <PageHeader title="Мои заявки" description={`Всего подано: ${applications.length}`} />

      {applications.length === 0 ? (
        <EmptyState icon="ti-file-off" title="Заявок пока нет" description="Выберите тендер из списка и заполните форму, чтобы подать первую заявку." action={<button onClick={onNew} style={primaryBtn}>Смотреть тендеры</button>} />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {applications.map((a) => {
            const tender = tenders.find((t) => t.id === a.tender_id);
            const type = applicantTypeByKey[a.applicant_type_key];
            const statusInfo = { submitted: { label: 'На рассмотрении', tone: 'gray' }, approved: { label: 'Одобрено', tone: 'green' }, declined: { label: 'Отклонено', tone: 'red' } }[a.status];
            return (
              <div key={a.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      {type && <Icon name={type.icon} size={15} color={T.muted} />}
                      <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: T.ink }}>{a.full_name}</p>
                    </div>
                    <p style={{ margin: 0, fontSize: 12.5, color: T.muted }}>{tender?.title} · подана {fmtDate(a.submitted_at)}</p>
                  </div>
                  <span style={pillStyle(statusInfo.tone)}>{statusInfo.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==================================================================
// Форма подачи заявки
// ==================================================================

const emptyPersonal = { fullName: '', email: '', phone: '', address: '', citizenship: 'Kazakhstan', firmName: '' };

function emptyExpertForPosition(position) {
  return {
    tenderPositionId: position.id, positionName: position.name,
    fullName: '', citizenship: '', educationSummary: '', generalExperienceYears: '',
    relevantProjects: '', countryExperience: '', cvFile: null,
  };
}

const FORM_STEPS = ['Данные заявителя', 'Эксперты по позициям', 'Документы'];

function ApplicationForm({ tender, applicantType, requiredDocs, onCancel, onSubmitted, showToast }) {
  const [step, setStep] = useState(0);
  const [personal, setPersonal] = useState({ ...emptyPersonal });
  const positions = tender.tender_positions || [];
  const [experts, setExperts] = useState(positions.map(emptyExpertForPosition));
  const [documents, setDocuments] = useState([]); // [{ docName, file }]
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  function updatePersonal(field, value) { setPersonal((p) => ({ ...p, [field]: value })); }
  function updateExpert(index, field, value) {
    setExperts((prev) => { const next = [...prev]; next[index] = { ...next[index], [field]: value }; return next; });
  }
  function addDocument(doc) { setDocuments((prev) => [...prev.filter((d) => d.docName !== doc.docName), doc]); }
  function removeDocument(docName) { setDocuments((prev) => prev.filter((d) => d.docName !== docName)); }

  function validateStep(i) {
    const errs = {};
    if (i === 0) {
      if (!personal.fullName.trim()) errs.fullName = applicantType.is_firm ? 'Укажите название фирмы' : 'Укажите ФИО';
      if (!personal.email.trim()) errs.email = 'Укажите email';
    }
    if (i === 1) {
      experts.forEach((e, idx) => {
        if (!e.fullName.trim()) errs[`expert_${idx}_name`] = 'Укажите ФИО эксперта';
        if (!e.generalExperienceYears) errs[`expert_${idx}_years`] = 'Укажите стаж';
      });
    }
    if (i === 2) {
      const uploadedNames = documents.map((d) => d.docName);
      const missing = requiredDocs.filter((d) => !uploadedNames.includes(d));
      if (missing.length > 0) errs.documents = `Загрузите все обязательные документы (не хватает: ${missing.join(', ')})`;
    }
    return errs;
  }

  async function goNext() {
    const errs = validateStep(step);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (step < FORM_STEPS.length - 1) { setStep(step + 1); return; }

    // Финальный шаг — отправка
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createApplication({
        tenderId: tender.id, applicantTypeKey: tender.applicant_type_key,
        personal, documents, experts,
      });
      await onSubmitted();
    } catch (err) {
      setSubmitError(err.message || 'Не удалось отправить заявку. Проверьте соединение и попробуйте снова.');
    } finally {
      setSubmitting(false);
    }
  }

  function goToStep(i) {
    if (i < step) { setStep(i); return; }
    const errs = validateStep(step);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setStep(i);
  }

  return (
    <div style={{ maxWidth: 780 }}>
      <BackLink onClick={onCancel} label="Отменить и вернуться к тендерам" />
      <p style={{ fontSize: 12.5, color: T.faint, margin: '0 0 4px', fontWeight: 600 }}>{tender.title}</p>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: T.ink }}>Заявка — {applicantType.label}</h1>
      <p style={{ fontSize: 13.5, color: T.muted, margin: '0 0 22px' }}>
        {applicantType.is_firm ? 'Заполняется от имени фирмы или организации.' : 'Заполняется индивидуально, от физического лица.'}
      </p>

      <Stepper steps={FORM_STEPS} current={step} onStepClick={goToStep} />

      <div style={{ marginTop: 20 }}>
        {step === 0 && (
          <Section title="Данные заявителя">
            <div style={grid2}>
              <Field label={applicantType.is_firm ? 'Название фирмы' : 'ФИО'} error={errors.fullName}>
                <input style={inputStyle} value={personal.fullName} onChange={(e) => updatePersonal('fullName', e.target.value)} placeholder={applicantType.is_firm ? 'ТОО «Пример»' : 'Иванов Иван Иванович'} />
              </Field>
              <Field label="Гражданство / страна регистрации">
                <input style={inputStyle} value={personal.citizenship} onChange={(e) => updatePersonal('citizenship', e.target.value)} />
              </Field>
              <Field label="Адрес" full>
                <input style={inputStyle} value={personal.address} onChange={(e) => updatePersonal('address', e.target.value)} />
              </Field>
              <Field label="Email" error={errors.email}>
                <input type="email" style={inputStyle} value={personal.email} onChange={(e) => updatePersonal('email', e.target.value)} placeholder="name@company.kz" />
              </Field>
              <Field label="Телефон">
                <input style={inputStyle} value={personal.phone} onChange={(e) => updatePersonal('phone', e.target.value)} placeholder="+7..." />
              </Field>
            </div>
          </Section>
        )}

        {step === 1 && (
          <Section title="Эксперты по позициям тендера" description="Для каждой позиции в команде предложите одного эксперта и опишите его квалификацию.">
            {positions.length === 0 ? (
              <p style={{ fontSize: 13, color: T.faint }}>В этом тендере не заданы позиции.</p>
            ) : (
              experts.map((expert, idx) => {
                const position = positions[idx];
                return (
                  <div key={position.id} style={{ marginBottom: 18, paddingBottom: 18, borderBottom: idx < experts.length - 1 ? `1px solid ${T.line}` : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={pillStyle(position.is_international ? 'purple' : 'blue')}>{position.is_international ? 'Международный' : 'Национальный'}</span>
                      <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: T.ink }}>{position.name}</p>
                    </div>
                    <div style={grid2}>
                      <Field label="ФИО эксперта" error={errors[`expert_${idx}_name`]}>
                        <input style={inputStyle} value={expert.fullName} onChange={(e) => updateExpert(idx, 'fullName', e.target.value)} />
                      </Field>
                      <Field label="Гражданство">
                        <input style={inputStyle} value={expert.citizenship} onChange={(e) => updateExpert(idx, 'citizenship', e.target.value)} />
                      </Field>
                      <Field label="Образование (кратко)" full>
                        <input style={inputStyle} value={expert.educationSummary} onChange={(e) => updateExpert(idx, 'educationSummary', e.target.value)} placeholder="Степень, ВУЗ, год" />
                      </Field>
                      <Field label="Общий стаж, лет" error={errors[`expert_${idx}_years`]}>
                        <input type="number" style={inputStyle} value={expert.generalExperienceYears} onChange={(e) => updateExpert(idx, 'generalExperienceYears', e.target.value)} />
                      </Field>
                      <Field label="CV эксперта (файл, опционально)">
                        <input type="file" accept=".pdf,.doc,.docx" style={{ ...inputStyle, padding: 7 }} onChange={(e) => updateExpert(idx, 'cvFile', e.target.files?.[0] || null)} />
                      </Field>
                      <Field label="Релевантные проекты" full hint="Опишите проекты, подтверждающие соответствие критерию B (опыт и специализация)">
                        <textarea style={{ ...inputStyle, minHeight: 64 }} value={expert.relevantProjects} onChange={(e) => updateExpert(idx, 'relevantProjects', e.target.value)} />
                      </Field>
                      <Field label="Опыт в РК / с международными организациями" full hint="Критерий C — страновой или международный опыт">
                        <textarea style={{ ...inputStyle, minHeight: 54 }} value={expert.countryExperience} onChange={(e) => updateExpert(idx, 'countryExperience', e.target.value)} />
                      </Field>
                    </div>
                  </div>
                );
              })
            )}
          </Section>
        )}

        {step === 2 && (
          <Section title="Документы" description={`Обязательные документы для категории «${applicantType.label}»`}>
            <DocumentUploader requiredDocs={requiredDocs} documents={documents} onAdd={addDocument} onRemove={removeDocument} error={errors.documents} />
          </Section>
        )}
      </div>

      {submitError && <ErrorBanner message={submitError} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <button onClick={() => (step === 0 ? onCancel() : setStep(step - 1))} style={secondaryBtn} disabled={submitting}>
          {step === 0 ? 'Отменить' : '← Назад'}
        </button>
        <button onClick={goNext} style={primaryBtn} disabled={submitting}>
          {submitting ? <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Spinner size={14} color="#fff" /> Отправка…</span> : step === FORM_STEPS.length - 1 ? 'Отправить заявку' : 'Далее'}
        </button>
      </div>
    </div>
  );
}

function Stepper({ steps, current, onStepClick }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <button onClick={() => onStepClick(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontFamily: T.font }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, background: i <= current ? T.accent : T.surfaceSunken, color: i <= current ? '#fff' : T.faint }}>
              {i < current ? <Icon name="ti-check" size={14} color="#fff" /> : i + 1}
            </div>
            <span style={{ fontSize: 13, fontWeight: i === current ? 700 : 500, color: i === current ? T.ink : T.muted, whiteSpace: 'nowrap' }}>{s}</span>
          </button>
          {i < steps.length - 1 && <div style={{ flex: 1, height: 1, background: i < current ? T.accent : T.line, margin: '0 10px', minWidth: 16 }} />}
        </React.Fragment>
      ))}
    </div>
  );
}

// ---- Загрузка документов ----

function DocumentUploader({ requiredDocs, documents, onAdd, onRemove, error }) {
  const inputRefs = useRef({});

  function handleFile(docName, file) {
    if (!file) return;
    onAdd({ docName, file });
  }

  function handleDrop(e, docName) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(docName, file);
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: T.muted, margin: '0 0 14px' }}>
        Загрузите файл для каждого документа (PDF, JPG или PNG, до 10 МБ). Заявку нельзя отправить, пока все обязательные документы не загружены.
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        {requiredDocs.map((docName) => {
          const uploaded = documents.find((d) => d.docName === docName);
          return (
            <div key={docName}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{docName}</span>
                <span style={{ fontSize: 11, color: T.red, fontWeight: 600 }}>обязательно</span>
              </div>
              {uploaded ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${T.green}44`, background: T.greenSoft, borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Icon name="ti-file-check" size={18} color={T.green} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{uploaded.file.name}</p>
                      <p style={{ margin: 0, fontSize: 11.5, color: T.muted }}>{fmtBytes(Math.round(uploaded.file.size / 1024))} · будет загружено при отправке</p>
                    </div>
                  </div>
                  <button onClick={() => onRemove(docName)} style={{ ...rowRemoveBtn, flexShrink: 0 }} aria-label={`Удалить ${docName}`}><Icon name="ti-x" size={16} /></button>
                </div>
              ) : (
                <div
                  onClick={() => inputRefs.current[docName]?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = T.accentSoft; }}
                  onDragLeave={(e) => { e.currentTarget.style.borderColor = T.lineStrong; e.currentTarget.style.background = T.surface; }}
                  onDrop={(e) => handleDrop(e, docName)}
                  style={{ border: `1.5px dashed ${error ? T.red : T.lineStrong}`, borderRadius: 8, padding: '14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: T.surface }}
                >
                  <Icon name="ti-cloud-upload" size={18} color={T.muted} />
                  <span style={{ fontSize: 13, color: T.muted }}>Перетащите файл сюда или <span style={{ color: T.accent, fontWeight: 600 }}>выберите на устройстве</span></span>
                  <input ref={(el) => (inputRefs.current[docName] = el)} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={(e) => handleFile(docName, e.target.files?.[0])} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && <p style={{ fontSize: 12, color: T.red, margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="ti-alert-circle" size={13} />{error}</p>}
    </div>
  );
}

// ==================================================================
// КАБИНЕТ HR
// ==================================================================

function HRArea({ tenders, applications, applicantTypeByKey, requiredDocsByType, disqReasons, showToast, reloadAll }) {
  const [screen, setScreen] = useState('dashboard');
  const [selectedTenderId, setSelectedTenderId] = useState(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);
  const [cameFrom, setCameFrom] = useState('dashboard');

  const filteredApps = selectedTenderId ? applications.filter((a) => a.tender_id === selectedTenderId) : applications;

  const scored = useMemo(() => {
    return filteredApps.map((a) => {
      const tender = tenders.find((t) => t.id === a.tender_id);
      const result = computeApplicationScore(a, tender);
      return { application: a, tender, result };
    }).sort((x, y) => y.result.total - x.result.total);
  }, [filteredApps, tenders]);

  const selectedApp = applications.find((a) => a.id === selectedApplicationId);
  const selectedAppTender = selectedApp ? tenders.find((t) => t.id === selectedApp.tender_id) : null;

  function openDetail(id, from) { setSelectedApplicationId(id); setCameFrom(from); setScreen('detail'); }

  if (screen === 'newTender') {
    return (
      <NewTenderForm
        applicantTypeByKey={applicantTypeByKey} requiredDocsByType={requiredDocsByType}
        onCancel={() => setScreen('dashboard')}
        onCreated={async () => { await reloadAll(); showToast('Тендер опубликован', 'success'); setScreen('dashboard'); }}
      />
    );
  }
  if (screen === 'detail' && selectedApp) {
    const result = computeApplicationScore(selectedApp, selectedAppTender);
    return (
      <ApplicationDetail
        application={selectedApp} tender={selectedAppTender} result={result}
        applicantTypeByKey={applicantTypeByKey} disqReasons={disqReasons}
        onBack={() => setScreen(cameFrom)}
        onApprove={async () => { await updateApplicationStatus(selectedApp.id, 'approved'); await reloadAll(); showToast('Заявка одобрена', 'success'); }}
        onDecline={async () => { await updateApplicationStatus(selectedApp.id, 'declined'); await reloadAll(); showToast('Заявка отклонена', 'danger'); }}
        reloadAll={reloadAll} showToast={showToast}
      />
    );
  }
  if (screen === 'table') {
    return <TableView scored={scored} tenders={tenders} applicantTypeByKey={applicantTypeByKey} selectedTenderId={selectedTenderId} setSelectedTenderId={setSelectedTenderId} onOpenDetail={(id) => openDetail(id, 'table')} onBack={() => setScreen('dashboard')} />;
  }
  return (
    <Dashboard
      tenders={tenders} scored={scored} applicantTypeByKey={applicantTypeByKey}
      selectedTenderId={selectedTenderId} setSelectedTenderId={setSelectedTenderId}
      onNewTender={() => setScreen('newTender')} onOpenTable={() => setScreen('table')} onOpenDetail={(id) => openDetail(id, 'dashboard')}
    />
  );
}

// ---- Скоринг заявки на основе позиций/экспертов/оценок из базы ----

function computeApplicationScore(application, tender) {
  const experts = application.application_experts || [];
  const requiredDocs = (tender?.tender_required_documents || []).map((d) => d.doc_name);
  const uploadedDocs = (application.application_documents || []).map((d) => d.doc_name);
  const missingDocs = requiredDocs.filter((d) => !uploadedDocs.includes(d));
  const docsOk = missingDocs.length === 0;

  const positions = tender?.tender_positions || [];
  const totalWeight = positions.reduce((s, p) => s + (p.weight || 0), 0) || 1;

  let weightedSum = 0;
  const expertResults = experts.map((expert) => {
    const position = expert.tender_positions;
    const scores = expert.expert_scores || [];
    const disq = expert.expert_disqualifications?.[0] || null;

    const byLetter = {};
    scores.forEach((s) => { byLetter[s.criterion] = s; });

    const a = byLetter.A?.rating ?? 0;
    const b = byLetter.B?.rating ?? 0;
    const c = byLetter.C?.rating ?? 0;
    const wA = position?.criterion_a_weight ?? 0.15;
    const wB = position?.criterion_b_weight ?? 0.70;
    const wC = position?.criterion_c_weight ?? 0.15;

    const rawScore = disq ? 0 : (a * wA + b * wB + c * wC);
    const positionWeight = position?.weight || 0;
    const contributionToTotal = totalWeight > 0 ? (rawScore / 100) * positionWeight : 0;
    weightedSum += contributionToTotal;

    return { expert, position, scores: byLetter, rawScore, disqualified: !!disq, disqualification: disq, hasAnyScore: scores.length > 0 };
  });

  const personnelScore = Math.round(weightedSum);
  const allScored = expertResults.length > 0 && expertResults.every((e) => e.hasAnyScore);
  const anyDisqualified = expertResults.some((e) => e.disqualified);

  let tier;
  if (!docsOk || anyDisqualified) tier = { label: 'Не соответствует', tone: 'red' };
  else if (!allScored) tier = { label: 'Ожидает оценки', tone: 'gray' };
  else if (personnelScore >= (totalWeight * 0.8)) tier = { label: 'Рекомендован', tone: 'green' };
  else if (personnelScore >= (totalWeight * 0.55)) tier = { label: 'На рассмотрении', tone: 'amber' };
  else tier = { label: 'Низкий приоритет', tone: 'gray' };

  return { total: personnelScore, maxTotal: totalWeight, docsOk, missingDocs, expertResults, tier, allScored, anyDisqualified };
}

// ---- Дашборд ----

function Dashboard({ tenders, scored, applicantTypeByKey, selectedTenderId, setSelectedTenderId, onNewTender, onOpenTable, onOpenDetail }) {
  const total = scored.length;
  const avgScore = total > 0 ? Math.round(scored.reduce((s, x) => s + (x.result.total / (x.result.maxTotal || 1)) * 100, 0) / total) : 0;
  const passedCompliance = scored.filter((x) => x.result.docsOk && !x.result.anyDisqualified).length;
  const pendingCount = scored.filter((x) => x.application.status === 'submitted').length;

  return (
    <div>
      <PageHeader
        title="HR-дашборд"
        description="Одобрение и отклонение заявок доступно только из этого кабинета."
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onOpenTable} style={secondaryBtn}><Icon name="ti-table" size={15} /> Таблица</button>
            <button onClick={onNewTender} style={primaryBtn}><Icon name="ti-plus" size={15} /> Новый тендер</button>
          </div>
        }
      />
      <div style={{ marginBottom: 18, maxWidth: 340 }}>
        <label style={labelStyle}>Фильтр по тендеру</label>
        <select style={inputStyle} value={selectedTenderId || ''} onChange={(e) => setSelectedTenderId(e.target.value || null)}>
          <option value="">Все тендеры</option>
          {tenders.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: 26 }}>
        <MetricCard label="Всего заявок" value={total} icon="ti-files" />
        <MetricCard label="На рассмотрении" value={pendingCount} icon="ti-hourglass" />
        <MetricCard label="Средний балл" value={`${avgScore}%`} icon="ti-chart-bar" />
        <MetricCard label="Прошли compliance" value={`${passedCompliance} / ${total}`} icon="ti-shield-check" />
      </div>
      {scored.length === 0 ? (
        <EmptyState icon="ti-inbox" title="Заявок пока нет" description="По выбранному фильтру ни одна заявка не найдена. Попробуйте выбрать «Все тендеры»." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {scored.map(({ application, tender, result }) => (
            <ApplicationRow key={application.id} application={application} tender={tender} result={result} applicantTypeByKey={applicantTypeByKey} onClick={() => onOpenDetail(application.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApplicationRow({ application, tender, result, applicantTypeByKey, onClick }) {
  const type = applicantTypeByKey[application.applicant_type_key];
  const statusInfo = { submitted: { label: 'На рассмотрении', tone: 'gray' }, approved: { label: 'Одобрено', tone: 'green' }, declined: { label: 'Отклонено', tone: 'red' } }[application.status];
  const pct = result.maxTotal > 0 ? Math.round((result.total / result.maxTotal) * 100) : 0;
  return (
    <div onClick={onClick} style={{ ...cardStyle, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
            {type && <span style={pillStyle('blue')}><Icon name={type.icon} size={12} />{type.short_label}</span>}
            {application.status !== 'submitted' && <span style={pillStyle(statusInfo.tone)}>{statusInfo.label}</span>}
            <span style={{ fontSize: 12, color: T.faint }}>{tender?.title}</span>
          </div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.ink }}>{application.full_name}</p>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: T.muted }}>{(application.application_experts || []).length} эксперт(ов) · подана {fmtDate(application.submitted_at)}</p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: T.ink }}>{pct}%</p>
          <p style={{ margin: 0, fontSize: 10.5, color: T.faint }}>{result.total}/{result.maxTotal}</p>
        </div>
        <span style={{ ...pillStyle(result.tier.tone), flexShrink: 0 }}>{result.tier.label}</span>
        <Icon name="ti-chevron-right" size={18} color={T.faint} />
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radiusLg, padding: '1rem 1.1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Icon name={icon} size={14} color={T.muted} />
        <p style={{ fontSize: 12, color: T.muted, margin: 0, fontWeight: 600 }}>{label}</p>
      </div>
      <p style={{ fontSize: 25, fontWeight: 700, margin: 0, color: T.ink }}>{value}</p>
    </div>
  );
}

// ---- Табличный вид ----

function TableView({ scored, tenders, applicantTypeByKey, selectedTenderId, setSelectedTenderId, onOpenDetail, onBack }) {
  return (
    <div>
      <BackLink onClick={onBack} label="К дашборду" />
      <PageHeader
        title="Все заявки — таблица"
        action={
          <select style={{ ...inputStyle, width: 280 }} value={selectedTenderId || ''} onChange={(e) => setSelectedTenderId(e.target.value || null)}>
            <option value="">Все тендеры</option>
            {tenders.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        }
      />
      <div style={{ overflowX: 'auto', background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radiusLg }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: T.muted, borderBottom: `1px solid ${T.line}` }}>
              <th style={th}>Заявитель</th><th style={th}>Категория</th><th style={th}>Тендер</th>
              <th style={th}>Экспертов</th><th style={th}>Документы</th><th style={th}>Балл</th><th style={th}>Статус</th>
            </tr>
          </thead>
          <tbody>
            {scored.map(({ application, tender, result }) => {
              const type = applicantTypeByKey[application.applicant_type_key];
              const pct = result.maxTotal > 0 ? Math.round((result.total / result.maxTotal) * 100) : 0;
              return (
                <tr key={application.id} onClick={() => onOpenDetail(application.id)} style={{ borderBottom: `1px solid ${T.line}`, cursor: 'pointer' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{application.full_name}</td>
                  <td style={td}>{type?.short_label}</td>
                  <td style={td}>{tender?.title}</td>
                  <td style={td}>{(application.application_experts || []).length}</td>
                  <td style={td}>{result.docsOk ? <span style={{ color: T.green }}>Полный</span> : <span style={{ color: T.red }}>Неполный пакет</span>}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{pct}%</td>
                  <td style={td}><span style={pillStyle(result.tier.tone)}>{result.tier.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {scored.length === 0 && <p style={{ padding: 20, color: T.muted, fontSize: 14 }}>Нет данных.</p>}
      </div>
    </div>
  );
}

const th = { padding: '10px 12px', fontWeight: 500 };
const td = { padding: '10px 12px' };

// ==================================================================
// Создание тендера
// ==================================================================

function emptyPosition() {
  return {
    id: `tmp_${Date.now()}_${Math.random()}`, name: '', isInternational: true, weight: 100,
    criterionA: { label: 'General Qualification', weight: 0.15, requirement: '' },
    criterionB: { label: 'Experience and specialization', weight: 0.70, requirement: '' },
    criterionC: { label: 'Overseas/Country experience', weight: 0.15, requirement: '' },
  };
}

function NewTenderForm({ applicantTypeByKey, requiredDocsByType, onCancel, onCreated }) {
  const [title, setTitle] = useState('');
  const [applicantTypeKey, setApplicantTypeKey] = useState('contractor');
  const [positions, setPositions] = useState([emptyPosition()]);
  const [requiredDocs, setRequiredDocs] = useState([]);
  const [newDocName, setNewDocName] = useState('');
  const [jdFile, setJdFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [docsInitialized, setDocsInitialized] = useState(false);

  // При выборе категории подставляем дефолтный список документов, который HR может редактировать
  useEffect(() => {
    if (!docsInitialized && requiredDocsByType[applicantTypeKey]) {
      setRequiredDocs([...requiredDocsByType[applicantTypeKey]]);
      setDocsInitialized(true);
    }
  }, [applicantTypeKey, requiredDocsByType, docsInitialized]);

  function handleTypeChange(key) {
    setApplicantTypeKey(key);
    setRequiredDocs([...(requiredDocsByType[key] || [])]);
  }

  function updatePosition(index, field, value) {
    setPositions((prev) => { const next = [...prev]; next[index] = { ...next[index], [field]: value }; return next; });
  }
  function updateCriterion(index, letter, field, value) {
    setPositions((prev) => {
      const next = [...prev];
      const key = `criterion${letter}`;
      next[index] = { ...next[index], [key]: { ...next[index][key], [field]: value } };
      return next;
    });
  }
  function addPosition() { setPositions((prev) => [...prev, emptyPosition()]); }
  function removePosition(index) { setPositions((prev) => prev.filter((_, i) => i !== index)); }

  function addRequiredDoc() {
    const name = newDocName.trim();
    if (!name || requiredDocs.includes(name)) return;
    setRequiredDocs((prev) => [...prev, name]);
    setNewDocName('');
  }
  function removeRequiredDoc(name) { setRequiredDocs((prev) => prev.filter((d) => d !== name)); }

  async function submit() {
    const errs = {};
    if (!title.trim()) errs.title = 'Укажите название';
    if (positions.length === 0) errs.positions = 'Добавьте хотя бы одну позицию';
    positions.forEach((p, i) => {
      if (!p.name.trim()) errs[`position_${i}_name`] = 'Укажите название позиции';
    });
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await createTender({ title, applicantTypeKey, positions, requiredDocs, jdFile });
      await onCreated();
    } catch (err) {
      setSubmitError(err.message || 'Не удалось создать тендер. Проверьте соединение и попробуйте снова.');
    } finally {
      setSubmitting(false);
    }
  }

  const applicantType = applicantTypeByKey[applicantTypeKey];

  return (
    <div style={{ maxWidth: 760 }}>
      <BackLink onClick={onCancel} label="Отменить" />
      <PageHeader title="Новый тендер или вакансия" description="Позиции и критерии используются для автоматического AI-скоринга поданных заявок." />

      <Section title="Основные данные">
        <Field label="Название" error={errors.title} full>
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Строительный надзор — мостовой переход Кызылорда" />
        </Field>
        <div style={{ ...grid2, marginTop: 14 }}>
          <Field label="Категория заявителя">
            <select style={inputStyle} value={applicantTypeKey} onChange={(e) => handleTypeChange(e.target.value)}>
              {Object.values(applicantTypeByKey).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Техническое задание (JD), PDF" hint="Заявители смогут скачать этот файл целиком">
            <input type="file" accept=".pdf,.doc,.docx" style={{ ...inputStyle, padding: 7 }} onChange={(e) => setJdFile(e.target.files?.[0] || null)} />
          </Field>
        </div>
      </Section>

      <Section title="Позиции в команде" description="Каждая позиция имеет свои критерии оценки A (квалификация) / B (опыт) / C (страновой опыт).">
        {positions.map((p, i) => (
          <div key={p.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < positions.length - 1 ? `1px solid ${T.line}` : 'none' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <Field label="Название позиции" error={errors[`position_${i}_name`]}>
                  <input style={inputStyle} value={p.name} onChange={(e) => updatePosition(i, 'name', e.target.value)} placeholder="Например: Team Leader / Project Manager" />
                </Field>
              </div>
              <div style={{ width: 140 }}>
                <Field label="Вес позиции">
                  <input type="number" style={inputStyle} value={p.weight} onChange={(e) => updatePosition(i, 'weight', Number(e.target.value))} />
                </Field>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.ink2, paddingBottom: 10, whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={p.isInternational} onChange={(e) => updatePosition(i, 'isInternational', e.target.checked)} /> Международный
              </label>
              {positions.length > 1 && <button onClick={() => removePosition(i)} style={{ ...rowRemoveBtn, paddingBottom: 10 }}><Icon name="ti-trash" size={16} /></button>}
            </div>

            <CriterionEditor letter="A" criterion={p.criterionA} onChange={(field, value) => updateCriterion(i, 'A', field, value)} />
            <CriterionEditor letter="B" criterion={p.criterionB} onChange={(field, value) => updateCriterion(i, 'B', field, value)} />
            <CriterionEditor letter="C" criterion={p.criterionC} onChange={(field, value) => updateCriterion(i, 'C', field, value)} />
          </div>
        ))}
        <button style={addBtn} onClick={addPosition}>+ Добавить позицию</button>
      </Section>

      <Section title="Обязательные документы" description="Дефолтный список подставлен по категории заявителя — отредактируйте под конкретный тендер.">
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          {requiredDocs.map((doc) => (
            <div key={doc} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: T.surfaceSunken, borderRadius: 8 }}>
              <span style={{ fontSize: 13.5, color: T.ink }}>{doc}</span>
              <button onClick={() => removeRequiredDoc(doc)} style={rowRemoveBtn}><Icon name="ti-x" size={15} /></button>
            </div>
          ))}
          {requiredDocs.length === 0 && <p style={{ fontSize: 13, color: T.faint, margin: 0 }}>Список документов пуст.</p>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={inputStyle} value={newDocName} onChange={(e) => setNewDocName(e.target.value)} placeholder="Например: Сертификат ISO 9001" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRequiredDoc(); } }} />
          <button onClick={addRequiredDoc} style={secondaryBtn}>Добавить</button>
        </div>
      </Section>

      {submitError && <ErrorBanner message={submitError} />}

      <button onClick={submit} style={{ ...primaryBtn, width: '100%', padding: '13px 20px', fontSize: 14.5 }} disabled={submitting}>
        {submitting ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Spinner size={14} color="#fff" /> Публикация…</span> : 'Опубликовать тендер'}
      </button>
    </div>
  );
}

function CriterionEditor({ letter, criterion, onChange }) {
  const colors = { A: 'blue', B: 'purple', C: 'amber' };
  return (
    <div style={{ marginBottom: 10, padding: 12, background: T.surfaceSunken, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={pillStyle(colors[letter])}>Критерий {letter}</span>
        <input
          style={{ ...inputStyle, flex: 1, background: T.surface }}
          value={criterion.label}
          onChange={(e) => onChange('label', e.target.value)}
          placeholder="Название критерия"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          <input
            type="number" min="0" max="100" style={{ ...inputStyle, width: 70, background: T.surface }}
            value={Math.round(criterion.weight * 100)}
            onChange={(e) => onChange('weight', Number(e.target.value) / 100)}
          />
          <span style={{ fontSize: 12.5, color: T.muted }}>%</span>
        </div>
      </div>
      <textarea
        style={{ ...inputStyle, minHeight: 54, background: T.surface }}
        value={criterion.requirement}
        onChange={(e) => onChange('requirement', e.target.value)}
        placeholder="Текст требования из ToR, например: «At least 15 years of experience in the roads sector…»"
      />
    </div>
  );
}

// ==================================================================
// Детальный просмотр заявки — AI-скоринг, документы, approve/decline
// ==================================================================

function ApplicationDetail({ application, tender, result, applicantTypeByKey, disqReasons, onBack, onApprove, onDecline, reloadAll, showToast }) {
  const type = applicantTypeByKey[application.applicant_type_key];
  const statusInfo = { submitted: { label: 'На рассмотрении', tone: 'gray' }, approved: { label: 'Одобрено', tone: 'green' }, declined: { label: 'Отклонено', tone: 'red' } }[application.status];
  const isPending = application.status === 'submitted';
  const pct = result.maxTotal > 0 ? Math.round((result.total / result.maxTotal) * 100) : 0;

  return (
    <div style={{ maxWidth: 960 }}>
      <BackLink onClick={onBack} label="Назад" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 16 }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            {type && <span style={pillStyle('blue')}><Icon name={type.icon} size={12} />{type.label}</span>}
            <span style={pillStyle(statusInfo.tone)}>{statusInfo.label}</span>
          </div>
          <h1 style={{ fontSize: 23, fontWeight: 700, margin: 0, color: T.ink }}>{application.full_name}</h1>
          <p style={{ fontSize: 13, color: T.muted, margin: '5px 0 0' }}>{tender?.title}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {isPending && (
            <>
              <button onClick={onDecline} style={dangerBtn}><Icon name="ti-x" size={15} /> Отклонить</button>
              <button onClick={onApprove} style={successBtn}><Icon name="ti-check" size={15} /> Одобрить</button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={cardStyle}>
            <SectionTitle>Данные заявителя</SectionTitle>
            <PreviewField label="Email" value={application.email} />
            <PreviewField label="Телефон" value={application.phone} />
            <PreviewField label="Адрес" value={application.address} />
            <PreviewField label="Гражданство" value={application.citizenship} />
          </div>

          <div style={cardStyle}>
            <SectionTitle>Документы</SectionTitle>
            <div style={{ display: 'grid', gap: 8 }}>
              {(application.application_documents || []).map((d) => (
                <a key={d.id} href={getDocumentFileUrl(d.file_path)} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: T.surfaceSunken, borderRadius: 8, textDecoration: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Icon name="ti-file-text" size={17} color={T.ink2} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.ink }}>{d.doc_name}</p>
                      <p style={{ margin: 0, fontSize: 11.5, color: T.muted }}>{d.file_name} · {fmtBytes(d.size_kb)}</p>
                    </div>
                  </div>
                  <Icon name="ti-external-link" size={15} color={T.accent} />
                </a>
              ))}
              {(application.application_documents || []).length === 0 && <p style={{ fontSize: 13, color: T.faint, margin: 0 }}>Документы не загружены.</p>}
            </div>
            {!result.docsOk && (
              <p style={{ fontSize: 12, color: T.red, margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon name="ti-alert-triangle" size={13} /> Не хватает: {result.missingDocs.join(', ')}
              </p>
            )}
          </div>

          <div>
            <SectionTitle>Эксперты и оценка по позициям</SectionTitle>
            <div style={{ display: 'grid', gap: 12 }}>
              {result.expertResults.map((er) => (
                <ExpertScoreCard key={er.expert.id} expertResult={er} disqReasons={disqReasons} reloadAll={reloadAll} showToast={showToast} />
              ))}
              {result.expertResults.length === 0 && <p style={{ fontSize: 13, color: T.faint }}>Эксперты не предложены.</p>}
            </div>
          </div>
        </div>

        <div>
          <div style={{ ...cardStyle, position: 'sticky', top: 20 }}>
            <p style={{ fontSize: 12.5, color: T.muted, margin: '0 0 4px', fontWeight: 600 }}>Итоговый балл (Personnel)</p>
            <p style={{ fontSize: 34, fontWeight: 700, margin: '0 0 4px', color: T.ink }}>{pct}%</p>
            <p style={{ fontSize: 12, color: T.faint, margin: '0 0 8px' }}>{result.total} из {result.maxTotal}</p>
            <span style={pillStyle(result.tier.tone)}>{result.tier.label}</span>

            <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
              {result.expertResults.map((er) => (
                <div key={er.expert.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ color: T.ink2, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{er.position?.name}</span>
                    <span style={{ fontWeight: 700, color: er.disqualified ? T.red : T.ink }}>{er.disqualified ? '0' : Math.round(er.rawScore)}</span>
                  </div>
                  <div style={{ height: 5, background: T.surfaceSunken, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${er.disqualified ? 100 : er.rawScore}%`, background: er.disqualified ? T.red : T.accent, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>

            {!result.docsOk && (
              <div style={{ marginTop: 16, padding: 11, background: T.redSoft, borderRadius: 8 }}>
                <p style={{ fontSize: 11.5, color: T.red, margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="ti-alert-triangle" size={13} /> Неполный пакет документов
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Карточка эксперта с AI-скорингом ----

function ExpertScoreCard({ expertResult, disqReasons, reloadAll, showToast }) {
  const { expert, position, scores, disqualified, disqualification } = expertResult;
  const [expanded, setExpanded] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [draftScores, setDraftScores] = useState(null); // { A: {rating, justification}, B: {...}, C: {...} }
  const [showDisqForm, setShowDisqForm] = useState(false);
  const [disqCode, setDisqCode] = useState(disqReasons[0]?.code || 1);

  const cvUrl = expert.cv_file_path ? getDocumentFileUrl(expert.cv_file_path) : null;

  async function runAiScore() {
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await requestAiScore(expert, position);
      setDraftScores(result);
      setExpanded(true);
    } catch (err) {
      setAiError(err.message || 'Не удалось получить оценку от AI. Проверьте, что Edge Function развёрнута и ключ Anthropic настроен.');
    } finally {
      setAiLoading(false);
    }
  }

  async function acceptScore(letter, rating, justification, source) {
    await saveExpertScore(expert.id, letter, rating, justification, source);
    await reloadAll();
    showToast(`Оценка по критерию ${letter} сохранена`, 'success');
  }

  async function handleDisqualify() {
    const reason = disqReasons.find((r) => r.code === disqCode);
    await setExpertDisqualification(expert.id, disqCode, reason?.reason_text || '');
    await reloadAll();
    showToast('Эксперт дисквалифицирован', 'danger');
    setShowDisqForm(false);
  }

  async function handleClearDisq() {
    await clearExpertDisqualification(expert.id);
    await reloadAll();
    showToast('Дисквалификация снята', 'success');
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={pillStyle(position?.is_international ? 'purple' : 'blue')}>{position?.is_international ? 'Межд.' : 'Нац.'}</span>
            <span style={{ fontSize: 12.5, color: T.muted }}>{position?.name}</span>
            {disqualified && <span style={pillStyle('red')}><Icon name="ti-ban" size={11} /> Дисквалифицирован</span>}
          </div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.ink }}>{expert.full_name}</p>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: T.muted }}>{expert.citizenship} · {expert.general_experience_years} лет общего стажа</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {cvUrl && <a href={cvUrl} target="_blank" rel="noopener noreferrer" style={{ ...secondaryBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', fontSize: 12.5 }}><Icon name="ti-file-text" size={14} /> CV</a>}
          {!disqualified ? (
            <button onClick={() => setShowDisqForm((v) => !v)} style={{ ...dangerBtn, padding: '7px 12px', fontSize: 12.5 }}>Дисквалифицировать</button>
          ) : (
            <button onClick={handleClearDisq} style={{ ...secondaryBtn, padding: '7px 12px', fontSize: 12.5 }}>Снять дисквалификацию</button>
          )}
        </div>
      </div>

      {showDisqForm && (
        <div style={{ marginTop: 12, padding: 12, background: T.redSoft, borderRadius: 8 }}>
          <label style={{ ...labelStyle, color: T.red }}>Причина дисквалификации (согласно ToR)</label>
          <select style={{ ...inputStyle, marginBottom: 8 }} value={disqCode} onChange={(e) => setDisqCode(Number(e.target.value))}>
            {disqReasons.map((r) => <option key={r.code} value={r.code}>{r.code}. {r.reason_text}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDisqualify} style={dangerBtn}>Подтвердить дисквалификацию</button>
            <button onClick={() => setShowDisqForm(false)} style={ghostBtn}>Отмена</button>
          </div>
        </div>
      )}

      {disqualified && (
        <p style={{ fontSize: 12.5, color: T.red, margin: '10px 0 0', padding: '8px 10px', background: T.redSoft, borderRadius: 6 }}>
          {disqualification.reason_text}
        </p>
      )}

      {!disqualified && (
        <div style={{ marginTop: 12 }}>
          {!expanded && !draftScores && (
            <button onClick={() => setExpanded(true)} style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 0' }}>
              <Icon name={expanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} /> Показать критерии оценки
            </button>
          )}

          {(expanded || draftScores) && (
            <div style={{ marginTop: 8 }}>
              {['A', 'B', 'C'].map((letter) => (
                <CriterionScoreRow
                  key={letter} letter={letter} position={position} savedScore={scores[letter]}
                  draftScore={draftScores?.[letter]} onAccept={(rating, justification, source) => acceptScore(letter, rating, justification, source)}
                />
              ))}

              {aiError && <ErrorBanner message={aiError} onRetry={runAiScore} />}

              <button onClick={runAiScore} style={{ ...aiBtn, marginTop: 4 }} disabled={aiLoading}>
                {aiLoading ? <Spinner size={13} color={T.purple} /> : <Icon name="ti-sparkles" size={14} />}
                {aiLoading ? 'AI оценивает…' : draftScores ? 'Запросить оценку заново' : 'Предложить оценку (AI)'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CriterionScoreRow({ letter, position, savedScore, draftScore, onAccept }) {
  const label = position?.[`criterion_${letter.toLowerCase()}_label`] || letter;
  const weight = position?.[`criterion_${letter.toLowerCase()}_weight`] ?? 0;
  const requirement = position?.[`criterion_${letter.toLowerCase()}_requirement`] || '';

  const [editing, setEditing] = useState(false);
  const [manualRating, setManualRating] = useState(savedScore?.rating ?? draftScore?.rating ?? 0);
  const [manualJustification, setManualJustification] = useState(savedScore?.justification ?? draftScore?.justification ?? '');

  const displayScore = savedScore || (draftScore ? { rating: draftScore.rating, justification: draftScore.justification, source: 'ai_pending' } : null);

  return (
    <div style={{ marginBottom: 12, padding: 12, background: T.surfaceSunken, borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>Критерий {letter}: {label} ({Math.round(weight * 100)}%)</span>
        {displayScore && (
          <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{displayScore.rating}</span>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: T.muted, margin: '0 0 8px', lineHeight: 1.4 }}>{requirement}</p>

      {displayScore?.source === 'ai_pending' && !editing && (
        <div style={{ background: T.purpleSoft, border: `1px solid ${T.purple}33`, borderRadius: 6, padding: 10, marginBottom: 8 }}>
          <p style={{ fontSize: 11, color: T.purple, fontWeight: 700, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="ti-sparkles" size={12} /> Предложено AI, требует утверждения</p>
          <p style={{ fontSize: 12.5, color: T.ink2, margin: 0, lineHeight: 1.5 }}>{displayScore.justification}</p>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={() => onAccept(displayScore.rating, displayScore.justification, 'ai')} style={{ ...secondaryBtn, padding: '6px 10px', fontSize: 12 }}>Утвердить как есть</button>
            <button onClick={() => { setManualRating(displayScore.rating); setManualJustification(displayScore.justification); setEditing(true); }} style={{ ...ghostBtn, padding: '6px 10px', fontSize: 12 }}>Изменить</button>
          </div>
        </div>
      )}

      {displayScore?.source === 'human' && !editing && (
        <div style={{ marginBottom: 8 }}>
          <p style={{ fontSize: 11, color: T.green, fontWeight: 700, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="ti-user-check" size={12} /> Утверждено комиссией</p>
          <p style={{ fontSize: 12.5, color: T.ink2, margin: 0, lineHeight: 1.5 }}>{displayScore.justification}</p>
          <button onClick={() => { setManualRating(displayScore.rating); setManualJustification(displayScore.justification); setEditing(true); }} style={{ ...ghostBtn, padding: '4px 0', fontSize: 12, marginTop: 4 }}>Изменить оценку</button>
        </div>
      )}

      {displayScore?.source === 'ai' && !editing && (
        <div style={{ marginBottom: 8 }}>
          <p style={{ fontSize: 11, color: T.green, fontWeight: 700, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="ti-user-check" size={12} /> AI-оценка, утверждена комиссией</p>
          <p style={{ fontSize: 12.5, color: T.ink2, margin: 0, lineHeight: 1.5 }}>{displayScore.justification}</p>
          <button onClick={() => { setManualRating(displayScore.rating); setManualJustification(displayScore.justification); setEditing(true); }} style={{ ...ghostBtn, padding: '4px 0', fontSize: 12, marginTop: 4 }}>Изменить оценку</button>
        </div>
      )}

      {!displayScore && !editing && (
        <button onClick={() => setEditing(true)} style={{ ...ghostBtn, padding: '4px 0', fontSize: 12.5 }}>Выставить балл вручную</button>
      )}

      {editing && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <input type="number" min="0" max="100" style={{ ...inputStyle, width: 80 }} value={manualRating} onChange={(e) => setManualRating(Number(e.target.value))} />
            <span style={{ fontSize: 12, color: T.muted }}>баллов из 100</span>
          </div>
          <textarea style={{ ...inputStyle, minHeight: 60, marginBottom: 8 }} value={manualJustification} onChange={(e) => setManualJustification(e.target.value)} placeholder="Обоснование оценки" />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { onAccept(manualRating, manualJustification, 'human'); setEditing(false); }} style={{ ...successBtn, padding: '6px 10px', fontSize: 12 }}>Сохранить</button>
            <button onClick={() => setEditing(false)} style={{ ...ghostBtn, padding: '6px 10px', fontSize: 12 }}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
