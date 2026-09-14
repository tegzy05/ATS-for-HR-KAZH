import React, { useState, useMemo, useRef } from 'react';

// ==================================================================
// kazAvtoJol ATS — справочные данные и скоринг
// ==================================================================

const APPLICANT_TYPES = {
  supervision: {
    key: 'supervision',
    label: 'Консультант по надзору',
    shortLabel: 'Надзор',
    isFirm: true,
    icon: 'ti-eye-check',
    requiredDocs: ['Лицензия на строительный надзор', 'Свидетельство о регистрации фирмы'],
  },
  individual: {
    key: 'individual',
    label: 'Индивидуальный консультант',
    shortLabel: 'Инд. консультант',
    isFirm: false,
    icon: 'ti-user',
    requiredDocs: ['Диплом об образовании', 'Удостоверение личности'],
  },
  contractor: {
    key: 'contractor',
    label: 'Подрядчик',
    shortLabel: 'Подрядчик',
    isFirm: true,
    icon: 'ti-building',
    requiredDocs: ['Лицензия на СМР', 'Свидетельство о регистрации фирмы'],
  },
};

const APPLICATION_STATUS = {
  submitted: { key: 'submitted', label: 'На рассмотрении', tone: 'gray' },
  approved: { key: 'approved', label: 'Одобрено', tone: 'green' },
  declined: { key: 'declined', label: 'Отклонено', tone: 'red' },
};

const LANG_LEVELS = ['Fluent', 'Good', 'Basic'];

// ---- Скоринг: прозрачная формула ----
// Документы теперь — не чекбокс "готов предоставить", а факт загрузки файла.
// Без хотя бы одного обязательного файла заявку невозможно отправить (валидация в форме),
// поэтому disqualified здесь скорее защитная проверка на случай ручной правки данных.
function scoreApplication(application, tender) {
  if (!tender) return { total: 0, breakdown: [], disqualified: false, reasons: [] };

  const breakdown = [];
  let disqualified = false;
  const reasons = [];

  const requiredDocs = tender.requiredDocs || [];
  const uploadedDocNames = (application.documents || []).map((d) => d.docType);
  const missingDocs = requiredDocs.filter((doc) => !uploadedDocNames.includes(doc));
  const docsScore = requiredDocs.length === 0
    ? 20
    : Math.round(20 * ((requiredDocs.length - missingDocs.length) / requiredDocs.length));
  breakdown.push({
    label: 'Документы',
    points: docsScore,
    max: 20,
    detail: missingDocs.length > 0 ? `Не загружено: ${missingDocs.join(', ')}` : 'Все обязательные документы загружены',
  });
  if (missingDocs.length > 0) {
    disqualified = true;
    reasons.push(`Не загружены обязательные документы: ${missingDocs.join(', ')}`);
  }

  const minMonths = Number(tender.minExperienceMonths) || 0;
  const candidateMonths = Number(application.specialization?.experienceMonths) || 0;
  let expScore = 0;
  if (minMonths === 0) {
    expScore = 30;
  } else if (candidateMonths >= minMonths) {
    const ratio = Math.min(candidateMonths / minMonths, 1.5);
    expScore = Math.min(Math.round(30 * (ratio / 1.5) + 15), 30);
  } else {
    expScore = Math.round(30 * (candidateMonths / minMonths));
  }
  breakdown.push({
    label: 'Опыт',
    points: expScore,
    max: 30,
    detail: `${candidateMonths} чел.-мес. при требовании от ${minMonths}`,
  });
  if (candidateMonths < minMonths) {
    reasons.push(`Опыт ниже минимального требования (${candidateMonths} из ${minMonths} чел.-мес.)`);
  }

  const requiredKeywords = (tender.requiredSpecialization || '').toLowerCase().split(/[\s,/]+/).filter((w) => w.length > 3);
  const candidateText = (application.specialization?.expertise || '').toLowerCase();
  const matchedKeywords = requiredKeywords.filter((kw) => candidateText.includes(kw));
  const specScore = requiredKeywords.length === 0 ? 40 : Math.round(40 * (matchedKeywords.length / requiredKeywords.length));
  breakdown.push({
    label: 'Специализация',
    points: specScore,
    max: 40,
    detail: requiredKeywords.length > 0 ? `Совпадений: ${matchedKeywords.length} из ${requiredKeywords.length} ключевых слов` : 'Требование не указано',
  });

  const requiredLang = tender.requiredLanguage;
  let langScore = 10;
  if (requiredLang) {
    const candidateLang = (application.languages || []).find((l) => l.language?.toLowerCase() === requiredLang.toLowerCase());
    if (!candidateLang) { langScore = 0; reasons.push(`Не указан требуемый язык: ${requiredLang}`); }
    else if (candidateLang.speaking === 'Basic') langScore = 4;
    else if (candidateLang.speaking === 'Good') langScore = 7;
    else langScore = 10;
  }
  breakdown.push({
    label: 'Языки',
    points: langScore,
    max: 10,
    detail: requiredLang ? `Требуется: ${requiredLang}` : 'Требование не указано',
  });

  const total = breakdown.reduce((s, b) => s + b.points, 0);
  return { total, breakdown, disqualified, reasons };
}

function scoreTier(total, disqualified) {
  if (disqualified) return { label: 'Не соответствует', tone: 'red' };
  if (total >= 80) return { label: 'Рекомендован', tone: 'green' };
  if (total >= 55) return { label: 'На рассмотрении', tone: 'amber' };
  return { label: 'Низкий приоритет', tone: 'gray' };
}

// ==================================================================
// Демо-данные
// ==================================================================

const seedTenders = [
  {
    id: 't1',
    title: 'Дорожное строительство — участок Атырау',
    applicantType: 'contractor',
    minExperienceMonths: 60,
    requiredSpecialization: 'строительство реконструкция автодорог',
    requiredLanguage: 'Русский',
    requiredDocs: APPLICANT_TYPES.contractor.requiredDocs,
    status: 'open',
    createdAt: '2026-08-10',
  },
  {
    id: 't2',
    title: 'Строительный надзор — мостовой переход Кызылорда',
    applicantType: 'supervision',
    minExperienceMonths: 48,
    requiredSpecialization: 'строительный надзор мостовые конструкции',
    requiredLanguage: 'Казахский',
    requiredDocs: APPLICANT_TYPES.supervision.requiredDocs,
    status: 'open',
    createdAt: '2026-08-20',
  },
  {
    id: 't3',
    title: 'Консультации по переселению — проект «Актобе–Макат»',
    applicantType: 'individual',
    minExperienceMonths: 36,
    requiredSpecialization: 'resettlement социальное сопровождение',
    requiredLanguage: 'Английский',
    requiredDocs: APPLICANT_TYPES.individual.requiredDocs,
    status: 'open',
    createdAt: '2026-09-01',
  },
];

function fakeDoc(docType, fileName, sizeKb) {
  return { docType, fileName, sizeKb, uploadedAt: '2026-09-05' };
}

