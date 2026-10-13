-- ============================================================================
-- ATS for HR (kazAvtoJol) — Supabase schema
--
-- Run once in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (uses IF NOT EXISTS / ON CONFLICT / DROP POLICY IF EXISTS).
--
-- Reconstructed from src/supabaseClient.js and src/App.jsx. The seed data in
-- section 2 (applicant types, default documents, disqualification reasons) is
-- a placeholder: edit it to match your real ToR before going live.
-- ============================================================================


-- ============================================================================
-- 1. Tables
-- ============================================================================

-- ---- Reference data --------------------------------------------------------

create table if not exists public.applicant_types (
  key         text primary key,                 -- e.g. 'contractor'
  label       text not null,                    -- full name shown in forms
  short_label text not null,                    -- short badge in HR lists
  icon        text not null default 'ti-user',  -- Tabler icon class
  is_firm     boolean not null default false,   -- true: form asks for firm name
  sort_order  int not null default 0
);

create table if not exists public.required_document_types (
  id                 uuid primary key default gen_random_uuid(),
  applicant_type_key text not null references public.applicant_types(key) on delete cascade,
  doc_name           text not null,
  sort_order         int not null default 0,
  unique (applicant_type_key, doc_name)
);

create table if not exists public.disqualification_reasons (
  code        int primary key,
  reason_text text not null
);

-- ---- Tenders ---------------------------------------------------------------

create table if not exists public.tenders (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  applicant_type_key text not null references public.applicant_types(key),
  jd_file_path       text,
  jd_file_name       text,
  status             text not null default 'open' check (status in ('open', 'closed')),
  created_at         timestamptz not null default now()
);

create table if not exists public.tender_positions (
  id                      uuid primary key default gen_random_uuid(),
  tender_id               uuid not null references public.tenders(id) on delete cascade,
  name                    text not null,
  is_international        boolean not null default true,
  weight                  numeric not null default 100,
  sort_order              int not null default 0,
  criterion_a_label       text not null default 'General Qualification',
  criterion_a_weight      numeric not null default 0.15,
  criterion_a_requirement text not null default '',
  criterion_b_label       text not null default 'Experience and specialization',
  criterion_b_weight      numeric not null default 0.70,
  criterion_b_requirement text not null default '',
  criterion_c_label       text not null default 'Overseas/Country experience',
  criterion_c_weight      numeric not null default 0.15,
  criterion_c_requirement text not null default ''
);

create table if not exists public.tender_required_documents (
  id         uuid primary key default gen_random_uuid(),
  tender_id  uuid not null references public.tenders(id) on delete cascade,
  doc_name   text not null,
  sort_order int not null default 0
);

-- ---- Applications ----------------------------------------------------------

create table if not exists public.applications (
  id                 uuid primary key default gen_random_uuid(),
  tender_id          uuid not null references public.tenders(id) on delete cascade,
  applicant_type_key text not null references public.applicant_types(key),
  full_name          text not null,
  firm_name          text,
  email              text not null,
  phone              text,
  address            text,
  citizenship        text,
  status             text not null default 'submitted'
                       check (status in ('submitted', 'approved', 'declined')),
  submitted_at       timestamptz not null default now()
);

create table if not exists public.application_documents (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  doc_name       text not null,
  file_path      text not null,
  file_name      text not null,
  size_kb        int,
  mime_type      text,
  uploaded_at    timestamptz not null default now()
);

create table if not exists public.application_experts (
  id                        uuid primary key default gen_random_uuid(),
  application_id            uuid not null references public.applications(id) on delete cascade,
  tender_position_id        uuid not null references public.tender_positions(id) on delete cascade,
  full_name                 text not null,
  citizenship               text,
  cv_file_path              text,
  cv_file_name              text,
  education_summary         text,
  general_experience_years  numeric,
  relevant_projects         text,
  country_experience        text,
  created_at                timestamptz not null default now()
);

-- ---- Scoring ---------------------------------------------------------------

create table if not exists public.expert_scores (
  id                    uuid primary key default gen_random_uuid(),
  application_expert_id uuid not null references public.application_experts(id) on delete cascade,
  criterion             text not null check (criterion in ('A', 'B', 'C')),
  rating                int  not null check (rating between 0 and 100),
  justification         text,
  source                text not null check (source in ('ai', 'human')),
  reviewed_by           text,
  updated_at            timestamptz not null default now(),
  -- required by .upsert(..., { onConflict: 'application_expert_id,criterion' })
  unique (application_expert_id, criterion)
);

create table if not exists public.expert_disqualifications (
  id                    uuid primary key default gen_random_uuid(),
  application_expert_id uuid not null references public.application_experts(id) on delete cascade,
  reason_code           int references public.disqualification_reasons(code),
  reason_text           text,
  flagged_by            text,
  created_at            timestamptz not null default now(),
  -- required by .upsert(..., { onConflict: 'application_expert_id' })
  unique (application_expert_id)
);

-- ---- Indexes on foreign keys ----------------------------------------------

create index if not exists idx_tender_positions_tender        on public.tender_positions (tender_id);
create index if not exists idx_tender_required_docs_tender    on public.tender_required_documents (tender_id);
create index if not exists idx_applications_tender            on public.applications (tender_id);
create index if not exists idx_application_documents_app      on public.application_documents (application_id);
create index if not exists idx_application_experts_app        on public.application_experts (application_id);
create index if not exists idx_application_experts_position   on public.application_experts (tender_position_id);
create index if not exists idx_expert_scores_expert           on public.expert_scores (application_expert_id);


