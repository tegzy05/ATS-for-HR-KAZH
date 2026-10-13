// Reference data that used to live in database tables. It changes rarely, so it
// is kept in code: edit it here and push, no database seeding step needed.
// PLACEHOLDERS: adjust to match your real ToR before going live.

// key        – stored on tenders and applications (do not rename once in use)
// label      – full name shown in forms
// short_label – short badge in HR lists
// icon       – Tabler icon class
// is_firm    – true: the form asks for a firm name instead of a person's name
export const APPLICANT_TYPES = [
  { key: 'contractor', label: 'Подрядчик (фирма)',          short_label: 'Подрядчик',   icon: 'ti-building',  is_firm: true },
  { key: 'consultant', label: 'Консалтинговая фирма',       short_label: 'Консультант', icon: 'ti-briefcase', is_firm: true },
  { key: 'individual', label: 'Индивидуальный консультант', short_label: 'Индивидуал',  icon: 'ti-user',      is_firm: false },
  { key: 'candidate',  label: 'Кандидат на вакансию',       short_label: 'Кандидат',    icon: 'ti-id-badge',  is_firm: false },
];

// Default required documents per applicant type; HR can edit the list for each
// tender when publishing it.
const FIRM_DOCS = [
  'Учредительные документы (устав)',
  'Свидетельство о государственной регистрации',
  'Справка об отсутствии налоговой задолженности',
];
const PERSON_DOCS = [
  'Удостоверение личности',
  'Диплом об образовании',
  'Подтверждение трудового стажа',
];

const DEFAULT_DOCS = {
  contractor: [...FIRM_DOCS, 'Лицензия на соответствующий вид деятельности', 'Финансовая отчётность за последний год'],
  consultant: [...FIRM_DOCS, 'Подтверждение опыта выполнения аналогичных услуг'],
  individual: PERSON_DOCS,
  candidate: PERSON_DOCS,
};

export const REQUIRED_DOCUMENT_TYPES = Object.entries(DEFAULT_DOCS).flatMap(([applicant_type_key, docs]) =>
  docs.map((doc_name, i) => ({ applicant_type_key, doc_name, sort_order: i }))
);

// Reasons HR can pick when disqualifying an expert (code is stored on the expert)
export const DISQUALIFICATION_REASONS = [
  { code: 1, reason_text: 'Не соответствует минимальным требованиям по образованию' },
  { code: 2, reason_text: 'Общий стаж работы ниже минимально требуемого' },
  { code: 3, reason_text: 'Отсутствует релевантный опыт по специализации позиции' },
  { code: 4, reason_text: 'Представлены недостоверные сведения' },
  { code: 5, reason_text: 'Эксперт предложен более чем одним участником в рамках одного тендера' },
  { code: 6, reason_text: 'Отсутствуют подтверждающие документы' },
];
