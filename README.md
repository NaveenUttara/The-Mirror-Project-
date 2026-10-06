# The Mirror Project

Citizen pothole reporting application with a Next.js frontend and a MedusaJS backend migration in progress.

## What currently works

### Existing application

```text
Browser -> Next.js on port 3000 -> Next.js API routes -> Oracle FRSCMP
```

This path currently provides OTP login, citizen profiles, report submission, private Cloudflare R2 photograph storage, authenticated photograph retrieval, and dashboard report retrieval. Oracle stores only the R2 object key and file metadata. Keep Oracle available until the Medusa replacement passes end-to-end acceptance testing.

### Connected replacement backend

```text
MedusaJS on port 9000 -> Neon PostgreSQL
                       -> Upstash Redis
```

The Mirror PostgreSQL schema is migrated and Redis connectivity is configured. Medusa now exposes OTP, profile, session, report-submission, report-listing, and private photograph routes. The existing Next.js API routes can proxy to Medusa during the controlled cutover.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `app/` | Next.js interface and current API routes |
| `lib/` | Current JWT, Oracle, and private photograph-path helpers |
| `database/oracle/` | Existing Oracle schema reference |
| `backend/apps/backend/` | MedusaJS replacement backend |
| `backend/apps/backend/src/modules/mirror/` | Mirror PostgreSQL models, service, and migration |
| `docs/` | Technical and developer handover documents |

## Run the existing application

To test the Medusa-backed path, add this server-only value to the root `.env.local`:

```text
MEDUSA_BACKEND_URL=http://localhost:9000
```

If the value is absent, the Next.js routes continue using Oracle for rollback testing.

```powershell
cd "C:\Users\Uttara ERP\mirror-project"
npm install
npm run db:check
npm run dev
```

Open `http://localhost:3000`.

## Production on Vercel (reports and map counts)

Without persistent storage, Vercel serverless functions **reset in-memory demo data**, so the home page can show **0 reports** even after citizens submit complaints.

Configure **one** of these on Vercel (Production):

1. **Recommended — Neon PostgreSQL** (same schema as the Medusa backend):

```text
DATABASE_URL=postgresql://...
```

When `DATABASE_URL` is set, login, reports, dashboard, and the public map use PostgreSQL instead of ephemeral demo memory.

2. **Alternative — Cloudflare R2** for the demo JSON store (see photograph storage below). Reports persist in `mirror-demo/store.json` in your bucket.

For production you typically want **both** `DATABASE_URL` and the four `R2_*` variables (database for reports, R2 for photographs).

Verify:

```powershell
npm run postgres:check
npm run storage:check
```

## Photograph storage

The current report API uploads new photographs to a private Cloudflare R2 bucket. The database stores an object key such as `report-photos/<generated-id>.jpg`, not the image bytes. The dashboard receives an application URL such as `/api/report-photos/123`, sends the signed-in user's bearer token, and displays the returned image. The API confirms that the photograph belongs to that citizen before downloading it from R2.

Add these private values to `.env.local` locally and to the application host's environment-variable settings:

```text
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<bucket-scoped access key>
R2_SECRET_ACCESS_KEY=<bucket-scoped secret key>
R2_BUCKET_NAME=<private bucket name>
```

Use an R2 token restricted to Object Read & Write for this bucket. Do not make the bucket public. Browser CORS configuration is unnecessary for the current server-proxy design because browsers call the same-origin Next.js API rather than R2 directly.

After adding the four values, verify the private connection without printing credentials:

```powershell
npm run storage:check
```

Three photographs created before the R2 change remain under the ignored project `storage/report-photos` folder. Retrieval includes a read-only fallback for those files until they are migrated to R2.

## Email alerts when a citizen submits a report

After a report is saved successfully, the API emails BBMP using GPS zone routing:

| Recipient | Address |
| --- | --- |
| BBMP Commissioner (always) | `comm@bbmp.gov.in` |
| BBMP general grievance (always) | `contactusbbmp@gmail.com` |
| East Zone | `zc-east@bbmp.gov.in` |
| West Zone | `zc-west@bbmp.gov.in` |
| South Zone | `zc-south@bbmp.gov.in` |
| RR Nagar Zone | `zc-rrnagara@bbmp.gov.in` |

The zonal address is chosen from the complaint GPS (approximate Bengaluru bounding boxes in `lib/bbmp-zone-mail.ts`). Refine those boundaries with official BBMP GIS when available.

Configure [Resend](https://resend.com) on Vercel or in `.env.local`:

```text
RESEND_API_KEY=re_xxxxxxxx
REPORT_EMAIL_FROM=reports@your-verified-domain.com
```

Optional extra inboxes (comma-separated):

```text
REPORT_NOTIFY_EMAILS=ops@example.com
```

The message includes report ID, zone, GPS, severity, citizen contact details, a Google Maps link, and the pothole photograph as an attachment. If Resend is not configured, reports still save; email is skipped.

### Railway Medusa path (Gmail SMTP)

When Vercel sets `MEDUSA_BACKEND_URL`, complaint submission is handled by Medusa on Railway. BBMP notification email is sent from the backend after the report is saved (failure is logged only; the complaint is kept).

Add these variables on **Railway** (Gmail App Password recommended):

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-account@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-account@gmail.com
SMTP_CC=your-account@gmail.com
```

Optional:

```text
BBMP_EMAIL_TO=you@example.com
```

When `BBMP_EMAIL_TO` is set, all authority mail goes to that inbox (pilot testing). Zonal routing still appears in the email body. Omit it in production to deliver to BBMP zonal `To` and central `Cc` addresses.

`REPORT_NOTIFY_EMAILS` adds extra `Cc` recipients (comma-separated).

Check Railway logs for `authority_email_sent` or `authority_email_failed`.

## Run the Medusa backend

Create `backend/apps/backend/.env` from `.env.template`, insert private Neon and Upstash credentials, and never commit that file.

```powershell
cd "C:\Users\Uttara ERP\mirror-project\backend"
npm install
npm run backend:dev
```

Medusa normally runs at `http://localhost:9000`.

## Required verification

```powershell
npm run build

cd backend
npm run build
npm run lint
```

## Important security rule

Never commit `.env`, `.env.local`, database passwords, Redis tokens, JWT secrets, photographs, or generated upload folders.

## Remaining integration work

1. Add the four R2 variables to the Medusa runtime and run an end-to-end Medusa-backed report test.
2. Add automated integration tests and address dependency-audit findings before production.
3. Deploy Medusa to Railway and set `MEDUSA_BACKEND_URL` in Vercel to the Railway HTTPS URL.
4. Migrate the existing Oracle records and any legacy local photographs.
5. Retire Oracle only after production data migration, acceptance testing, and rollback approval.