-- ============================================================================
-- 2. Seed data (PLACEHOLDERS — edit to match your real ToR)
-- ============================================================================

insert into public.applicant_types (key, label, short_label, icon, is_firm, sort_order) values
  ('contractor', 'Подрядчик (фирма)',            'Подрядчик',   'ti-building',  true,  1),
  ('consultant', 'Консалтинговая фирма',         'Консультант', 'ti-briefcase', true,  2),
  ('individual', 'Индивидуальный консультант',   'Индивидуал',  'ti-user',      false, 3),
  ('candidate',  'Кандидат на вакансию',         'Кандидат',    'ti-id-badge',  false, 4)
on conflict (key) do nothing;

insert into public.required_document_types (applicant_type_key, doc_name, sort_order) values
  ('contractor', 'Учредительные документы (устав)',                 1),
  ('contractor', 'Свидетельство о государственной регистрации',     2),
  ('contractor', 'Справка об отсутствии налоговой задолженности',   3),
  ('contractor', 'Лицензия на соответствующий вид деятельности',    4),
  ('contractor', 'Финансовая отчётность за последний год',          5),
  ('consultant', 'Учредительные документы (устав)',                 1),
  ('consultant', 'Свидетельство о государственной регистрации',     2),
  ('consultant', 'Справка об отсутствии налоговой задолженности',   3),
  ('consultant', 'Подтверждение опыта выполнения аналогичных услуг',4),
  ('individual', 'Удостоверение личности',                          1),
  ('individual', 'Диплом об образовании',                           2),
  ('individual', 'Подтверждение трудового стажа',                   3),
  ('candidate',  'Удостоверение личности',                          1),
  ('candidate',  'Диплом об образовании',                           2),
  ('candidate',  'Подтверждение трудового стажа',                   3)
on conflict (applicant_type_key, doc_name) do nothing;

insert into public.disqualification_reasons (code, reason_text) values
  (1, 'Не соответствует минимальным требованиям по образованию'),
  (2, 'Общий стаж работы ниже минимально требуемого'),
  (3, 'Отсутствует релевантный опыт по специализации позиции'),
  (4, 'Представлены недостоверные сведения'),
  (5, 'Эксперт предложен более чем одним участником в рамках одного тендера'),
  (6, 'Отсутствуют подтверждающие документы')
on conflict (code) do nothing;


-- ============================================================================
-- 3. Row Level Security
--
-- The app has no login: the browser talks to Supabase as the `anon` role, and
-- the "Applicant / HR" switch is only a UI toggle. These policies therefore
-- allow exactly the operations the app performs, and nothing more (no deletes
-- on tenders/applications, reference tables are read-only).
-- To lock the HR side down properly, add Supabase Auth and restrict the
-- update/insert policies below to authenticated HR users.
-- ============================================================================

alter table public.applicant_types           enable row level security;
alter table public.required_document_types   enable row level security;
alter table public.disqualification_reasons  enable row level security;
alter table public.tenders                   enable row level security;
alter table public.tender_positions          enable row level security;
alter table public.tender_required_documents enable row level security;
alter table public.applications              enable row level security;
alter table public.application_documents     enable row level security;
alter table public.application_experts       enable row level security;
alter table public.expert_scores             enable row level security;
alter table public.expert_disqualifications  enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

do $$
declare
  p      record;
  clause text;
  pname  text;
begin
  for p in
    select * from (values
      ('applicant_types',            'select'),
      ('required_document_types',    'select'),
      ('disqualification_reasons',   'select'),

      ('tenders',                    'select'),
      ('tenders',                    'insert'),
      ('tender_positions',           'select'),
      ('tender_positions',           'insert'),
      ('tender_required_documents',  'select'),
      ('tender_required_documents',  'insert'),

      ('applications',               'select'),
      ('applications',               'insert'),
      ('applications',               'update'),   -- approve / decline
      ('application_documents',      'select'),
      ('application_documents',      'insert'),
      ('application_experts',        'select'),
      ('application_experts',        'insert'),

      ('expert_scores',              'select'),
      ('expert_scores',              'insert'),   -- upsert = insert ...
      ('expert_scores',              'update'),   -- ... on conflict do update
      ('expert_disqualifications',   'select'),
      ('expert_disqualifications',   'insert'),
      ('expert_disqualifications',   'update'),
      ('expert_disqualifications',   'delete')    -- "remove disqualification"
    ) as t(tbl, cmd)
  loop
    clause := case p.cmd
      when 'insert' then 'with check (true)'
      when 'update' then 'using (true) with check (true)'
      else 'using (true)'
    end;
    pname := 'ats_' || p.cmd || '_' || p.tbl;
    execute format('drop policy if exists %I on public.%I', pname, p.tbl);
    execute format('create policy %I on public.%I for %s to anon, authenticated %s',
                   pname, p.tbl, p.cmd, clause);
  end loop;
end $$;


-- ============================================================================
-- 4. Storage buckets
--
-- Both buckets are public because the app builds links with getPublicUrl().
-- Anyone who has a file's URL can open it.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit) values
  ('tender-docs',      'tender-docs',      true, 20971520),  -- 20 MB (ToR / JD files)
  ('application-docs', 'application-docs', true, 10485760)   -- 10 MB (documents, CVs)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "ats_storage_insert" on storage.objects;
create policy "ats_storage_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id in ('tender-docs', 'application-docs'));

drop policy if exists "ats_storage_select" on storage.objects;
create policy "ats_storage_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('tender-docs', 'application-docs'));


-- Make the new tables visible to the API immediately.
notify pgrst, 'reload schema';
