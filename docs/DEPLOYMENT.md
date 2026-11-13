# Deployment runbook — Vercel + Neon

LeadPilot is a dynamic Next.js application. It needs a persistent Node.js runtime and a
Postgres database, so Bluehost's shared cPanel plan is used only for the domain, DNS, and
business email. The application, worker, and scheduled triggers run on Vercel; the database
is a managed Neon Postgres database.

> **Status of this path.** The Postgres schema, initial migration, Vercel build command, and
> cron route are implemented and covered by local checks. They have **not** been executed
> against a live Neon database or a Vercel deployment from this workspace. Treat every step
> marked **[verify]** as a release gate, not a completed action. Live provider, email, and
> Razorpay checks remain blocked until their real credentials exist.

## 1. Topology

| Piece | Runs on | Notes |
|---|---|---|
| Next.js app, server actions, API routes | Vercel Functions | Node runtime, region close to the Neon database |
| Background queue consumer + retention cleanup | `GET /api/cron/worker` via Vercel Cron | Every minute on Pro; see §7 for Hobby |
| Database | Neon Postgres | Pooled URL at runtime, direct URL for migrations |
| DNS, domain, business email | Bluehost cPanel | Keep the existing nameservers and MX records |
| File storage | None | CSV imports are parsed in memory and not retained |

Local development and the test suite intentionally keep using SQLite
(`prisma/schema.prisma`). Production uses `prisma/postgres/schema.prisma`. A parity test
(`src/lib/prisma-schema-parity.test.ts`) fails if the models drift.

## 2. Prerequisites

- Node.js 22+ locally (this workspace used Node 26) and npm.
- A Neon account and project, or another managed Postgres provider.
- A Vercel account and a Git remote for the `leadpilot` directory. The Git repository root is
  `leadpilot/`, so set Vercel's **Root Directory** to the repository root.
- Bluehost cPanel access for DNS and email.
- Production values for the providers you actually use. Never paste secrets into chat or
  commit them; put them in `.env.local` locally and in Vercel Project Settings → Environment
  Variables.

## 3. Create the database

1. Create a Neon project in the region closest to your Vercel Functions region.
2. Create a database (for example `leadpilot`) and a role owned by it.
3. Copy two connection strings from Neon:
   - **Pooled** connection (host contains `-pooler`). Append `?sslmode=require&pgbouncer=true`
     if it is not already present. This becomes `DATABASE_URL`.
   - **Direct** connection (no `-pooler`). Append `?sslmode=require`. This becomes
     `DIRECT_DATABASE_URL`.
4. Start with a modest pool. For serverless, `connection_limit=1` per function instance is a
   safe starting point with the pooled URL; load-test before raising it.

Do not point production at the SQLite file. `DIRECT_DATABASE_URL` is required by the
production schema even when the command you run does not need a direct connection.

## 4. Apply the schema and seed

Run these from the repository root with the production URLs exported in the current shell.
Use a disposable Neon branch first if you want a rehearsal **[verify]**.

```bash
# Windows PowerShell: prefix npm/npx with the .cmd extension.
export DATABASE_URL="postgresql://...-pooler.../leadpilot?sslmode=require&pgbouncer=true"
export DIRECT_DATABASE_URL="postgresql://.../leadpilot?sslmode=require"

npm run db:generate:pg     # generate the Postgres client
npm run db:migrate:pg      # prisma migrate deploy against DIRECT_DATABASE_URL
npm run db:seed:pg         # idempotent plans, agents, bootstrap superadmin
```

**[verify]** Confirm all tables exist and `_prisma_migrations` contains
`20261111120000_init`. Confirm the seed created four plans, six agent definitions, and the
bootstrap superadmin.

Seeding is idempotent. It does **not** reset the bootstrap password if the account exists, so
set `BOOTSTRAP_ADMIN_EMAIL` and a strong `BOOTSTRAP_ADMIN_PASSWORD` for the first run, sign
in, then change the password immediately.

### Future migrations

