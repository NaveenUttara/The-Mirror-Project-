# Mirror Medusa Backend

This workspace contains the MedusaJS replacement backend for The Mirror Project. It is backend-only; there is no Medusa storefront in this workspace because the citizen interface already exists in the repository root.

## Connected services

```text
MedusaJS -> Neon PostgreSQL
          -> Upstash Redis
```

- Neon stores Mirror users, OTP requests, sessions, potholes, reports, photograph metadata, status history, and audit records.
- Upstash supplies Medusa caching, events, workflow state, and distributed locking.
- The current Next.js API uses Cloudflare R2. Medusa photograph workflows still need to call the same private R2 storage layer during the frontend cutover.

## Commands

```powershell
npm install
npm run backend:dev
npm run build
npm run lint
```

Database commands run from `apps/backend`:

```powershell
npm exec medusa db:migrate
npm exec medusa db:generate mirror
```

Generate a new migration only after changing a Mirror model. Never edit an applied migration or migration snapshot.

## Configuration

Copy `apps/backend/.env.template` to `apps/backend/.env` and provide private values. The `.env` file is ignored by Git.

The current configuration requires:

- `DATABASE_URL` for Neon PostgreSQL
- `REDIS_URL` for Upstash Redis over TLS
- CORS origins for the frontend and Medusa administration
- independent JWT, cookie, and MFA encryption secrets

## Current limitation

The frontend has not been switched to this backend. Do not remove the root Next.js Oracle routes until equivalent Medusa authentication and report APIs are complete and tested.
