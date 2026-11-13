# LeadPilot

Evidence-first AI prospecting. Specialist agents find real businesses, research them,
score fit, and draft outreach — while every field stays tied to a permitted source and
every send waits for a human decision.

> **Status: Phase 5B enforcement, admin, and security hardening in progress.** Workspace,
> authentication, onboarding, plan limits, admin configuration, lead management (CSV
> import, dedupe, provenance, export), campaigns, the queue/worker job system, grounded
> agent execution, approval-gated outreach, field-level verification, campaign outcome
> analytics, and Razorpay subscription billing are implemented and verified. The admin
> console also assigns plans to individual workspaces (refusing live provider-managed
> subscriptions), searches the platform audit log with filters and pagination, and controls
> platform-wide feature switches for signups, CSV import, and outreach sending. Workspace
> admins and owners can invite teammates by email; pending invitations reserve a seat, only
> the owner can invite another admin, and a new teammate can create an account from the
> invite link with a verified email. Lead discovery can use Apollo, People Data Labs, or
> Google Places; research/qualification use an OpenAI-compatible model; outreach drafts are
> grounded in stored facts with template fallbacks. Every send requires an admin approval
> bound to a content hash, re-checks the suppression list, and carries a signed one-click
> unsubscribe link plus the workspace mailing address. Field checks are human attestations
> by an admin with optional evidence, and overall lead verification is derived from
> populated fields rather than provider claims. Campaign outcomes (replied, meeting, hard
> bounce) are logged manually; opens stay explicitly untracked because no email webhook is
> connected. Billing checkout runs on Razorpay's hosted payment page, and a paid plan
> activates only from a signature-verified, idempotent webhook. Security hardening now
> centralizes every rate-limit policy, applies a reviewed CSP/headers set on every route,
> authenticates the worker in constant time, and documents the threat model and residual
> risks in `docs/SECURITY.md`. Public pages expose a generated `robots.txt` and `sitemap.xml`;
> workspace, admin, auth, onboarding, invitation, and unsubscribe screens send `noindex` so
> customer data and token-bearing URLs stay out of search results. Compliance controls are now enforced too: workspace admins
> choose a lead-retention window (soft delete, then permanent purge after a 30-day grace),
> set outreach approval to admins/owners or owner-only, download a JSON DSAR bundle, run
> retention cleanup, and soft-delete the workspace after typed confirmation and password
> re-check. The owner can transfer workspace ownership to another member or admin with a
> password re-check; roles and ownerId move atomically and the event is audit-logged. Any
> signed-in member can close their own account after transferring or deleting workspaces they
> own; closure anonymizes the profile and revokes credentials without erasing workspace
> records. The production deployment path is prepared: a Postgres schema and initial migration
> sit beside the SQLite development schema with a parity test, Vercel serves the app, Neon
> hosts Postgres, and a Vercel Cron endpoint drains the worker queue. The Postgres migration
> and the cron schedule have not yet been exercised against a live database or deployment.
> Remaining Phase 5 work is workspace-count enforcement and follow-up agents.
> LeadPilot never fabricates leads, contact details, company facts, sources, opens, or
> replies.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, TypeScript strict, Tailwind CSS v4, Recharts, lucide-react |
| Data | Prisma 6 + SQLite for local development and tests; Postgres for production |
| Auth | Custom bcrypt credentials, hashed DB sessions, DB-backed rate limits |
| Email | Resend adapter for verification, reset, invitations, and approval-gated outreach |
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
| `DATABASE_URL` | `file:./dev.db` for the local SQLite database; Neon pooled URL in production |
| `DIRECT_DATABASE_URL` | Production-only: Neon direct URL used by `prisma migrate` |
| `AUTH_SECRET` | 32-byte random string used to hash session tokens |
| `SESSION_COOKIE_NAME` | Session cookie name (default `leadpilot_session`) |
| `APP_URL` | Absolute app URL, e.g. `http://localhost:3000` |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | Seed-only platform superadmin |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Everything else in `.env.example` is optional and takes effect only when its feature is
configured:

- `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` — grounded research and qualification. Calls are
  made only when these are set and `AGENT_RUNTIME_READY=true`. Workspace owners/admins can
  instead save their own AI key and model on **Integrations**.