1. Change **both** schema files (`prisma/schema.prisma` and `prisma/postgres/schema.prisma`).
   The parity test fails otherwise.
2. Generate the local SQLite migration as usual (`npm run db:migrate`).
3. Generate the Postgres migration against a disposable Neon branch:
   `npm run db:migrate:pg:dev -- --name <change>`.
4. Review and commit both migration folders. Never edit a migration that has been applied.
5. Take a Neon branch/snapshot, then run `npm run db:migrate:pg` against production.

## 5. Configure Vercel

1. Import the repository and set **Framework Preset** to Next.js. Leave the build command
   unset so Vercel uses the `vercel-build` script, which generates the Postgres client before
   `next build`. Do not override it with a plain `next build`.
2. Add the environment variables in §6 to **Production** (and Preview, using a separate Neon
   database/branch).
3. Deploy. The first deploy can succeed before the database is migrated because every page
   and route is dynamic; `/api/health` will report `503` until the database is reachable.
4. **[verify]** Open `/api/health`. It must return `200` with `database: "ok"`,
   `providers.worker: "configured"` once `WORKER_SECRET` or `CRON_SECRET` is set, and
   `providers.credentialStorage: "configured"` once `INTEGRATION_ENCRYPTION_KEY` is set.
5. **[verify]** Sign in with the bootstrap admin, confirm `/admin` loads, and change the
   password. Restrict or rotate the bootstrap credentials afterwards.

## 6. Environment variables

| Variable | Environment | Required | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Production | Yes | Neon **pooled** URL (`?pgbouncer=true`) |
| `DIRECT_DATABASE_URL` | Vercel + local migrations | Yes | Neon **direct** URL for `prisma migrate` |
| `AUTH_SECRET` | Production | Yes | 32+ byte random value; rotating signs everyone out |
| `APP_URL` | Production | Yes | `https://app.yourdomain.com`; used in links and emails |
| `SESSION_COOKIE_NAME` | Production | No | Defaults to `leadpilot_session` |
| `WORKER_SECRET` | Production | One of the two | Authenticates `POST /api/worker/run` |
| `CRON_SECRET` | Production | One of the two | Vercel Cron sends it as `Authorization: Bearer …` |
| `AGENT_RUNTIME_READY` | Production | Yes for jobs | Keep `false` until AI + lead-source keys exist |
| `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` | Production | For research | OpenAI-compatible model; workspaces can override on Integrations |
| `PRIMARY_LEAD_SOURCE`, `APOLLO_API_KEY`, `PDL_API_KEY`, `GOOGLE_PLACES_API_KEY` | Production | For discovery | Permitted source; multiple keys require an explicit primary; workspaces can override |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | Production | For email | Verification, reset, invitations, and outreach; workspaces can override outreach delivery |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Production | For billing | Checkout stays disabled unless all three are set. Billing is deployment-level only |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | Seed only | First run | Strong temporary superadmin credentials |
| `SENTRY_DSN`, `LOG_LEVEL` | Production | No | Optional monitoring |
| `INTEGRATION_ENCRYPTION_KEY` | Production | Yes for UI keys | 32+ character AES-256-GCM key for per-workspace credentials. Without it the forms stay disabled and stored rows fail closed |
| `RATE_LIMIT_WINDOW_SECONDS` | — | No | Reserved; rate-limit windows are defined in `src/lib/auth/rate-limits.ts` |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Use header-safe characters for `CRON_SECRET` (letters and numbers). Vercel does not allow you
to read a sensitive value back after saving it, so store it in your own secret manager.

`INTEGRATION_ENCRYPTION_KEY` must be stable for the life of the data: changing it makes every
previously saved workspace credential unreadable. Save the value in your secret manager
before adding it to Vercel. Workspace owners/admins can then enter their own AI, lead-source,
and Resend keys on **Integrations**; the saved values are encrypted and never returned to
the browser. Add the variable and redeploy first, because Vercel env changes do not apply to
an existing deployment.

## 7. Scheduled worker

`vercel.json` registers the cron job:

```json
{ "crons": [{ "path": "/api/cron/worker", "schedule": "* * * * *" }] }
```

Vercel Cron sends `GET` requests, which is why `/api/cron/worker` exposes `GET` and
`/api/worker/run` keeps `POST` for manual use. Both call the same service
(`src/server/services/worker-tick.ts`), so jobs and retention cleanup cannot diverge.
`maxDuration` is set to 60 seconds.

**Plan limitation:** Vercel Hobby allows only one cron run per day; an every-minute expression
fails the deployment. Choose one of:

- **Vercel Pro (recommended):** keep `* * * * *`.
- **Hobby:** change the schedule to `0 6 * * *`, or remove `crons` and call
  `GET /api/cron/worker` from an external scheduler every minute with
  `Authorization: Bearer $CRON_SECRET`. External schedulers are limited by Vercel's function
  invocations and duration.

Cron delivery is best effort and may duplicate or miss a run. The job queue already uses
atomic lease claiming, and retention cleanup is idempotent, so a duplicate tick is safe; a
missed tick just delays queued work until the next run.

**[verify]** Trigger the endpoint with a real secret and confirm a `200` plus a JSON body with
`claimed`, `results`, `retention`, and `trigger: "cron"`. Confirm an unauthenticated request
returns `401` and that the cron appears under Vercel → Schedules → Cron Jobs.

## 8. Domain and DNS on Bluehost

Keep Bluehost's nameservers unless you deliberately move **all** DNS to Vercel. Moving
nameservers without recreating the email records will break business email.

1. In Vercel → Project → Domains, add the apex domain and `www`, then read the exact records
   Vercel asks for (typically an `A` record for the apex and a `CNAME` for `www`).
2. In Bluehost cPanel → DNS Zone Editor, add only those records. Remove conflicting old
   `A`/`CNAME` records for the same hostnames; do not touch `MX`, `TXT` (SPF/DKIM/DMARC), or
   autodiscover records.
3. Set `APP_URL` to the canonical HTTPS URL and redeploy so links and cookies use it.
4. **[verify]** `https://<domain>/api/health` returns `200`; `http` redirects to `https`; the
   apex and `www` both resolve; login cookies work on the canonical host.
5. Keep Bluehost for business email. If you send product email through Resend, use a sending
   subdomain (for example `send.yourdomain.com`) and add Resend's SPF/DKIM records next to the
   existing Bluehost email records rather than replacing them.

## 9. Razorpay webhook

1. In the Razorpay dashboard, create the monthly/yearly plan IDs and paste each into
   **Admin → Plans** (`PlanProviderPrice`), matching the plan and interval.
2. Register `POST https://<domain>/api/billing/razorpay` and set
   `RAZORPAY_WEBHOOK_SECRET` to the dashboard's signing secret.
3. Subscribe to the subscription events documented in `docs/INTEGRATIONS.md`
   (`subscription.activated`, `charged`, `pending`, `halted`, `paused`, `resumed`,
   `cancelled`, `completed`).
4. **[verify]** Run a test-mode checkout. The plan must change only after the signed webhook
   is processed, exactly once on replay, and the audit log must record the event.

## 10. Monitoring, backups, and restore

- Point an uptime monitor at `/api/health`; alert on any non-200 or `database != "ok"`.
- Enable Vercel log drains or set `SENTRY_DSN` if you want error aggregation. Application logs
  are the operational trail; `AuditLog` is the business trail.
- Confirm Neon's backup/PITR window for your plan. Take a manual logical backup before risky
  releases:

  ```bash
  pg_dump "$DIRECT_DATABASE_URL" --format=custom --no-owner \
    --file="leadpilot-$(date +%Y%m%d-%H%M).dump"
  ```

- Rehearse restore into a **new** Neon branch/database, never over production without a
  written decision:

  ```bash
  pg_restore --no-owner --clean --if-exists \
    --dbname="$RESTORE_DATABASE_URL" leadpilot-YYYYMMDD-HHMM.dump
  ```

