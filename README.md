# ATS for HR (kazAvtoJol)

Tender and vacancy application system. A static React site (GitHub Pages) with a Firebase backend:

| Part | Service | Where in the repo |
|---|---|---|
| Tenders, applications, scores | Cloud Firestore | `src/backend.js`, `firestore.rules` |
| Uploaded documents and CVs | Cloud Storage | `src/backend.js`, `storage.rules` |
| AI scoring of proposed experts | Cloud Function (calls Claude) | `functions/` |
| Applicant types, default documents, disqualification reasons | Plain code | `src/referenceData.js` |

## Setting up the backend

Allow about 20 minutes.

### 1. Create the Firebase project

1. Open https://console.firebase.google.com and click **Add project**. Google Analytics is optional; you can turn it off.
2. Upgrade the project to the **Blaze (pay-as-you-go)** plan. Cloud Storage and Cloud Functions currently require it. Both include a monthly free allowance that a small HR system is unlikely to exceed, but you will need a billing card. Set a budget alert under Google Cloud console → Billing → Budgets & alerts.

### 2. Create the database and file storage

1. **Build → Firestore Database → Create database.** Pick a location close to your users (for example `eur3` or `europe-west1`) and start in **production mode**. The real rules are deployed in step 5.
2. **Build → Storage → Get started.** Production mode, same region.

### 3. Connect the site to the project

1. **Project settings (gear icon) → General → Your apps → Web (`</>`).** Register an app (skip Firebase Hosting; the site stays on GitHub Pages).
2. Copy the `firebaseConfig` values into `src/firebase.js`.

These values only identify your project and are safe to publish. Access is controlled by the rules files, not by hiding them.

### 4. Get an Anthropic API key

Create one at https://console.anthropic.com. It is stored only on the server (step 5), never in the site.

### 5. Deploy rules and the AI function

```bash
npm install -g firebase-tools
firebase login
firebase use --add                  # choose your project
(cd functions && npm install)
firebase functions:secrets:set ANTHROPIC_API_KEY     # paste the key when asked
firebase deploy --only firestore:rules,storage,functions
```

The first deploy asks to enable a few Google Cloud services (Cloud Build, Artifact Registry, Secret Manager); answer yes. It can take several minutes.

The function runs in `europe-west1`. If you change the region in `functions/index.js`, change `FUNCTIONS_REGION` in `src/firebase.js` to match. To use a different Claude model, create `functions/.env` containing `ANTHROPIC_MODEL=<model name>` and redeploy.

### 6. Publish the site

Commit and push to `main`. The existing GitHub Actions workflow rebuilds and publishes the site.

### 7. Smoke test

1. HR cabinet → **Новый тендер** → add a position → publish.
2. Applicant cabinet → apply to it and upload the required documents (try a file with a Cyrillic name).
3. HR cabinet → open the application → **Предложить оценку (AI)** → approve a score.

If the AI button shows an error banner, the message is the function's own (missing key, wrong model, and so on). Logs are in Firebase console → Functions → Logs.

## Customising

- **Applicant types, default required documents, disqualification reasons:** edit `src/referenceData.js` and push. The values there are placeholders; replace them with the ones from your ToR. Do not rename an applicant type `key` once tenders use it.
- **Scoring prompt:** `functions/scoring.js`. Run its tests with `cd functions && npm test`.

## Things to know

- **There is no login.** The "Applicant / HR" switch is only a UI toggle, so anyone who opens the site can use the HR cabinet, approve applications and read applicant data. The rules in `firestore.rules` allow exactly what the app does (nothing can be deleted, tenders cannot be edited, applications can only change status and scores), but they cannot tell HR from applicants. Adding Firebase Authentication for HR users and requiring `request.auth` in the update rules is the proper fix.
- **Uploaded files are readable by anyone who has the link**, because the app links to them directly. Files can be uploaded once but never overwritten or deleted. For sensitive documents, require sign-in in `storage.rules` and switch to signed download links.
- **AI cost is capped but not locked down.** `aiScoreExpert` accepts calls from any visitor to the site, limited to 5 concurrent instances. Firebase App Check or HR sign-in would close this fully.
- **Firebase projects are not paused for inactivity**, unlike Supabase's free plan.
- The security rules were reviewed by hand but not run against the Firebase emulator, which could not be downloaded where this was built. After deploying, the smoke test above exercises every rule the app relies on.