- `APOLLO_API_KEY`, `PDL_API_KEY`, `GOOGLE_PLACES_API_KEY` — permitted lead sources.
  `PRIMARY_LEAD_SOURCE` picks one explicitly; with no explicit choice, exactly one
  configured key is used, and multiple keys fail closed. CSV import always works. A
  workspace can save its own lead-source key on **Integrations**, which overrides these.
- `RESEND_API_KEY`, `EMAIL_FROM` — verification, reset, and outreach delivery. Without
  them the UI reports delivery is unconfigured and outreach messages stay approved; nothing
  is simulated. Sends also require a workspace mailing address in **Settings**. A workspace
  can save its own Resend key and sender on **Integrations** for outreach; account email
  keeps using the deployment sender.
- `INTEGRATION_ENCRYPTION_KEY` — 32+ character key that encrypts workspace credentials with
  AES-256-GCM. It is required before **Integrations** can save a key; without it the forms
  stay disabled and any stored row fails closed. Keep it stable: rotating it makes existing
  saved credentials unreadable until they are entered again.
- `EMAIL_REPLY_TO` — optional default reply-to; outreach prefers the workspace sender
  email when one is set.
- `BILLING_PROVIDER`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `RAZORPAY_WEBHOOK_SECRET` — subscription checkout and plan changes. Checkout is refused
  until the keys **and** webhook secret are set, so payment can never be taken without an
  activation path. A workspace owner starts checkout on **Settings → Plan and usage**; the
  monthly/yearly Razorpay `plan_id` values are pasted into the admin console. Paid plans
  change only after a verified `POST /api/billing/razorpay` webhook. Without these values
  the workspace stays on Free and no payment method is collected.
- `WORKER_SECRET` — authenticates `POST /api/worker/run` for manual or external
  schedulers; the endpoint returns 503 while it is unset.
- `CRON_SECRET` — authenticates `GET /api/cron/worker`, which is what Vercel Cron calls.
  Set at least one of `WORKER_SECRET` or `CRON_SECRET`; either one enables the worker.
- `AGENT_RUNTIME_READY` — operator switch for job execution. Keep it `false` until the AI
  and lead-source keys are set; queued jobs do not run while it is false.

The app reports each provider's real configuration state on **Integrations**; it never
falls back to demo data.

`GET /api/health` is an unauthenticated readiness probe for load balancers and uptime
monitors. It returns overall status, database reachability and latency, and coarse provider
states (`configured` / `not_configured`, plus `ready` / `disabled` for the agent runtime). It
never returns keys, URLs, or connection strings, sends `no-store`, and responds `503` when
the database cannot be reached.

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
| `npm run build` | Production build with the local SQLite client |
| `npm run vercel-build` | Vercel build: generate the Postgres client, then `next build` |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest (unit + database integration tests) |
| `npm run db:migrate` | Create/apply a local SQLite migration |
| `npm run db:generate:pg` | Generate the Postgres Prisma client |
| `npm run db:migrate:pg` | Apply Postgres migrations (`prisma migrate deploy`) |
| `npm run db:migrate:pg:dev` | Create a Postgres migration against a dev database |
| `npm run db:seed` | Seed plans, agents, and bootstrap admin |
| `npm run db:seed:pg` | Generate the Postgres client, then seed |
| `npm run db:studio` | Open Prisma Studio |

## Deployment

Production uses Vercel for the app and worker trigger, Neon for Postgres, and Bluehost only
for the domain, DNS, and business email. The full pre-flight, migration, DNS, cron, backup,
rollback, and smoke-test procedure is in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

```bash
# From the repository root with production connection strings exported:
npm run db:generate:pg
npm run db:migrate:pg
npm run db:seed:pg
```

The production schema is `prisma/postgres/schema.prisma`; local development and tests keep
using `prisma/schema.prisma` (SQLite). `src/lib/prisma-schema-parity.test.ts` fails if the
models drift. The Postgres migration has been generated and validated but not yet applied to
a live database, and Vercel Cron has not been exercised in a deployment.

## What is implemented

**Public site** — landing, product/agent overview, security model, and pricing read plans
and agents from the database. Marketing pages are rendered dynamically so admin plan
edits appear immediately. `robots.txt` and `sitemap.xml` are generated from `APP_URL` and
list only `/`, `/features`, and `/pricing`.

**Accounts** — signup, login, logout, email verification, forgot/reset password, hashed
sessions, per-IP/per-account rate limits, and audit logging. Email flows report clearly
when no provider is configured.

