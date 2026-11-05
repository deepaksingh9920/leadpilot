# LeadPilot

Evidence-first AI prospecting. Specialist agents find real businesses, research them,
score fit, and draft outreach — while every field stays tied to a permitted source and
every send waits for a human decision.

> **Status: Phase 3 complete.** Workspace, authentication, onboarding, plan limits, admin
> configuration, lead management (CSV import, dedupe, provenance, export), campaign
> scaffolding, and the queue/worker job system are implemented and verified. Live agent
> adapters, lead-source connectors, email delivery, and billing activate in later phases
> and stay off until their provider credentials are configured. LeadPilot never fabricates
> leads, contact details, company facts, or sources.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, TypeScript strict, Tailwind CSS v4, Recharts, lucide-react |
| Data | Prisma 6 + SQLite locally (Postgres planned for production) |
| Auth | Custom bcrypt credentials, hashed DB sessions, DB-backed rate limits |
| Email | Resend adapter (verification + password reset) |
| Tests | Vitest |

## Quick start

Requirements: Node.js 26 LTS and npm 11.

```bash
cd leadpilot
npm install
cp .env.example .env.local     # then fill in the values below
npx prisma migrate deploy      # or: npm run db:migrate
npm run db:seed
npm run dev
```

Open <http://localhost:3000>.

On Windows PowerShell, `npm` may be blocked by the execution policy. Use `npm.cmd` and
`npx.cmd` instead.

### Required environment

Copy `.env.example` to `.env.local` (Next.js loads `.env.local` alongside `.env`). Only
these are needed to run the current build:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `file:./dev.db` for the local SQLite database |
| `AUTH_SECRET` | 32-byte random string used to hash session tokens |
| `SESSION_COOKIE_NAME` | Session cookie name (default `leadpilot_session`) |
| `APP_URL` | Absolute app URL, e.g. `http://localhost:3000` |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | Seed-only platform superadmin |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Everything else in `.env.example` is optional and only takes effect once its phase is
implemented:

- `AI_*` — research, scoring rationale, and draft generation.
- `APOLLO_API_KEY`, `PDL_API_KEY`, `GOOGLE_PLACES_API_KEY` — permitted lead sources.
- `RESEND_API_KEY`, `EMAIL_FROM` — verification, reset, and outreach delivery.
- `STRIPE_*` — subscription checkout and plan changes.
- `WORKER_SECRET` — authenticates `POST /api/worker/run`; the endpoint returns 503 while
  it is unset.
- `AGENT_RUNTIME_READY` — must stay `false` until the Phase 4 adapters exist; it gates all
  job execution.

The app reports each provider's real configuration state on **Integrations**; it never
falls back to demo data.

### Seeded data

`npm run db:seed` is idempotent and creates:

- Four public plans: Free, Starter ($49/mo), Professional ($149/mo), Agency ($399/mo),
  with the limits shown on the pricing page.
- Six agent definitions (discovery, research, qualification, outreach, follow-up, radar).
- The bootstrap superadmin from `BOOTSTRAP_ADMIN_EMAIL`, plus an owned
  `platform-admin` workspace so `/admin` is reachable.

> Change the bootstrap password immediately after the first login. Never reuse it in
> staging or production.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest (unit + database integration tests) |
| `npm run db:migrate` | Create/apply a Prisma migration |
| `npm run db:seed` | Seed plans, agents, and bootstrap admin |
| `npm run db:studio` | Open Prisma Studio |

## What is implemented

**Public site** — landing, product/agent overview, security model, and pricing read plans
and agents from the database. Marketing pages are rendered dynamically so admin plan
edits appear immediately.

**Accounts** — signup, login, logout, email verification, forgot/reset password, hashed
sessions, per-IP/per-account rate limits, and audit logging. Email flows report clearly
when no provider is configured.

**Onboarding** — a three-step wizard (business, market, edge) that stores the workspace
profile used as ground truth for later agent work and unlocks the dashboard on completion.

**Workspace** — responsive shell with workspace switcher, dashboard stats and 30-day lead
chart backed by real queries, searchable/filterable/sortable leads, CSV import with column
mapping and row-level reports, lead detail with evidence and activity, campaign creation and
detail, agent catalog and detail with runtime gating, run detail with step logs, integration
status, settings (profile, password, team, usage), and a superadmin console for plans,
limits, agent catalog, and platform audit.

**Lead data** — imports require a rights confirmation, re-parse the uploaded file on the
server, and dedupe by normalized email, then domain, then company + location. Every row keeps
its source and evidence URL; invalid rows are reported, never repaired or invented. Exports
include provenance, verification status, and retrieval dates and are limited by plan.

**Jobs** — a secret-protected worker endpoint atomically claims due jobs with a two-minute
lease, records each step, retries transient failures with backoff, and supports cancellation.
Runs reserve plan usage up front and refund it on cancellation or permanent failure. Live
agent execution stays disabled until the Phase 4 adapters exist.

**Security** — tenant-scoped queries, role hierarchy (viewer/member/admin/owner), audit
logs for sensitive actions, security headers, and server-side limit checks. No outreach
can be sent in this build; the approval gate and send plumbing land in later phases.

## Not implemented yet

- Live agent adapters: the job system, gating, and UI are implemented, but no source or AI
  provider calls are made until Phase 4.
- Lead-source connectors (CSV import is available now).
- Email sending pipeline, suppression list, and outreach approval UI.
- Stripe checkout, webhooks, and paid plan changes.
- Team invitations.
- Postgres deployment and production hardening.

These gaps are shown honestly in the UI rather than simulated. See `docs/ROADMAP.md` for
the phase plan and `docs/ARCHITECTURE.md` for the design.

## Project structure

```
src/
  app/
    (marketing)/     Landing, features, pricing
    (auth)/          Login, signup, reset, verification
    (app)/           Dashboard, leads (import/detail), campaigns
                     (new/detail), agents, runs, integrations,
                     settings, admin
    api/             CSV export and worker endpoints
    onboarding/      Three-step setup wizard
  components/
    app/             Shell, navigation, charts
    auth/            Auth forms
    marketing/       Marketing sections
    onboarding/      Wizard
    settings/        Settings forms
    ui/              Buttons, inputs, cards, badges, alerts
  lib/
    agents/          Runtime gating and input schemas
    auth/            Sessions, roles, rate limits, audit
    jobs/            Queue policy, leases, retry backoff
    leads/           Import mapping and dedupe
    csv.ts           CSV parse/serialize
    validation/      Zod schemas
  server/
    actions/         Server actions (auth, onboarding, leads,
                     imports, campaigns, agents, settings, admin)
    services/        Data access and domain services
  test/              Throwaway database fixtures
prisma/
  schema.prisma      Full data model
  seed.ts            Plans, agents, bootstrap admin
docs/                Architecture, roadmap, compliance, integrations
```

## Testing

```bash
npm run test
```

Unit tests cover CSV parsing, import mapping and dedupe rules, agent input schemas,
runtime gating, job policy, validation, role hierarchy, rate-limit behavior, and formatting
helpers. Database integration tests create a throwaway SQLite database with `prisma db push`
and exercise the real import and job services, including transactions, unique constraints,
retries, cancellation, and usage refunds. The suite is **11 files / 72 tests**.
Before shipping any change, also run `npm run lint`, `npm run typecheck`, and
`npm run build`.

## A note on data ethics

LeadPilot only accepts data from contracted APIs, licensed datasets, or files you have the
right to import. It does not scrape websites or social profiles, and it does not invent
fields that have no evidence. Every send requires explicit human approval. See
`docs/COMPLIANCE.md` before connecting a provider.
