# Setting up a new Supabase backend

The app is a static React site (GitHub Pages) that stores everything in one Supabase project: a Postgres database, two file buckets, and one edge function for AI scoring. These steps create a fresh project and point the app at it. Allow about 15 minutes.

## 1. Create the project

1. Go to https://supabase.com/dashboard and create a new project (free plan is fine).
2. Wait until it finishes provisioning.

## 2. Create the database and storage

1. Open **SQL Editor → New query**.
2. Paste the whole contents of `supabase/schema.sql` and press **Run**.
3. Check:
   - **Table Editor** lists 11 tables (`applicant_types`, `tenders`, `applications`, …).
   - **Storage** lists two buckets: `tender-docs` and `application-docs`.

The schema also inserts placeholder reference data: 4 applicant types, default required documents for each, and 6 disqualification reasons. Edit these in **Table Editor** (or in section 2 of `schema.sql` before running) so they match your real ToR.

## 3. Point the app at the new project

1. In the dashboard open **Project Settings → API Keys** (or the **Connect** button) and copy the **Project URL** and the **publishable key** (`sb_publishable_…`).
2. In `src/supabaseClient.js` replace lines 3 and 4:

```js
const SUPABASE_URL = 'https://<your-project-ref>.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_...';
```

The publishable key is designed to be public. Never put a `secret` or `service_role` key in this file.

## 4. Deploy the AI scoring function

You need an Anthropic API key (https://console.anthropic.com).

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy ai-score-expert --no-verify-jwt
```

`--no-verify-jwt` is needed because the browser calls the function with the publishable key, which is not a JWT.

Optional secrets:
- `ALLOWED_ORIGIN=https://<your-github-username>.github.io` limits which sites may call the function (default is any).
- `ANTHROPIC_MODEL=<model>` overrides the default model.

No CLI? In the dashboard use **Edge Functions → Deploy a new function**, paste `supabase/functions/ai-score-expert/index.ts`, switch **Verify JWT** off, and add `ANTHROPIC_API_KEY` under **Edge Functions → Secrets**.

## 5. Deploy the site

Commit and push to `main`. The existing GitHub Actions workflow rebuilds and publishes the site automatically.

## 6. Smoke test

1. HR cabinet → **Новый тендер** → add a position and publish.
2. Applicant cabinet → apply to it, upload the required documents.
3. HR cabinet → open the application → **Предложить оценку (AI)** → approve a score.

If step 3 fails with an error banner, the message shown is the function's own error (missing key, wrong model, etc.).

## Things to know

- **Free projects pause after a period of inactivity.** This is the most common reason a free Supabase project suddenly stops working. If the site may sit unused for a week or more, upgrade the plan or add a scheduled request (for example a GitHub Actions cron) that reads one row every few days.
- **There is no login.** The "Applicant / HR" switch is only a UI toggle, so anyone who opens the site can use the HR cabinet, approve applications and read applicant data. The database policies in `schema.sql` allow exactly what the app does and no more, but they cannot tell HR from applicants. Adding Supabase Auth for HR users is the proper fix.
- **Uploaded files are publicly readable by URL**, because the app links to them with public URLs. For sensitive documents, switch the buckets to private and use signed URLs.
- File names are stored in ASCII-safe form inside the buckets (the original name is kept in the database for display), so Cyrillic and Kazakh file names upload correctly.