**Onboarding** — a three-step wizard (business, market, edge) that stores the workspace
profile used as ground truth for later agent work and unlocks the dashboard on completion.

**Workspace** — responsive shell with workspace switcher, dashboard stats and 30-day lead
chart backed by real queries, searchable/filterable/sortable leads, CSV import with column
mapping and row-level reports, lead detail with evidence and activity, campaign creation and
detail with an outreach pipeline, agent catalog and detail with runtime gating, run detail
with step logs, integration status and encrypted per-workspace provider credentials,
settings (profile, password, team, usage, suppression list), and a superadmin console for
plans, limits, agent catalog, and platform audit.

**Lead data** — discovery calls the configured provider (Apollo, People Data Labs, or
Google Places) and stores only fields the provider returned, with provider record ID,
source URL, retrieval timestamp, license note, and field verification status. Imports
require a rights confirmation, re-parse the uploaded file on the server, and dedupe by
normalized email, then domain, then company + location. Invalid rows are reported, never
repaired or invented. Exports include provenance, verification status, and retrieval dates
and are limited by plan.

**Agents** — Lead Finder, Company Research, and Lead Qualification execute inside the
workspace. Discovery dedupes before insert and records source/evidence/activity/audit rows
in one transaction. Research and qualification send only stored workspace fields to the
configured model, validate every response against a schema, and preserve statuses a person
set. Provider or schema failures fail the step honestly with no partial writes.

**Jobs** — a secret-protected worker endpoint atomically claims due jobs with a two-minute
lease, records each step, retries transient failures with backoff, and supports cancellation.
`POST /api/worker/run` authenticates with `WORKER_SECRET`; `GET /api/cron/worker`
authenticates with `CRON_SECRET` and is the Vercel Cron target. Both share one tick service,
which also runs retention cleanup. Runs reserve plan usage up front and refund it on
cancellation or permanent failure.
Execution is gated by `AGENT_RUNTIME_READY` and the configured provider; with no keys, the
UI and server report the missing configuration instead of simulating a run.

**Outreach** — campaign leads move through an outreach pipeline (`ADDED` → `DRAFTED` →
`APPROVED` → `SENT`, plus `FAILED`/`CANCELLED`). Drafts use deterministic templates built
only from stored workspace and lead facts, with an optional AI draft path when the model is
configured. An admin or owner approves the exact subject and body; approval stores a
SHA-256 content hash and any later edit revokes it. Sending re-checks the hash, the
suppression list, campaign status, the campaign daily cap, and the plan's daily send
allowance before calling Resend. Messages append the workspace mailing address and a signed
one-click unsubscribe link. Provider failures leave the message approved and release the
reserved allowance; successful sends record the provider message ID and audit entry.
**Settings → Suppression** supports manual add, CSV import, search, and removal, and the
public unsubscribe page works without an account and is idempotent.

**Outcomes and analytics** — after a send, a member can record a manual reply, meeting, or
hard bounce with an optional note. Each outcome writes lead activity and an audit entry; a
hard bounce also adds a `BOUNCED` suppression entry so the address is blocked from future
sends. The campaign page reports sent, replied, meeting, and bounce counts plus reply and
meeting rates. Opens are not shown as tracked because no provider webhook is connected.

**Field verification** — an admin can record a per-field result (verified, partially
verified, or unverified) with an optional evidence URL and note on the lead page. The lead's
overall status is recomputed from its populated fields: it becomes `VERIFIED` only when
every populated verifiable field has a human `VERIFIED` record. Provider data alone never
marks a field verified.

**Billing** — plan records carry admin-editable monthly and yearly Razorpay plan IDs.
Only the workspace owner can start checkout or cancel. Checkout creates a Razorpay
subscription server-side and redirects to its hosted `short_url`; the redirect is limited to
Razorpay hosts. Local plan state does not change at checkout: `POST /api/billing/razorpay`
verifies the raw-body HMAC signature, records each event exactly once in `WebhookEvent`,
maps the provider plan ID when notes are absent, and applies activation, past-due, paused,
resumed, and canceled states in one transaction. Cancellation defaults to end of the paid
period; an immediate cancellation downgrades to Free. Every checkout and cancellation
writes an audit entry. A testisable adapter and integration suite cover activation, replay
idempotency, plan mapping, tenant isolation, and cancellation.