const seedApplications = [
  {
    id: 'a1', tenderId: 't1', applicantType: 'contractor', status: 'submitted', submittedAt: '2026-09-05',
    personal: { fullName: 'ТОО "СтройПодряд"', gender: '', dob: '', citizenship: 'Kazakhstan', address: 'Атырау, Казахстан', email: 'info@stroypodryad.kz', phone: '+7 712 200 1122', firmName: 'ТОО "СтройПодряд"' },
    specialization: { category: 'Contractor Firm', expertise: 'Строительство и реконструкция автомобильных дорог', experienceMonths: '84' },
    languages: [{ language: 'Русский', reading: 'Fluent', writing: 'Fluent', speaking: 'Fluent', understanding: 'Fluent' }],
    education: [{ degree: 'Инженер-строитель', period: '2005–2010', institution: 'КазГАСА', country: 'Казахстан' }],
    employment: [{ start: '2015-01-01', end: '', employer: 'ТОО "СтройПодряд"', position: 'Директор', duties: 'Управление дорожно-строительными проектами.' }],
    projects: [{ name: 'Реконструкция трассы М-32', client: 'Комитет автодорог РК', country: 'Казахстан', personMonths: '48', description: 'Полный цикл реконструкции 40 км дорожного полотна.' }],
    documents: [fakeDoc('Лицензия на СМР', 'litsenziya_smr.pdf', 842), fakeDoc('Свидетельство о регистрации фирмы', 'svidetelstvo.pdf', 310)],
  },
  {
    id: 'a2', tenderId: 't1', applicantType: 'contractor', status: 'submitted', submittedAt: '2026-09-06',
    personal: { fullName: 'Атырау Курылыс ЛТД', gender: '', dob: '', citizenship: 'Kazakhstan', address: 'Атырау, Казахстан', email: 'contact@atyraukurylys.kz', phone: '+7 712 200 3344', firmName: 'Атырау Курылыс ЛТД' },
    specialization: { category: 'Contractor Firm', expertise: 'Дорожное строительство', experienceMonths: '67' },
    languages: [{ language: 'Русский', reading: 'Fluent', writing: 'Good', speaking: 'Fluent', understanding: 'Fluent' }],
    education: [{ degree: 'Инженер-дорожник', period: '2008–2013', institution: 'ЕНУ им. Гумилёва', country: 'Казахстан' }],
    employment: [{ start: '2018-03-01', end: '', employer: 'Атырау Курылыс ЛТД', position: 'Технический директор', duties: 'Контроль качества работ.' }],
    projects: [{ name: 'Ремонт дорог местного значения', client: 'Акимат Атырауской области', country: 'Казахстан', personMonths: '30', description: 'Ремонт 15 участков региональных дорог.' }],
    documents: [fakeDoc('Лицензия на СМР', 'license_smr_2024.pdf', 655), fakeDoc('Свидетельство о регистрации фирмы', 'reg_certificate.pdf', 290)],
  },
  {
    id: 'a3', tenderId: 't1', applicantType: 'contractor', status: 'submitted', submittedAt: '2026-09-07',
    personal: { fullName: 'Жол Инжиниринг', gender: '', dob: '', citizenship: 'Kazakhstan', address: 'Актобе, Казахстан', email: 'info@zholeng.kz', phone: '+7 713 200 5566', firmName: 'Жол Инжиниринг' },
    specialization: { category: 'Contractor Firm', expertise: 'Строительство дорог', experienceMonths: '52' },
    languages: [{ language: 'Русский', reading: 'Good', writing: 'Good', speaking: 'Good', understanding: 'Good' }],
    education: [{ degree: 'Инженер-строитель', period: '2010–2015', institution: 'ЮКГУ', country: 'Казахстан' }],
    employment: [{ start: '2019-06-01', end: '', employer: 'Жол Инжиниринг', position: 'Руководитель проекта', duties: 'Организация строительных работ.' }],
    projects: [{ name: 'Строительство подъездных путей', client: 'Частный застройщик', country: 'Казахстан', personMonths: '20', description: 'Подъездные пути к промышленному объекту.' }],
    documents: [fakeDoc('Свидетельство о регистрации фирмы', 'reg.pdf', 200)],
  },
  {
    id: 'a4', tenderId: 't2', applicantType: 'supervision', status: 'approved', submittedAt: '2026-08-28',
    personal: { fullName: 'ТОО "НадзорСтрой Инжиниринг"', gender: '', dob: '', citizenship: 'Kazakhstan', address: 'Кызылорда, Казахстан', email: 'office@nadzorstroy.kz', phone: '+7 724 200 7788', firmName: 'ТОО "НадзорСтрой Инжиниринг"' },
    specialization: { category: 'Contractor Firm', expertise: 'Строительный надзор, мостовые конструкции', experienceMonths: '55' },
    languages: [{ language: 'Казахский', reading: 'Fluent', writing: 'Fluent', speaking: 'Fluent', understanding: 'Fluent' }],
    education: [{ degree: 'Инженер-строитель мостов', period: '2003–2008', institution: 'КазНИТУ', country: 'Казахстан' }],
    employment: [{ start: '2012-01-01', end: '', employer: 'ТОО "НадзорСтрой Инжиниринг"', position: 'Главный инженер', duties: 'Технический надзор мостовых сооружений.' }],
    projects: [{ name: 'Надзор моста через Сырдарью', client: 'Комитет автодорог РК', country: 'Казахстан', personMonths: '36', description: 'Полный технический надзор строительства мостового перехода.' }],
    documents: [fakeDoc('Лицензия на строительный надзор', 'nadzor_license.pdf', 512), fakeDoc('Свидетельство о регистрации фирмы', 'reg2.pdf', 260)],
  },
  {
    id: 'a5', tenderId: 't3', applicantType: 'individual', status: 'submitted', submittedAt: '2026-09-08',
    personal: { fullName: 'Жексенбекова Арай', gender: 'Female', dob: '1989-11-04', citizenship: 'Kazakhstan', address: 'Астана, Казахстан', email: 'zheksenbekova.aray@mail.ru', phone: '+7 775 517 5898', firmName: '' },
    specialization: { category: 'Self-Employed', expertise: 'Resettlement / Social Management, социальное сопровождение', experienceMonths: '120' },
    languages: [
      { language: 'Английский', reading: 'Good', writing: 'Good', speaking: 'Good', understanding: 'Good' },
      { language: 'Русский', reading: 'Fluent', writing: 'Fluent', speaking: 'Fluent', understanding: 'Fluent' },
    ],
    education: [{ degree: 'Магистр социологии', period: '2013–2015', institution: "Kazakh State Women's Pedagogical University", country: 'Казахстан' }],
    employment: [{ start: '2016-11-10', end: '', employer: 'Asyl Limited', position: 'Менеджер по правовым и социальным вопросам', duties: 'Связь с сообществами, подготовка социальной документации.' }],
    projects: [{ name: 'Реконструкция автодороги «Актобе–Макат»', client: 'QAJ', country: 'Казахстан', personMonths: '120', description: 'Поддержка социальных гарантий и переселения по проектам ADB.' }],
    documents: [fakeDoc('Диплом об образовании', 'diploma_zheksenbekova.pdf', 480)],
  },
];

// ---- утилиты ----

const emptyPersonal = { fullName: '', gender: 'Female', dob: '', citizenship: 'Kazakhstan', address: '', email: '', phone: '', firmName: '' };
const emptySpecialization = { category: 'Self-Employed', expertise: '', experienceMonths: '' };
const emptyLanguageRow = { language: 'Русский', reading: 'Fluent', writing: 'Fluent', speaking: 'Fluent', understanding: 'Fluent' };
const emptyEducationRow = { degree: '', period: '', institution: '', country: '' };
const emptyEmploymentRow = { start: '', end: '', employer: '', position: '', duties: '' };
const emptyProjectRow = { name: '', client: '', country: '', personMonths: '', description: '' };

