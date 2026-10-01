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