**Platform administration** — superadmins get a workspace table with owner, plan, member and
lead counts, keyword search, and pagination, plus a per-workspace plan selector. Manual
assignment is a support tool: a workspace with a live Razorpay subscription is display-only
and must be cancelled through the provider first, so a later webhook cannot silently
overwrite the plan. Feature switches are stored in the database and default to enabled;
turning one off blocks public signup, CSV import, or outreach sending at the service layer
without hiding drafts or approvals. Every plan change, workspace assignment, and switch
change is audit-logged with previous and next values. The audit log supports keyword,
workspace, action, and date filters with pagination.

**Team management** — admins and owners invite teammates from **Settings → Team**. The
inviter picks Member, Viewer, or (owner only) Admin. Pending, unexpired invitations reserve
a seat, and the seat cap is checked inside a transaction that locks the workspace row, so
two concurrent invites cannot oversell the plan. Invitations expire after seven days;
revoking one frees the seat. A new teammate registers from the `/invite/[token]` link, which
proves ownership of the invited address and marks the email verified; an existing account
signs in and accepts there instead. The invitee is added only when the signed-in email
matches the invitation, and every invite, revocation, and acceptance writes an audit entry.
The owner can hand ownership to another member or admin by selecting them, re-entering their
current password, and confirming; the transfer rewrites both roles and `ownerId` in one
transaction, and the former owner stays on as an admin. Viewers cannot become owners.

**Data and compliance** — workspace admins set a retention window (keep until deleted, or
30/90/180/365 days) that soft-deletes stale leads and permanently purges them after a
30-day grace period. The scheduled worker runs the same cleanup and purges soft-deleted
workspaces after their grace period. Outreach approval can be tightened from
admins-and-owners to **owner only**; the policy is re-checked in the service layer at both
approval and send time, so a stale UI or direct call cannot bypass it. Admins can download
a versioned JSON DSAR bundle of workspace data and audit history, and the owner can delete
the workspace with typed-name confirmation and a password re-check. Deletion is refused
while a live Razorpay subscription is attached, revokes access immediately, and purges data
after 30 days. A signed-in member can also close their personal account from the same page;
if they own an active workspace they must transfer or delete it first. Closure anonymizes
the profile to "Deleted user" and removes credentials, sessions, invitations, and
memberships without touching workspace records or audit history. Export, cleanup, settings
changes, and both deletion paths are rate-limited and audit-logged.

**Security** — tenant-scoped queries, role hierarchy (viewer/member/admin/owner), audit
logs for sensitive actions, server-side rate limits, and a reviewed header set on every
route. The CSP locks resources to this origin, blocks framing and plugins, and restricts
form posts; HSTS and `upgrade-insecure-requests` apply in production only. Passwords are
bcrypt cost 12, session/reset/invite/unsubscribe tokens are stored only as SHA-256 hashes,
and the worker secret is compared in constant time. Every sensitive action and API route
takes its limit from one policy matrix: signup, login, password reset/change, profile
updates, onboarding, CSV and suppression imports, lead export, agent runs, outreach
drafts/sends, team invites/acceptance, billing checkout, compliance settings, data export,
retention cleanup, and workspace deletion. Outreach cannot be sent without a human approval
that matches the workspace policy, and suppressed addresses are blocked at draft time and
again immediately before delivery. The threat model, CSP residual risk, rate-limit matrix,
secret rotation notes, dependency-audit result, and production checklist are in
`docs/SECURITY.md`.

## Not implemented yet

- Provider-webhook event tracking for opens/replies (outcomes are manual today).
- Follow-up agent: due-date queue and reminders (no auto-send).
- Live Razorpay verification: the adapter and tests are complete, but checkout/webhooks
  stay disabled until real test keys, a webhook secret, and Razorpay plan IDs are supplied.
- Workspace-count limit enforcement: no account-level billing or extra-workspace creation
  flow exists yet, so the limit is shown but cannot be exercised.
- Account deletion is personal and keeps workspace records: a user closes their own account
  after transferring or deleting any active workspace they own. There is no account-level
  billing or multi-workspace account model.
- Live deployment verification: the Postgres schema, initial migration, and Vercel Cron
  configuration are committed, but the migration has not been run against Neon and the cron
  schedule has not been exercised in a deployed environment. Trusted-proxy configuration,
  monitoring/alerting, and the remaining production checklist items in `docs/SECURITY.md`
  are still open.