function uid(prefix) { return `${prefix}_${Date.now()}_${Math.round(Math.random() * 10000)}`; }

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU');
}

function fmtBytes(kb) {
  if (kb < 1024) return `${kb} КБ`;
  return `${(kb / 1024).toFixed(1)} МБ`;
}

// ==================================================================
// Дизайн-токены
// ==================================================================
// Палитра: графитово-синий как рабочий, не маркетинговый акцент.
// Тёплый нейтральный фон вместо чистого белого/серого — меньше "SaaS-шаблона".

const T = {
  ink: '#161B22',
  ink2: '#3D4451',
  muted: '#767D8A',
  faint: '#A7ACB6',
  line: '#E4E1D9',
  lineStrong: '#CFCBC0',
  bg: '#F7F5F0',
  surface: '#FFFFFF',
  surfaceSunken: '#EFECE4',
  accent: '#1F3A5F',
  accentHover: '#16293F',
  accentSoft: '#E7EDF3',
  green: '#1D7A5C',
  greenSoft: '#E4F2EC',
  amber: '#9C6B0E',
  amberSoft: '#FBF0DC',
  red: '#B03A2E',
  redSoft: '#FBEAE7',
  radius: 10,
  radiusLg: 14,
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

function pillStyle(tone) {
  const map = {
    blue: { bg: T.accentSoft, text: T.accent },
    green: { bg: T.greenSoft, text: T.green },
    red: { bg: T.redSoft, text: T.red },
    amber: { bg: T.amberSoft, text: T.amber },
    gray: { bg: T.surfaceSunken, text: T.ink2 },
  };
  const c = map[tone] || map.gray;
  return {
    background: c.bg, color: c.text, fontSize: 12, fontWeight: 600,
    padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  };
}

// ---- общие стили ----
const cardStyle = { background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radiusLg, padding: '1.25rem 1.4rem' };
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 };
const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${T.line}`,
  background: T.surface, fontSize: 14, color: T.ink, boxSizing: 'border-box',
  fontFamily: T.font, transition: 'border-color .12s',
};
const labelStyle = { fontSize: 12.5, color: T.ink2, marginBottom: 5, display: 'block', fontWeight: 600 };
const helpTextStyle = { fontSize: 12, color: T.muted, margin: '4px 0 0' };

const primaryBtn = {
  background: T.accent, color: '#fff', border: 'none', padding: '10px 18px',
  borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.font,
};
const secondaryBtn = {
  background: T.surface, border: `1px solid ${T.lineStrong}`, color: T.ink,
  padding: '10px 18px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.font,
};
const ghostBtn = {
  background: 'transparent', border: 'none', color: T.ink2,
  padding: '8px 4px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.font,
};
const dangerBtn = {
  background: T.surface, border: `1px solid ${T.red}55`, color: T.red,
  padding: '10px 18px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.font,
};
const successBtn = {
  background: T.green, color: '#fff', border: 'none', padding: '10px 18px',
  borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.font,
};
const addBtn = {
  border: `1px dashed ${T.lineStrong}`, background: 'transparent', borderRadius: 8,
  padding: '9px 14px', fontSize: 13, color: T.ink2, cursor: 'pointer', marginTop: 4, fontFamily: T.font, fontWeight: 600,
};
const rowRemoveBtn = {
  border: 'none', background: 'transparent', borderRadius: 6, padding: '6px 8px',
  fontSize: 12, color: T.muted, cursor: 'pointer', fontFamily: T.font,
};

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

// ==================================================================
// Загрузка документов — обязательный шаг, без файла заявку не отправить
// ==================================================================

function DocumentUploader({ requiredDocs, documents, onAdd, onRemove, error }) {
  const inputRefs = useRef({});

  function handleFile(docType, file) {
    if (!file) return;
    const sizeKb = Math.round(file.size / 1024);
    onAdd({ docType, fileName: file.name, sizeKb, uploadedAt: new Date().toISOString().slice(0, 10) });
  }

  function handleDrop(e, docType) {
    e.preventDefault();
    e.currentTarget.style.borderColor = T.lineStrong;
    e.currentTarget.style.background = T.surface;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(docType, file);
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: T.muted, margin: '0 0 14px' }}>
        Загрузите файл для каждого документа (PDF, JPG или PNG, до 10 МБ). Заявку нельзя отправить, пока все обязательные документы не загружены.
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        {requiredDocs.map((docType) => {
          const uploaded = documents.find((d) => d.docType === docType);
          return (
            <div key={docType}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{docType}</span>
                <span style={{ fontSize: 11, color: T.red, fontWeight: 600 }}>обязательно</span>
              </div>

              {uploaded ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  border: `1px solid ${T.green}44`, background: T.greenSoft, borderRadius: 8, padding: '10px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Icon name="ti-file-check" size={18} color={T.green} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{uploaded.fileName}</p>
                      <p style={{ margin: 0, fontSize: 11.5, color: T.muted }}>{fmtBytes(uploaded.sizeKb)} · загружено</p>
                    </div>
                  </div>
                  <button onClick={() => onRemove(docType)} style={{ ...rowRemoveBtn, flexShrink: 0 }} aria-label={`Удалить ${docType}`}>
                    <Icon name="ti-x" size={16} />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => inputRefs.current[docType]?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = T.accentSoft; }}
                  onDragLeave={(e) => { e.currentTarget.style.borderColor = T.lineStrong; e.currentTarget.style.background = T.surface; }}
                  onDrop={(e) => handleDrop(e, docType)}
                  style={{
                    border: `1.5px dashed ${error ? T.red : T.lineStrong}`, borderRadius: 8, padding: '14px',
                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: T.surface,
                    transition: 'border-color .12s, background .12s',
                  }}
                >
                  <Icon name="ti-cloud-upload" size={18} color={T.muted} />
                  <span style={{ fontSize: 13, color: T.muted }}>Перетащите файл сюда или <span style={{ color: T.accent, fontWeight: 600 }}>выберите на устройстве</span></span>
                  <input
                    ref={(el) => (inputRefs.current[docType] = el)}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFile(docType, e.target.files?.[0])}
                  />
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
// Главный компонент
// ==================================================================

function App() {
  const [role, setRole] = useState('applicant');
  const [tenders, setTenders] = useState(seedTenders);
  const [applications, setApplications] = useState(seedApplications);
  const [toast, setToast] = useState(null);

  function showToast(message, tone = 'default') {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 3000);
  }

  function addApplication(app) { setApplications((prev) => [...prev, app]); }
  function updateApplicationStatus(id, status) { setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a))); }
  function addTender(tender) { setTenders((prev) => [...prev, tender]); }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: T.font, display: 'flex' }}>
      <style>{`
        input:focus, select:focus, textarea:focus { outline: none; border-color: ${T.accent} !important; box-shadow: 0 0 0 3px ${T.accentSoft}; }
        button { transition: opacity .12s, background .12s; }
        button:hover { opacity: 0.88; }
        button:active { opacity: 0.75; }
        * { box-sizing: border-box; }
        ::placeholder { color: ${T.faint}; }
      `}</style>
      <Sidebar role={role} setRole={setRole} />
      {toast && <Toast message={toast.message} tone={toast.tone} />}
      <div style={{ flex: 1, padding: '32px 40px', maxWidth: 1100 }}>
        {role === 'applicant' ? (
          <ApplicantArea tenders={tenders} applications={applications} addApplication={addApplication} showToast={showToast} />
        ) : (
          <HRArea
            tenders={tenders} applications={applications} addTender={addTender}
            updateApplicationStatus={updateApplicationStatus} showToast={showToast}
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
        <p style={{ fontSize: 11, color: T.faint, margin: '12px 0 0', lineHeight: 1.5 }}>Прототип · демо-данные хранятся только в этой сессии</p>
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        border: 'none', background: active ? T.accentSoft : 'transparent', color: active ? T.accent : T.ink2,
        padding: '10px 10px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
        marginBottom: 2, fontFamily: T.font,
      }}
    >
      <Icon name={icon} size={17} color={active ? T.accent : T.muted} />
      {label}
    </button>
  );
}

function Toast({ message, tone }) {
  const colors = { default: T.ink, danger: T.red, success: T.green };
  return (
    <div style={{
      position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
      background: colors[tone] || T.ink, color: '#fff', padding: '11px 20px', borderRadius: 8,
      fontSize: 13.5, fontWeight: 600, zIndex: 1000, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <Icon name="ti-check" size={16} color="#fff" />
      {message}
    </div>
  );
}

// ==================================================================
// КАБИНЕТ ЗАЯВИТЕЛЯ
// ==================================================================

function ApplicantArea({ tenders, applications, addApplication, showToast }) {
  const [screen, setScreen] = useState('tenders');
  const [activeTenderId, setActiveTenderId] = useState(null);
  const [draftApp, setDraftApp] = useState(null);

  const activeTender = tenders.find((t) => t.id === activeTenderId);

  function startApplication(tenderId) {
    const tender = tenders.find((t) => t.id === tenderId);
    setActiveTenderId(tenderId);
    setDraftApp({
      id: uid('a'), tenderId, applicantType: tender.applicantType, status: 'submitted',
      submittedAt: new Date().toISOString().slice(0, 10),
      personal: { ...emptyPersonal }, specialization: { ...emptySpecialization },
      languages: [{ ...emptyLanguageRow }], education: [{ ...emptyEducationRow }],
      employment: [{ ...emptyEmploymentRow }], projects: [{ ...emptyProjectRow }],
      documents: [],
    });
    setScreen('form');
  }

  function submit() {
    addApplication(draftApp);
    showToast('Заявка отправлена и передана на рассмотрение', 'success');
    setScreen('myApps');
  }

  if (screen === 'myApps') {
    return <MyApplications applications={applications} tenders={tenders} onBack={() => setScreen('tenders')} onNew={() => setScreen('tenders')} />;
  }
  if (screen === 'form' && draftApp) {
    return <ApplicationForm tender={activeTender} draft={draftApp} setDraft={setDraftApp} onCancel={() => { setScreen('tenders'); setDraftApp(null); }} onPreview={() => setScreen('preview')} />;
  }
  if (screen === 'preview' && draftApp) {
    return <ApplicationPreview tender={activeTender} application={draftApp} onBack={() => setScreen('form')} onSubmit={submit} />;
  }
  return <TenderList tenders={tenders} applications={applications} onApply={startApplication} onViewMyApps={() => setScreen('myApps')} />;
}

function TenderList({ tenders, applications, onApply, onViewMyApps }) {
  return (
    <div>
      <PageHeader
        title="Открытые тендеры и вакансии"
        description="Заявка принимается только через форму ниже — загрузка файла резюме произвольного формата не поддерживается."
        action={<button onClick={onViewMyApps} style={secondaryBtn}><Icon name="ti-list-details" size={15} /> Мои заявки ({applications.length})</button>}
      />

      <div style={{ display: 'grid', gap: 12 }}>
        {tenders.map((t) => {
          const type = APPLICANT_TYPES[t.applicantType];
          const count = applications.filter((a) => a.tenderId === t.id).length;
          return (
            <div key={t.id} style={{ ...cardStyle, transition: 'border-color .12s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={pillStyle('blue')}><Icon name={type.icon} size={12} />{type.label}</span>
                    <span style={{ fontSize: 12, color: T.faint }}>· опубликован {fmtDate(t.createdAt)}</span>
                  </div>
                  <h3 style={{ fontSize: 16.5, fontWeight: 700, margin: '0 0 8px', color: T.ink }}>{t.title}</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', fontSize: 13, color: T.ink2 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="ti-target" size={14} color={T.muted} />{t.requiredSpecialization}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="ti-clock" size={14} color={T.muted} />от {t.minExperienceMonths} чел.-мес.</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="ti-language" size={14} color={T.muted} />{t.requiredLanguage}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="ti-users" size={14} color={T.muted} />{count} {count === 1 ? 'заявка' : 'заявок'}</span>
                  </div>
                </div>
                <button onClick={() => onApply(t.id)} style={{ ...primaryBtn, flexShrink: 0 }}>Подать заявку</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MyApplications({ applications, tenders, onBack, onNew }) {
  return (
    <div>
      <BackLink onClick={onBack} label="К списку тендеров" />
      <PageHeader title="Мои заявки" description={`Всего подано: ${applications.length}`} />

      {applications.length === 0 ? (
        <EmptyState icon="ti-file-off" title="Заявок пока нет" description="Выберите тендер из списка и заполните форму, чтобы подать первую заявку." action={<button onClick={onNew} style={primaryBtn}>Смотреть тендеры</button>} />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {applications.map((a) => {
            const tender = tenders.find((t) => t.id === a.tenderId);
            const status = APPLICATION_STATUS[a.status];
            const type = APPLICANT_TYPES[a.applicantType];
            return (
              <div key={a.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Icon name={type.icon} size={15} color={T.muted} />
                      <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: T.ink }}>{a.personal.fullName || 'Без названия'}</p>
                    </div>
                    <p style={{ margin: 0, fontSize: 12.5, color: T.muted }}>{tender?.title} · подана {fmtDate(a.submittedAt)}</p>
                  </div>
                  <span style={pillStyle(status.tone)}>{status.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
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

// ==================================================================
// Форма подачи заявки — степпер из 4 шагов
// ==================================================================

const FORM_STEPS = ['Личные данные', 'Опыт и языки', 'Проекты', 'Документы'];

function ApplicationForm({ tender, draft, setDraft, onCancel, onPreview }) {
  const type = APPLICANT_TYPES[draft.applicantType];
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});

  function updateField(section, field, value) {
    setDraft((prev) => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
  }
  function updateListRow(listKey, index, field, value) {
    setDraft((prev) => { const next = [...prev[listKey]]; next[index] = { ...next[index], [field]: value }; return { ...prev, [listKey]: next }; });
  }
  function addRow(listKey, empty) { setDraft((prev) => ({ ...prev, [listKey]: [...prev[listKey], { ...empty }] })); }
  function removeRow(listKey, index) { setDraft((prev) => ({ ...prev, [listKey]: prev[listKey].filter((_, i) => i !== index) })); }
  function addDocument(doc) { setDraft((prev) => ({ ...prev, documents: [...prev.documents.filter((d) => d.docType !== doc.docType), doc] })); }
  function removeDocument(docType) { setDraft((prev) => ({ ...prev, documents: prev.documents.filter((d) => d.docType !== docType) })); }

  function validateStep(i) {
    const errs = {};
    if (i === 0) {
      if (!draft.personal.fullName.trim()) errs.fullName = type.isFirm ? 'Укажите название фирмы' : 'Укажите ФИО';
      if (!draft.personal.email.trim()) errs.email = 'Укажите email';
    }
    if (i === 1) {
      if (!draft.specialization.expertise.trim()) errs.expertise = 'Укажите область экспертизы';
      if (!draft.specialization.experienceMonths) errs.experienceMonths = 'Укажите опыт в человеко-месяцах';
    }
    if (i === 3) {
      const uploadedTypes = draft.documents.map((d) => d.docType);
      const missing = type.requiredDocs.filter((d) => !uploadedTypes.includes(d));
      if (missing.length > 0) errs.documents = `Загрузите все обязательные документы (не хватает: ${missing.join(', ')})`;
    }
    return errs;
  }

  function goNext() {
    const errs = validateStep(step);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (step < FORM_STEPS.length - 1) setStep(step + 1);
    else {
      const allErrors = validateStep(3);
      if (Object.keys(allErrors).length > 0) { setErrors(allErrors); return; }
      onPreview();
    }
  }

  function goToStep(i) {
    // Разрешаем прыгать назад свободно, вперёд — только после валидации текущего шага
    if (i < step) { setStep(i); return; }
    const errs = validateStep(step);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setStep(i);
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <BackLink onClick={onCancel} label="Отменить и вернуться к тендерам" />

      <p style={{ fontSize: 12.5, color: T.faint, margin: '0 0 4px', fontWeight: 600 }}>{tender?.title}</p>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: T.ink }}>Анкета — {type.label}</h1>
      <p style={{ fontSize: 13.5, color: T.muted, margin: '0 0 22px' }}>
        {type.isFirm ? 'Заполняется от имени фирмы или организации.' : 'Заполняется индивидуально, от физического лица.'}
      </p>

      <Stepper steps={FORM_STEPS} current={step} onStepClick={goToStep} />

      <div style={{ marginTop: 20 }}>
        {step === 0 && (
          <Section title="Личные данные">
            <div style={grid2}>
              <Field label={type.isFirm ? 'Название фирмы' : 'ФИО'} error={errors.fullName}>
                <input style={inputStyle} value={draft.personal.fullName} onChange={(e) => updateField('personal', 'fullName', e.target.value)} placeholder={type.isFirm ? 'ТОО «Пример»' : 'Иванов Иван Иванович'} />
              </Field>
              {!type.isFirm && (
                <Field label="Пол">
                  <select style={inputStyle} value={draft.personal.gender} onChange={(e) => updateField('personal', 'gender', e.target.value)}>
                    <option>Female</option><option>Male</option>
                  </select>
                </Field>
              )}
              {!type.isFirm && (
                <Field label="Дата рождения">
                  <input type="date" style={inputStyle} value={draft.personal.dob} onChange={(e) => updateField('personal', 'dob', e.target.value)} />
                </Field>
              )}
              <Field label="Гражданство / страна регистрации">
                <input style={inputStyle} value={draft.personal.citizenship} onChange={(e) => updateField('personal', 'citizenship', e.target.value)} />
              </Field>
              <Field label="Адрес" full>
                <input style={inputStyle} value={draft.personal.address} onChange={(e) => updateField('personal', 'address', e.target.value)} />
              </Field>
              <Field label="Email" error={errors.email}>
                <input type="email" style={inputStyle} value={draft.personal.email} onChange={(e) => updateField('personal', 'email', e.target.value)} placeholder="name@company.kz" />
              </Field>
              <Field label="Телефон">
                <input style={inputStyle} value={draft.personal.phone} onChange={(e) => updateField('personal', 'phone', e.target.value)} placeholder="+7..." />
              </Field>
            </div>
          </Section>
        )}

        {step === 1 && (
          <>
            <Section title="Специализация">
              <div style={grid2}>
                <Field label="Опыт в этой области, чел.-мес." error={errors.experienceMonths}>
                  <input type="number" style={inputStyle} value={draft.specialization.experienceMonths} onChange={(e) => updateField('specialization', 'experienceMonths', e.target.value)} />
                </Field>
                <Field label="Категория">
                  <input style={inputStyle} value={draft.specialization.category} onChange={(e) => updateField('specialization', 'category', e.target.value)} />
                </Field>
                <Field label="Область экспертизы" full error={errors.expertise} hint="Используется для автоматического сопоставления с требованиями тендера">
                  <textarea style={{ ...inputStyle, minHeight: 64 }} value={draft.specialization.expertise} onChange={(e) => updateField('specialization', 'expertise', e.target.value)} placeholder="Например: строительство и реконструкция автодорог" />
                </Field>
              </div>
            </Section>

            <Section title="Языки">
              {draft.languages.map((lang, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                  <div>{i === 0 && <label style={labelStyle}>Язык</label>}<input style={inputStyle} value={lang.language} onChange={(e) => updateListRow('languages', i, 'language', e.target.value)} /></div>
                  {['reading', 'writing', 'speaking', 'understanding'].map((f) => (
                    <div key={f}>
                      {i === 0 && <label style={labelStyle}>{{ reading: 'Чтение', writing: 'Письмо', speaking: 'Говорение', understanding: 'Понимание' }[f]}</label>}
                      <select style={inputStyle} value={lang[f]} onChange={(e) => updateListRow('languages', i, f, e.target.value)}>{LANG_LEVELS.map((lvl) => <option key={lvl}>{lvl}</option>)}</select>
                    </div>
                  ))}
                  <button style={rowRemoveBtn} onClick={() => removeRow('languages', i)}><Icon name="ti-trash" size={15} /></button>
                </div>
              ))}
              <button style={addBtn} onClick={() => addRow('languages', emptyLanguageRow)}>+ Добавить язык</button>
            </Section>

            <Section title="Образование">
              {draft.education.map((e, i) => (
                <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < draft.education.length - 1 ? `1px solid ${T.line}` : 'none' }}>
                  <div style={grid2}>
                    <Field label="Степень / квалификация"><input style={inputStyle} value={e.degree} onChange={(ev) => updateListRow('education', i, 'degree', ev.target.value)} /></Field>
                    <Field label="Период"><input style={inputStyle} value={e.period} onChange={(ev) => updateListRow('education', i, 'period', ev.target.value)} placeholder="2013–2015" /></Field>
                    <Field label="Учебное заведение"><input style={inputStyle} value={e.institution} onChange={(ev) => updateListRow('education', i, 'institution', ev.target.value)} /></Field>
                    <Field label="Страна"><input style={inputStyle} value={e.country} onChange={(ev) => updateListRow('education', i, 'country', ev.target.value)} /></Field>
                  </div>
                  <button style={{ ...rowRemoveBtn, marginTop: 6 }} onClick={() => removeRow('education', i)}>Удалить запись</button>
                </div>
              ))}
              <button style={addBtn} onClick={() => addRow('education', emptyEducationRow)}>+ Добавить образование</button>
            </Section>

            <Section title="Трудовой стаж">
              {draft.employment.map((e, i) => (
                <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < draft.employment.length - 1 ? `1px solid ${T.line}` : 'none' }}>
                  <div style={grid2}>
                    <Field label="Начало"><input type="date" style={inputStyle} value={e.start} onChange={(ev) => updateListRow('employment', i, 'start', ev.target.value)} /></Field>
                    <Field label="Окончание (пусто — по наст. время)"><input type="date" style={inputStyle} value={e.end} onChange={(ev) => updateListRow('employment', i, 'end', ev.target.value)} /></Field>
                    <Field label="Работодатель"><input style={inputStyle} value={e.employer} onChange={(ev) => updateListRow('employment', i, 'employer', ev.target.value)} /></Field>
                    <Field label="Должность"><input style={inputStyle} value={e.position} onChange={(ev) => updateListRow('employment', i, 'position', ev.target.value)} /></Field>
                    <Field label="Обязанности" full><textarea style={{ ...inputStyle, minHeight: 54 }} value={e.duties} onChange={(ev) => updateListRow('employment', i, 'duties', ev.target.value)} /></Field>
                  </div>
                  <button style={{ ...rowRemoveBtn, marginTop: 6 }} onClick={() => removeRow('employment', i)}>Удалить запись</button>
                </div>
              ))}
              <button style={addBtn} onClick={() => addRow('employment', emptyEmploymentRow)}>+ Добавить место работы</button>
            </Section>
          </>
        )}

        {step === 2 && (
          <Section title="Ключевые проекты" description="Проекты, которые лучше всего показывают релевантный опыт — отдельно от общего трудового стажа.">
            {draft.projects.map((p, i) => (
              <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < draft.projects.length - 1 ? `1px solid ${T.line}` : 'none' }}>
                <Field label="Название проекта" full><input style={inputStyle} value={p.name} onChange={(ev) => updateListRow('projects', i, 'name', ev.target.value)} /></Field>
                <div style={{ ...grid2, marginTop: 10 }}>
                  <Field label="Заказчик"><input style={inputStyle} value={p.client} onChange={(ev) => updateListRow('projects', i, 'client', ev.target.value)} /></Field>
                  <Field label="Страна"><input style={inputStyle} value={p.country} onChange={(ev) => updateListRow('projects', i, 'country', ev.target.value)} /></Field>
                  <Field label="Чел.-мес."><input type="number" style={inputStyle} value={p.personMonths} onChange={(ev) => updateListRow('projects', i, 'personMonths', ev.target.value)} /></Field>
                  <Field label="Описание" full><textarea style={{ ...inputStyle, minHeight: 54 }} value={p.description} onChange={(ev) => updateListRow('projects', i, 'description', ev.target.value)} /></Field>
                </div>
                <button style={{ ...rowRemoveBtn, marginTop: 6 }} onClick={() => removeRow('projects', i)}>Удалить проект</button>
              </div>
            ))}
            <button style={addBtn} onClick={() => addRow('projects', emptyProjectRow)}>+ Добавить проект</button>
          </Section>
        )}

        {step === 3 && (
          <Section title="Документы" description="Обязательные документы для категории «{type.label}»">
            <DocumentUploader requiredDocs={type.requiredDocs} documents={draft.documents} onAdd={addDocument} onRemove={removeDocument} error={errors.documents} />
          </Section>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <button onClick={() => (step === 0 ? onCancel() : setStep(step - 1))} style={secondaryBtn}>
          {step === 0 ? 'Отменить' : '← Назад'}
        </button>
        <button onClick={goNext} style={primaryBtn}>
          {step === FORM_STEPS.length - 1 ? 'Просмотреть перед отправкой' : 'Далее'}
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
          <button
            onClick={() => onStepClick(i)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontFamily: T.font }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, flexShrink: 0,
              background: i < current ? T.accent : i === current ? T.accent : T.surfaceSunken,
              color: i <= current ? '#fff' : T.faint,
            }}>
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

function ApplicationPreview({ tender, application, onBack, onSubmit }) {
  const type = APPLICANT_TYPES[application.applicantType];
  return (
    <div style={{ maxWidth: 700 }}>
      <BackLink onClick={onBack} label="Вернуться к редактированию" />
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Icon name="ti-eye" size={16} color={T.muted} />
          <p style={{ fontSize: 12.5, color: T.muted, margin: 0, fontWeight: 600 }}>Предпросмотр перед отправкой</p>
        </div>
        <p style={{ fontSize: 12.5, color: T.faint, margin: '8px 0 2px' }}>{tender?.title}</p>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 18px', color: T.ink }}>{type.label}</h1>

        <PreviewBlock title="Личные данные">
          <PreviewField label={type.isFirm ? 'Фирма' : 'ФИО'} value={application.personal.fullName} />
          <PreviewField label="Email" value={application.personal.email} />
          <PreviewField label="Телефон" value={application.personal.phone} />
          <PreviewField label="Адрес" value={application.personal.address} />
        </PreviewBlock>
        <PreviewBlock title="Специализация">
          <PreviewField label="Область экспертизы" value={application.specialization.expertise} />
          <PreviewField label="Опыт" value={`${application.specialization.experienceMonths} чел.-мес.`} />
        </PreviewBlock>
        <PreviewBlock title="Документы">
          <div style={{ display: 'grid', gap: 6 }}>
            {application.documents.map((d) => (
              <div key={d.docType} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <Icon name="ti-file-check" size={15} color={T.green} />
                <span style={{ color: T.ink2 }}>{d.docType}</span>
                <span style={{ color: T.faint }}>— {d.fileName}</span>
              </div>
            ))}
          </div>
        </PreviewBlock>

        <button onClick={onSubmit} style={{ ...primaryBtn, width: '100%', padding: '13px 20px', fontSize: 14.5, marginTop: 8 }}>
          Отправить заявку
        </button>
      </div>
    </div>
  );
}

function PreviewBlock({ title, children }) {
  return <div style={{ marginBottom: 20 }}><SectionTitle>{title}</SectionTitle>{children}</div>;
}

// ==================================================================
// КАБИНЕТ HR
// ==================================================================

function HRArea({ tenders, applications, addTender, updateApplicationStatus, showToast }) {
  const [screen, setScreen] = useState('dashboard');
  const [selectedTenderId, setSelectedTenderId] = useState(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);
  const [cameFrom, setCameFrom] = useState('dashboard');

  const filteredApps = selectedTenderId ? applications.filter((a) => a.tenderId === selectedTenderId) : applications;

  const scored = useMemo(() => {
    return filteredApps.map((a) => {
      const tender = tenders.find((t) => t.id === a.tenderId);
      const result = scoreApplication(a, tender);
      const tier = scoreTier(result.total, result.disqualified);
      return { application: a, tender, result, tier };
    }).sort((x, y) => y.result.total - x.result.total);
  }, [filteredApps, tenders]);

  const selectedApp = applications.find((a) => a.id === selectedApplicationId);
  const selectedAppTender = selectedApp ? tenders.find((t) => t.id === selectedApp.tenderId) : null;

  function openDetail(id, from) { setSelectedApplicationId(id); setCameFrom(from); setScreen('detail'); }

  if (screen === 'newTender') {
    return <NewTenderForm onCancel={() => setScreen('dashboard')} onCreate={(t) => { addTender(t); showToast('Тендер опубликован', 'success'); setScreen('dashboard'); }} />;
  }
  if (screen === 'detail' && selectedApp) {
    const result = scoreApplication(selectedApp, selectedAppTender);
    const tier = scoreTier(result.total, result.disqualified);
    return (
      <ApplicationDetail
        application={selectedApp} tender={selectedAppTender} result={result} tier={tier}
        onBack={() => setScreen(cameFrom)}
        onApprove={() => { updateApplicationStatus(selectedApp.id, 'approved'); showToast('Заявка одобрена', 'success'); }}
        onDecline={() => { updateApplicationStatus(selectedApp.id, 'declined'); showToast('Заявка отклонена', 'danger'); }}
      />
    );
  }
  if (screen === 'table') {
    return <TableView scored={scored} tenders={tenders} selectedTenderId={selectedTenderId} setSelectedTenderId={setSelectedTenderId} onOpenDetail={(id) => openDetail(id, 'table')} onBack={() => setScreen('dashboard')} />;
  }
  return (
    <Dashboard
      tenders={tenders} scored={scored} selectedTenderId={selectedTenderId} setSelectedTenderId={setSelectedTenderId}
      onNewTender={() => setScreen('newTender')} onOpenTable={() => setScreen('table')} onOpenDetail={(id) => openDetail(id, 'dashboard')}
    />
  );
}

function Dashboard({ tenders, scored, selectedTenderId, setSelectedTenderId, onNewTender, onOpenTable, onOpenDetail }) {
  const total = scored.length;
  const avgScore = total > 0 ? Math.round(scored.reduce((s, x) => s + x.result.total, 0) / total) : 0;
  const passedCompliance = scored.filter((x) => !x.result.disqualified).length;
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
        <MetricCard label="Средний балл" value={avgScore} icon="ti-chart-bar" />
        <MetricCard label="Прошли compliance" value={`${passedCompliance} / ${total}`} icon="ti-shield-check" />
      </div>

      {scored.length === 0 ? (
        <EmptyState icon="ti-inbox" title="Заявок пока нет" description="По выбранному фильтру ни одна заявка не найдена. Попробуйте выбрать «Все тендеры»." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {scored.map(({ application, tender, result, tier }) => (
            <ApplicationRow key={application.id} application={application} tender={tender} result={result} tier={tier} onClick={() => onOpenDetail(application.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApplicationRow({ application, tender, result, tier, onClick }) {
  const type = APPLICANT_TYPES[application.applicantType];
  const status = APPLICATION_STATUS[application.status];
  return (
    <div onClick={onClick} style={{ ...cardStyle, cursor: 'pointer', transition: 'box-shadow .12s, border-color .12s' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineStrong; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
            <span style={pillStyle('blue')}><Icon name={type.icon} size={12} />{type.shortLabel}</span>
            {application.status !== 'submitted' && <span style={pillStyle(status.tone)}>{status.label}</span>}
            <span style={{ fontSize: 12, color: T.faint }}>{tender?.title}</span>
          </div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.ink }}>{application.personal.fullName}</p>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: T.muted }}>{application.specialization.experienceMonths} чел.-мес. · подана {fmtDate(application.submittedAt)}</p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: T.ink }}>{result.total}</p>
          <p style={{ margin: 0, fontSize: 10.5, color: T.faint }}>из 100</p>
        </div>
        <span style={{ ...pillStyle(tier.tone), flexShrink: 0 }}>{tier.label}</span>
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

// ---- создание тендера ----

function NewTenderForm({ onCancel, onCreate }) {
  const [form, setForm] = useState({ title: '', applicantType: 'contractor', minExperienceMonths: '', requiredSpecialization: '', requiredLanguage: 'Русский' });
  const [errors, setErrors] = useState({});

  function submit() {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Укажите название';
    if (!form.requiredSpecialization.trim()) errs.requiredSpecialization = 'Укажите требуемую специализацию';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onCreate({ id: uid('t'), ...form, requiredDocs: APPLICANT_TYPES[form.applicantType].requiredDocs, status: 'open', createdAt: new Date().toISOString().slice(0, 10) });
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <BackLink onClick={onCancel} label="Отменить" />
      <PageHeader title="Новый тендер или вакансия" description="Эти условия используются для автоматического скоринга поданных заявок." />

      <div style={cardStyle}>
        <Field label="Название" error={errors.title} full>
          <input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Например: Дорожное строительство — участок Атырау" />
        </Field>
        <div style={{ ...grid2, marginTop: 14 }}>
          <Field label="Категория заявителя">
            <select style={inputStyle} value={form.applicantType} onChange={(e) => setForm({ ...form, applicantType: e.target.value })}>
              {Object.values(APPLICANT_TYPES).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Мин. опыт, чел.-мес.">
            <input type="number" style={inputStyle} value={form.minExperienceMonths} onChange={(e) => setForm({ ...form, minExperienceMonths: e.target.value })} />
          </Field>
          <Field label="Требуемый язык">
            <input style={inputStyle} value={form.requiredLanguage} onChange={(e) => setForm({ ...form, requiredLanguage: e.target.value })} />
          </Field>
          <Field label="Требуемая специализация (ключевые слова)" full error={errors.requiredSpecialization}>
            <textarea style={{ ...inputStyle, minHeight: 64 }} value={form.requiredSpecialization} onChange={(e) => setForm({ ...form, requiredSpecialization: e.target.value })} placeholder="Например: строительство реконструкция автодорог" />
          </Field>
        </div>
        <div style={{ marginTop: 14, padding: 12, background: T.surfaceSunken, borderRadius: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Icon name="ti-info-circle" size={16} color={T.muted} />
          <p style={{ fontSize: 12.5, color: T.ink2, margin: 0 }}>
            Обязательные документы для категории «{APPLICANT_TYPES[form.applicantType].label}»: {APPLICANT_TYPES[form.applicantType].requiredDocs.join(', ')}
          </p>
        </div>
        <button onClick={submit} style={{ ...primaryBtn, width: '100%', padding: '13px 20px', fontSize: 14.5, marginTop: 18 }}>Опубликовать тендер</button>
      </div>
    </div>
  );
}

// ---- табличный вид ----

function TableView({ scored, tenders, selectedTenderId, setSelectedTenderId, onOpenDetail, onBack }) {
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
              <th style={th}>Опыт</th><th style={th}>Документы</th><th style={th}>Балл</th><th style={th}>Статус</th>
            </tr>
          </thead>
          <tbody>
            {scored.map(({ application, tender, result, tier }) => (
              <tr key={application.id} onClick={() => onOpenDetail(application.id)} style={{ borderBottom: `1px solid ${T.line}`, cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.bg; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <td style={{ ...td, fontWeight: 600 }}>{application.personal.fullName}</td>
                <td style={td}>{APPLICANT_TYPES[application.applicantType].shortLabel}</td>
                <td style={td}>{tender?.title}</td>
                <td style={td}>{application.specialization.experienceMonths} чел.-мес.</td>
                <td style={td}>{result.disqualified ? <span style={{ color: T.red }}>Неполный пакет</span> : <span style={{ color: T.green }}>Полный</span>}</td>
                <td style={{ ...td, fontWeight: 700 }}>{result.total}</td>
                <td style={td}><span style={pillStyle(tier.tone)}>{tier.label}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {scored.length === 0 && <p style={{ padding: 20, color: T.muted, fontSize: 14 }}>Нет данных.</p>}
      </div>
    </div>
  );
}

// ==================================================================
// Детальный просмотр заявки
// ==================================================================

function ApplicationDetail({ application, tender, result, tier, onBack, onApprove, onDecline }) {
  const type = APPLICANT_TYPES[application.applicantType];
  const status = APPLICATION_STATUS[application.status];
  const isPending = application.status === 'submitted';

  return (
    <div style={{ maxWidth: 880 }}>
      <BackLink onClick={onBack} label="Назад" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 16 }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span style={pillStyle('blue')}><Icon name={type.icon} size={12} />{type.label}</span>
            <span style={pillStyle(status.tone)}>{status.label}</span>
          </div>
          <h1 style={{ fontSize: 23, fontWeight: 700, margin: 0, color: T.ink }}>{application.personal.fullName}</h1>
          <p style={{ fontSize: 13, color: T.muted, margin: '5px 0 0' }}>{tender?.title}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={() => exportApplicationPDF(application, tender)} style={secondaryBtn}><Icon name="ti-download" size={15} /> Экспорт PDF</button>
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
            <SectionTitle>Личные данные</SectionTitle>
            <PreviewField label="Email" value={application.personal.email} />
            <PreviewField label="Телефон" value={application.personal.phone} />
            <PreviewField label="Адрес" value={application.personal.address} />
          </div>

          <div style={cardStyle}>
            <SectionTitle>Специализация</SectionTitle>
            <PreviewField label="Экспертиза" value={application.specialization.expertise} />
            <PreviewField label="Опыт" value={`${application.specialization.experienceMonths} чел.-мес.`} />
          </div>

          <div style={cardStyle}>
            <SectionTitle>Ключевые проекты</SectionTitle>
            {application.projects.map((p, i) => (
              <div key={i} style={{ marginBottom: i < application.projects.length - 1 ? 12 : 0, paddingBottom: i < application.projects.length - 1 ? 12 : 0, borderBottom: i < application.projects.length - 1 ? `1px solid ${T.line}` : 'none' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.ink }}>{p.name}</p>
                <p style={{ margin: '3px 0 0', fontSize: 12.5, color: T.muted }}>{p.client} · {p.country} · {p.personMonths} чел.-мес.</p>
                {p.description && <p style={{ margin: '5px 0 0', fontSize: 13, color: T.ink2, lineHeight: 1.5 }}>{p.description}</p>}
              </div>
            ))}
          </div>

          <div style={cardStyle}>
            <SectionTitle>Загруженные документы</SectionTitle>
            <div style={{ display: 'grid', gap: 8 }}>
              {application.documents.map((d) => (
                <div key={d.docType} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: T.surfaceSunken, borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Icon name="ti-file-text" size={17} color={T.ink2} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.ink }}>{d.docType}</p>
                      <p style={{ margin: 0, fontSize: 11.5, color: T.muted }}>{d.fileName} · {fmtBytes(d.sizeKb)}</p>
                    </div>
                  </div>
                  <Icon name="ti-external-link" size={15} color={T.faint} />
                </div>
              ))}
              {application.documents.length === 0 && <p style={{ fontSize: 13, color: T.faint, margin: 0 }}>Документы не загружены.</p>}
            </div>
          </div>
        </div>

        <div>
          <div style={{ ...cardStyle, position: 'sticky', top: 20 }}>
            <p style={{ fontSize: 12.5, color: T.muted, margin: '0 0 4px', fontWeight: 600 }}>Итоговый балл</p>
            <p style={{ fontSize: 34, fontWeight: 700, margin: '0 0 8px', color: T.ink }}>{result.total}<span style={{ fontSize: 15, color: T.faint, fontWeight: 600 }}> / 100</span></p>
            <span style={pillStyle(tier.tone)}>{tier.label}</span>

            <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
              {result.breakdown.map((b) => (
                <div key={b.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ color: T.ink2, fontWeight: 600 }}>{b.label}</span>
                    <span style={{ fontWeight: 700, color: T.ink }}>{b.points}/{b.max}</span>
                  </div>
                  <div style={{ height: 5, background: T.surfaceSunken, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(b.points / b.max) * 100}%`, background: b.points === b.max ? T.green : b.points === 0 ? T.red : T.accent, borderRadius: 3 }} />
                  </div>
                  <p style={{ fontSize: 11, color: T.muted, margin: '4px 0 0', lineHeight: 1.4 }}>{b.detail}</p>
                </div>
              ))}
            </div>

            {result.reasons.length > 0 && (
              <div style={{ marginTop: 16, padding: 11, background: T.redSoft, borderRadius: 8 }}>
                <p style={{ fontSize: 11.5, color: T.red, margin: '0 0 5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="ti-alert-triangle" size={13} color={T.red} /> Замечания
                </p>
                {result.reasons.map((r, i) => (
                  <p key={i} style={{ fontSize: 11.5, color: T.red, margin: i > 0 ? '4px 0 0' : 0, lineHeight: 1.4 }}>{r}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- PDF-экспорт через печать браузера ----

function exportApplicationPDF(application, tender) {
  const type = APPLICANT_TYPES[application.applicantType];
  const win = window.open('', '_blank');
  const html = `
    <html><head><title>${application.personal.fullName}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; color: #161B22; }
      h1 { font-size: 20px; margin-bottom: 2px; }
      .muted { color: #767D8A; font-size: 12px; }
      .section-title { font-size: 13px; font-weight: bold; color: #1F3A5F; margin-top: 20px; border-bottom: 1px solid #E4E1D9; padding-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
      td { padding: 4px 6px 4px 0; vertical-align: top; }
      td.label { color: #767D8A; width: 160px; }
    </style></head>
    <body>
      <p class="muted">kazAvtoJol — Система управления кандидатами</p>
      <h1>${type.label}</h1>
      <p class="muted">${tender ? tender.title : ''}</p>
      <div class="section-title">Личные данные</div>
      <table>
        <tr><td class="label">ФИО / Фирма</td><td>${application.personal.fullName}</td></tr>
        <tr><td class="label">Email</td><td>${application.personal.email}</td></tr>
        <tr><td class="label">Телефон</td><td>${application.personal.phone}</td></tr>
        <tr><td class="label">Адрес</td><td>${application.personal.address}</td></tr>
      </table>
      <div class="section-title">Специализация</div>
      <table>
        <tr><td class="label">Экспертиза</td><td>${application.specialization.expertise}</td></tr>
        <tr><td class="label">Опыт</td><td>${application.specialization.experienceMonths} чел.-мес.</td></tr>
      </table>
      <div class="section-title">Ключевые проекты</div>
      <table>
        ${application.projects.map((p) => `<tr><td class="label">${p.name}</td><td>${p.client}, ${p.country} · ${p.personMonths} чел.-мес.<br/>${p.description}</td></tr>`).join('')}
      </table>
      <div class="section-title">Загруженные документы</div>
      <table>
        ${application.documents.map((d) => `<tr><td class="label">${d.docType}</td><td>${d.fileName}</td></tr>`).join('') || '<tr><td colspan="2">Не загружены</td></tr>'}
      </table>
    </body></html>
  `;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

export default App;