- **[verify]** Restore a backup into a branch, point a Preview deployment at it, and confirm
  sign-in plus `/api/health`. Record the restore date and duration.

## 11. Rollback

**Application:** Vercel → Deployments → the last known-good deployment → Instant Rollback.
Cron definitions and `CRON_SECRET` are restored with the deployment. Verify `/api/health`
after the rollback.

**Database:** migrations are forward-only and there are no down migrations. Before a risky
migration, create a Neon branch or snapshot. To roll back, restore the branch/database and
roll the application back together; do not run an older app against a newer schema without
checking the change.

**Bad configuration:** environment-variable changes require a redeploy. Rotating
`CRON_SECRET` also requires a redeploy before Vercel sends the new value.

## 12. Key rotation

| Secret | Procedure | Side effect |
|---|---|---|
| `AUTH_SECRET` | Set a new 32+ byte value, redeploy | All sessions become invalid; users must sign in |
| `WORKER_SECRET` / `CRON_SECRET` | Set new value, redeploy, check the next cron run | Old callers receive `401` |
| Neon password | Rotate in Neon, update both URLs, redeploy | Brief connection errors during rollout |
| Provider keys | Create the new key, update Vercel, redeploy, revoke the old key | Provider calls fail until the new value is live |
| Razorpay keys/webhook secret | Update both the dashboard and Vercel, redeploy | Webhooks fail signature verification until both sides match |

Never log secrets. The `/api/health` payload exposes only configuration booleans.

## 13. Post-deploy smoke test

Run on the production URL with a real account and the provider keys you have:

- [ ] Marketing pages render: `/`, `/features`, `/pricing`; no console errors.
- [ ] Signup/login, email verification (if Resend is configured), and password reset.
- [ ] Onboarding creates a workspace and a business profile.
- [ ] CSV import: valid rows import, duplicates are reported, invalid rows are listed.
- [ ] Lead table search is case-insensitive, filters and pagination work.
- [ ] Agent run with a real lead source and AI key; status moves through the queue.
- [ ] Integrations: save an AI/lead-source/Resend key as owner or admin, confirm the badge
  changes to "Workspace key", reload, and confirm the key is never shown again. Remove it
  and confirm the deployment default returns. A member or viewer sees a read-only page.
- [ ] Draft creation, approval, and blocked send without a mailing address.
- [ ] Approval-gated send with Resend; unsubscribe link works; suppression blocks a resend.
- [ ] Manual outcome logging; opens remain explicitly untracked.
- [ ] Settings: retention window, approval policy, DSAR export, ownership transfer.
- [ ] Admin: plan assignment, feature switches, audit search/filter/pagination.
- [ ] Razorpay test checkout and verified webhook (when test keys exist).
- [ ] `/api/health` is `200`; `providers.credentialStorage` is `configured` after setting
  `INTEGRATION_ENCRYPTION_KEY`; cron runs are visible; retention cleanup is reported.
- [ ] Mobile-width spot check at 390px (full mobile QA remains outstanding).

## 14. Known gaps at launch

- The Postgres migration has only been generated/validated locally; it has not been applied
  to a live database from this workspace.
- Vercel Cron has not been exercised in a deployed environment.
- Live email, provider calls, and Razorpay remain blocked on real credentials.
- Saving workspace credentials from the UI needs `INTEGRATION_ENCRYPTION_KEY` in the Vercel
  environment; changing that key later makes previously saved rows unreadable.
- Opens are untracked and provider reply/bounce webhooks are not connected; outcomes are
  manual.
- `COMPETITOR_RESEARCH`, `EMAIL_OUTREACH`, and `FOLLOW_UP` have no executors and stay
  disabled.
- Audit records are application-level only; external tamper evidence is not implemented.
- Workspace-count limits are displayed but not enforced because there is no account-level
  billing/workspace-creation model.
- `npm audit --omit=dev` still reports the Prisma `deepmerge-ts` advisory; fixing it requires
  a Prisma 7 upgrade.