- A strict nonce-based CSP. The current policy is nonce-free because static pages cannot
  receive per-request nonces, so `'unsafe-inline'` remains a documented residual risk.
- The Prisma 7 upgrade needed to clear the `deepmerge-ts` advisory reported by
  `npm audit --omit=dev`.
- Executors for `COMPETITOR_RESEARCH`, `EMAIL_OUTREACH`, and `FOLLOW_UP`; those agents stay
  disabled.

These gaps are shown honestly in the UI rather than simulated. See `docs/ROADMAP.md` for
the phase plan and `docs/ARCHITECTURE.md` for the design.

## Project structure

```
src/
  app/
    (marketing)/     Landing, features, pricing
    (auth)/          Login, signup, invite acceptance, reset, verification
    (app)/           Dashboard, leads (import/detail), campaigns
                     (new/detail/messages), agents, runs, integrations,
                     settings (incl. suppression), admin
    api/             CSV export, DSAR workspace export, health probe, worker, and
                     Razorpay webhook endpoints
    onboarding/      Three-step setup wizard
    unsubscribe/     Public signed unsubscribe page
  components/
    app/             Shell, navigation, charts
    auth/            Auth forms
    campaigns/       Campaign and outreach forms
    marketing/       Marketing sections
    onboarding/      Wizard
    settings/        Settings and suppression forms
    unsubscribe/     Public unsubscribe form
    ui/              Buttons, inputs, cards, badges, alerts
  lib/
    agents/          Runtime gating, output schemas, input schemas
    auth/            Sessions, roles, rate-limit matrix, audit
    billing/         Razorpay API adapter, signature verification, webhook parsing
    compliance/      Retention windows, approval policies, purge helpers
    email/           Resend adapter
    security/        CSP/header builder, constant-time worker authorization
    jobs/            Queue policy, leases, retry backoff
    leads/           Import mapping and dedupe
    outreach/        Grounded templates, approval hash, signed tokens
    providers/       Apollo, PDL, Google Places, AI, selection
    csv.ts           CSV parse/serialize
    validation/      Zod schemas
  server/
    actions/         Server actions (auth, onboarding, leads,
                     imports, campaigns, agents, outreach,
                     suppression, settings, admin)
    services/        Data access and domain services
  test/              Throwaway database fixtures
prisma/
  schema.prisma      Full data model for local SQLite
  postgres/          Production Postgres schema and migrations
  seed.ts            Plans, agents, bootstrap admin
docs/                Architecture, security, roadmap, compliance, integrations
```

## Testing

```bash
npm run test
```

Unit tests cover CSV parsing, import mapping and dedupe rules, agent input/output schemas,
runtime gating, job policy, validation, role hierarchy, rate-limit behavior, formatting
helpers, grounded outreach templates and approval hashes, unsubscribe token signing,
security headers/CSP values, constant-time worker authorization, the rate-limit matrix, and
provider request shaping/normalization/error mapping for Apollo, PDL, Google Places, the AI
adapter, and the Razorpay billing adapter (auth headers, checkout/cancel payloads, webhook
parsing, and HMAC signature verification). Database integration tests create a throwaway
SQLite database with `prisma db push` and exercise the real import, job, agent-executor,
outreach, suppression, unsubscribe, billing, admin, compliance, and team services, including
transactions, unique constraints, retries, cancellation, usage refunds, approval hash
revocation, suppression at draft and send time, provider failures with allowance release,
the Resend payload, public unsubscribe, Razorpay checkout, webhook activation and replay
idempotency, plan mapping, tenant isolation, downgrade to Free, refusal to transact without
credentials, workspace plan assignment, provider-managed conflicts, feature switches that
block signup, import, or sending, invite permissions, seat reservation, revocation, expiry,
wrong-email refusal, new-account registration, retention soft-delete/purge, DSAR export
contents, workspace-deletion guards, ownership-transfer guards, account-closure guards and
anonymization, and owner-only approval enforcement. The suite is
**42 files / 314 tests**. Before shipping any change, also run `npm run lint`,
`npm run typecheck`, and `npm run build`.

## A note on data ethics

LeadPilot only accepts data from contracted APIs, licensed datasets, or files you have the
right to import. It does not scrape websites or social profiles, and it does not invent
fields that have no evidence. Every send requires explicit human approval. See
`docs/COMPLIANCE.md` before connecting a provider.
