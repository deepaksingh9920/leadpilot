# LeadPilot — Architecture

Status: Phase 5B enforcement, admin, and security hardening work in progress · Last updated: 2026-11-10

## 1. Purpose and scope

LeadPilot is a multi-tenant SaaS platform where businesses configure an ideal customer
profile (ICP) and run specialized AI agents to discover, research, qualify, and contact
business prospects from **authorized data sources only**.

The product must never invent leads, email addresses, phone numbers, or company facts.
Every lead field must be traceable to a provider record or a user-supplied import, and
every outreach message must be approved by a human before it is sent.

Out of scope for the initial release: consumer/individual profiling, automated cold
calling, browser scraping, and sending without approval.

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript (strict) | One deployable for marketing, dashboard, API; server components keep secrets and queries off the client |
| Styling | Tailwind CSS v4 + in-repo UI primitives + lucide-react | Fast, consistent premium UI without a heavy component runtime |
| Charts | Recharts | Lightweight dashboard charts |
| Database | PostgreSQL in production; SQLite for local development | Zero-service local setup; Postgres for scale and concurrency |
| ORM | Prisma | Typed schema, migrations, relation safety |
| Auth | Custom credential auth: bcryptjs + signed session cookies (`jose`) | Full control of workspace scoping, roles, and superadmin; fewer moving parts than a hosted auth dependency |
| Validation | Zod schemas shared by forms, actions, and route handlers | One source of truth per input |
| Jobs | DB-backed queue (`AgentRun` leases) + protected worker endpoint driven by cron | No extra infrastructure; idempotent retries; upgrade path to Redis/pg-boss |
| AI | Server-only `LlmProvider` adapter over an OpenAI-compatible API | Swap models/providers without touching business logic |
| Lead data | `LeadSourceProvider` adapters (licensed APIs + CSV import) | Enforces provenance and terms; no scraping |
| Email | `EmailProvider` adapter (Resend or SMTP) | Approval-gated sending, unsubscribe handling |
| Billing | Razorpay subscriptions: server-created subscription + hosted `short_url`, signed webhooks | Hosted checkout needs no client checkout script; webhook-driven state is idempotent and auditable |
| Observability | Structured JSON logs, audit log, `/api/health`, optional Sentry | Debuggable and auditable |
| Tests | Vitest (unit/integration) + Playwright (critical flows) | Verifies behavior, not just builds |

Node.js LTS 26.13.0 and npm 11.20.0 are installed on the development machine. PowerShell
execution policy blocks `npm.ps1`; use `npm.cmd` / `npx.cmd` (or
`Set-ExecutionPolicy -Scope Process Bypass`).

## 3. Runtime topology

```
Browser
  │  HTTPS, httpOnly session cookie
  ▼
Next.js (Vercel or Node/Docker)
  ├─ (marketing) public pages, no DB access unless rendering plan pricing
  ├─ (auth) login/signup/onboarding
  ├─ (app) workspace dashboard ── server actions / route handlers
  ├─ admin platform console
  └─ /api/*
       ├─ worker tick  ◄── platform cron (secret header)
       ├─ billing webhook ◄── Razorpay (HMAC signature verified)
       └─ health
  │
  ├── PostgreSQL (Prisma) — tenants, leads, runs, billing state, audit
  ├── LLM API — research summaries, scoring rationale, outreach drafts
  ├── Lead source APIs — licensed business/contact data
  ├── Email provider — approved outreach only
  └── Razorpay — subscriptions; plan state changes only from verified webhooks
```

Local development uses the same application code with SQLite and the same provider
adapters. Because real integrations were selected, provider-backed actions are disabled
with a clear "Integration not configured" state until keys are present. There is no
production mock/sandbox data path. Automated tests use isolated fixtures that are never
served in production.

## 4. Multi-tenancy and authorization

`Workspace` is the tenant boundary. A user joins through `Membership`.

| Role | Capabilities |
|---|---|
| `SUPER_ADMIN` | Platform admin console, plan/limit configuration, provider status, all workspaces (read), audit search |
| `OWNER` | Everything in the workspace, billing, workspace deletion, ownership transfer, member management |
| `ADMIN` | Members (except owner), leads, campaigns, agents, integrations, exports, outreach approval |
| `MEMBER` | Create/edit leads, run agents, draft campaigns and outreach, cannot approve sends or manage billing |
| `VIEWER` | Read-only; exports disabled by default |

Enforcement rules:
- The active workspace comes from the session + an explicit workspace selector, never
  from client-supplied IDs alone. Every query includes `workspaceId`.
- A single `requireWorkspaceAccess(role)` helper guards pages, server actions, and APIs.
- `SUPER_ADMIN` access to customer content is read-only and produces an audit entry.
- Role checks live server-side; hidden UI is a convenience, not a control.

Agency plans allow one user to belong to multiple workspaces. Plan limits determine how
many owned workspaces and seats are permitted.

## 5. Domain model (Prisma)

Identity and tenancy
- `User` — email, passwordHash, name, emailVerifiedAt, isSuperAdmin, disabledAt
- `Session` — tokenHash, userId, expiresAt, ip, userAgent
- `Workspace` — name, slug, ownerId, deletedAt, leadRetentionDays (null/30/90/180/365),
  approvalPolicy (`ADMIN_OR_OWNER` or `OWNER_ONLY`)
- `Membership` — workspaceId, userId, role (unique pair)
- `Invite` — workspaceId, email, role, tokenHash, expiresAt, acceptedAt

Commercial
- `Plan` — key, name, description, monthlyPrice, yearlyPrice, currency, isPublic, sortOrder
- `PlanLimit` — planId, metric, limit (leads/month, agent runs/month, seats, workspaces, sends/day, exports/month)
- `PlanAgent` — planId, agentKey (entitlement)
- `Subscription` — workspaceId, planId, status, providerSubscriptionId, period dates
- `UsageCounter` — workspaceId, metric, periodStart, used (unique, updated atomically)
- `WebhookEvent` — provider, externalEventId (unique), payload, processedAt (idempotency)

Product configuration
- `BusinessProfile` — company name, website, industry, description, regions, company size,
  target customer types, budget range, value proposition (one per workspace)
- `AgentDefinition` — key, name, slug, description, category, stage, creditCost,
  requiresApproval, inputSchema, isActive
- `AgentConfig` — workspaceId, agentKey, enabled, settings JSON
- `Integration` — workspaceId, provider, status, accountLabel, lastCheckedAt,
  encryptedCredentials (optional per-workspace keys)

Lead lifecycle
- `LeadSource` — workspaceId, provider, type (API/CSV/MANUAL), name, licenseNote, termsUrl
- `Lead` — company/contact fields, score, scoreReasons, status, ownerId, tags, sourceId,
  sourceRecordId, sourceUrl, retrievedAt, verificationStatus, notes
- `LeadFieldVerification` — leadId, field, status, sourceUrl, checkedAt, note
- `LeadActivity` — leadId, actorId, type, detail JSON (append-only timeline)
- `OutreachMessage` — campaign/lead, subject/body, status, approvedBy/At, sentAt,
  providerMessageId, unsubscribeTokenHash, failureReason
- `SuppressionEntry` — workspaceId, normalized email, reason, source, createdAt
- `Campaign` — name, goal, status, dailySendCap, createdBy
- `CampaignLead` — campaignId, leadId, stage
- `AuditLog` — workspaceId, actorId, action, entityType, entityId, metadata, ip, userAgent
- `RateLimitBucket` — key, windowStart, count

Uniqueness: `Lead (workspaceId, sourceId, sourceRecordId)` prevents duplicates from the
same provider. Deduplication on import falls back to normalized domain + contact email.

Deletion policy: leads and campaigns are soft-deleted (`deletedAt`) so audit trails and
suppression history survive. Leads past a workspace's retention window are soft-deleted by
the cleanup job, then permanently purged after a 30-day grace; workspaces follow the same
soft-delete-then-purge schedule. Deletion requests end sessions, revoke pending invites, and
are refused while a live Razorpay subscription is attached. Suppression entries and audit
records are deliberately not purged with a lead. User deletion anonymizes PII while
retaining audit records.

SQLite is used locally for zero-setup development. The schema avoids Postgres-specific
types (enums and arrays are stored as validated strings/JSON) so moving to Postgres is a
provider switch plus a regenerated migration baseline before production launch.

## 6. Agent orchestration

Agent definitions are data, not code branches. Each run is an `AgentRun` job:
`QUEUED → RUNNING → (WAITING_APPROVAL) → SUCCEEDED | FAILED | CANCELLED`.

Queue mechanics:
- Worker endpoint claims one job atomically using a lease (`lockedAt`, `lockedBy`,
  `attempts`, `runAfter`), so concurrent ticks cannot double-process.
- Each stage writes an `AgentRunStep` (input/output digest, status, duration). Steps are
  idempotent by `(runId, stepName)`; a retried run resumes rather than duplicating leads.
- Retries use capped exponential backoff for transient provider errors. Validation and
  authorization errors fail fast without retry.
- Stale leases are reclaimed after 10 minutes. Attempts are capped (default 3).
- Cancellation is checked between steps.

Pipeline stages:
1. **Intake** — validate ICP, budget, region, and plan entitlements.
2. **Discover** — query the configured lead source within permitted filters; normalize
   and deduplicate provider records; persist provenance.
3. **Research** — summarize only retrieved source content (website/provider fields) with
   citations; no free-form invention.
4. **Qualify** — deterministic scoring (fit, data completeness, verification, intent
   signals) plus optional model rationale. Score inputs and weights are stored.
5. **Draft** — generate personalized outreach grounded in stored lead fields and the
   user's offer; output validated against a schema; PII fields cannot be generated.
6. **Approve/send** — a human approves each message; the sender checks suppression,
   plan caps, and provider configuration immediately before sending.
7. **Follow-up** — scheduled reminders and suggested next actions; outcomes feed back
   into campaign reporting.

Run limits are enforced at creation time with an atomic `UsageCounter` increment. A run
that cannot reserve usage is rejected before any provider call.

## 7. Integration adapters

| Interface | Methods (conceptual) | Production requirement |
|---|---|---|
| `LlmProvider` | `completeStructured(schema, prompt, context)`, `health()` | AI key + model |
| `LeadSourceProvider` | `search(criteria)`, `enrich(record)`, `health()` | Licensed provider key + terms acceptance |
| `EmailProvider` | `send(approvedMessage)`, `health()` | Verified sending domain + API key |
| `BillingProvider` | `createSubscription(planId, interval, notes)`, `cancelSubscription(id, atCycleEnd)`, `verifyWebhook(rawBody, signature)` | Razorpay key ID/secret + webhook secret + per-plan `plan_id`s |

Behavior when unconfigured:
- UI shows the integration as "Not connected" with setup instructions.
- The affected action is disabled server-side and returns a typed error.
- Core features that do not require the provider still work: profile/ICP setup, CSV
  import of authorized data, lead management, notes, filtering, and export.

Provider rules:
- A provider is only enabled after a terms/license note is recorded in `LeadSource`.
- Contact data is accepted only if the provider contract permits the intended use.
- Emails are never guessed or pattern-generated.
- Every provider response stores the provider name, record ID, source URL, and retrieval
  timestamp.
- API keys live in server environment variables (or AES-256-GCM encrypted per-workspace
  credentials); they never reach the client bundle or logs.

### Billing lifecycle

`PlanProviderPrice` maps each plan and interval to a Razorpay `plan_id`; a superadmin edits
these in the admin console. Checkout is refused unless `RAZORPAY_KEY_ID`,
`RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` are all present, so payment cannot be
taken without a verified activation path. `startSubscriptionCheckout` creates the provider
subscription with workspace/plan/interval notes, accepts only an `https` `short_url` on a
Razorpay host, and writes an audit entry; it does not change local plan state. The
signature-verified webhook is the only activation path: the raw body is HMAC-checked, the
event is inserted into `WebhookEvent` with a unique provider/event-id constraint, and the
subscription upsert plus audit entry happen in the same transaction. Activation, charged,
and resumed events map to `ACTIVE`; pending/halted map to `PAST_DUE`; paused maps to
`PAUSED`; canceled/completed map to `CANCELED` and downgrade the workspace to the Free plan.
A cancellation requested for cycle end keeps the paid plan active until the period expires.
Provider plan IDs are the fallback mapping when event notes are absent.

Details and the required environment variables are in `docs/INTEGRATIONS.md`.

### Platform administration and feature switches

The `/admin` console is superadmin-only. It lists workspaces with owner, plan, member and
lead counts, supports keyword search and pagination, and allows a manual plan assignment per
workspace. Manual assignment clears provider IDs and interval fields and sets
`provider: "internal"`. It is refused with `CONFLICT` while the workspace has a live
Razorpay subscription (`ACTIVE`, `TRIALING`, `PENDING`, `PAST_DUE`, or `PAUSED` with a
provider subscription ID), because a later webhook would overwrite the local change and the
customer would be billed for a plan the app no longer shows.

Platform feature switches live in `Setting` under `feature.<key>`
(`src/lib/features.ts`). `signups`, `csv_import`, and `outreach_sending` default to enabled
when no row exists. Services read the flag before the side effect, so:
- `signUp` returns a configuration error and creates no account;
- `importLeadsCsv` returns `DISABLED` and leaves existing leads untouched;
- `sendOutreachMessage` returns `DISABLED` before any provider call, leaving the message
  `APPROVED` and reserving no daily allowance. Drafting and approval remain available.

Every plan change, workspace assignment, and switch change writes an audit entry with
previous and next values. The audit view searches action, entity ID, metadata, actor, and
workspace name, filters by workspace, action prefix, and date range, and paginates newest
first. Audit reads are not themselves audited in this slice.

### Team invitations and seat enforcement

Seats are consumed by memberships and by pending, unexpired invitations. Inviting and
accepting both run inside a transaction that first performs a no-op update on the workspace
row. SQLite serializes that write, so a second concurrent transaction counts committed
members and cannot oversell the plan. The cap is re-checked at acceptance: an invitation
reserves a seat, but if an admin fills the last seat before it is accepted, acceptance fails
with `LIMIT` rather than bypassing the plan.

Invitations store only `sha256(token)`; the raw token exists in the emailed link. They are
scoped to one workspace and email, are single-use, and expire after seven days. Only
admins/owners can invite, and only an owner can invite another admin. Acceptance requires a
signed-in user whose email matches the invitation. A new teammate registers from the same
link; holding the token proves control of the address, so `emailVerifiedAt` is set and the
membership is created in one transaction. Invite-based registration is intentionally not
gated by the public `signups` switch. Invite, revoke, and accept each write an audit entry.

## 8. Data provenance and verification

`Lead.verificationStatus` is one of `UNVERIFIED`, `PARTIAL`, `VERIFIED`, and each
important field has its own `LeadFieldVerification` row.

- Verification is a human attestation. An `ADMIN` records the result for a specific field,
  with an optional evidence URL and note. Provider data alone never sets a field verified.
- Overall status is derived from populated fields: `VERIFIED` only when every populated
  verifiable field has a `VERIFIED` human check; `PARTIAL` when at least one check exists but
  the set is incomplete; `UNVERIFIED` otherwise. Blank fields are ignored rather than
  counted against the lead.
- Provider-supplied values start as `PARTIAL` when they carry an evidence URL and
  `UNVERIFIED` otherwise. They only become `VERIFIED` after a human check.
- Each change writes a `FIELD_VERIFIED` lead activity and a `lead.field_verified` audit
  entry.

The UI shows a source chip and last-checked date on the lead detail and in the table.
Exports include source, source URL, retrievedAt, and verification columns so customers
can audit what they received.

### Campaign outcomes and analytics

`OutreachMessage` stores `repliedAt`, `meetingAt`, `bouncedAt`, and `outcomeNote` for
outcomes recorded manually by a workspace member. There is no provider event ingestion, so
`getCampaignAnalytics` counts only recorded sends and these manual outcomes and returns
`opensTracked: false`. It never synthesizes opens or replies. A `BOUNCED` outcome sets the
message status, adds a workspace `BOUNCED` suppression entry, and blocks future sends to
that address.

AI prompts receive only stored source data. Structured outputs are validated; unknown
fields are rejected. The draft agent has no tool access to the open web and cannot create
contact data.

## 9. Security controls

Detailed rationale and verification live in `docs/SECURITY.md`.

- Passwords: bcrypt cost 12. Password length/confirmation is validated before hashing.
- Sessions: random 256-bit token, only `sha256(token)` stored, httpOnly + Secure (production)
  + SameSite=Lax cookie, 30-day absolute expiry (no sliding refresh). Password change
  revokes other sessions; disabled users are rejected even with a valid token.
- Tokens: email verification, reset, invitations, and unsubscribe links are random,
  single-use where applicable, and stored only as hashes. Invitations expire after 7 days.
- CSRF: SameSite=Lax cookies, Next.js Server Action Origin checks, and secret/signature
  authentication on the only mutating route handlers (worker and webhook).
- Input validation: Zod on every action, route handler, and CSV row; upload size caps.
- Rate limits: one reviewed matrix in `src/lib/auth/rate-limits.ts` backs a DB fixed-window
  limiter that fails closed. It covers signup, login, reset/change password, profile updates,
  onboarding, CSV/suppression imports, exports, agent runs, outreach drafts/sends, invites,
  and billing checkout. Plan entitlements are enforced separately and atomically.
- Authorization: role + workspace checks in the service layer; no direct Prisma calls from
  components. Billing, admin invites, workspace deletion, and ownership transfer are
  owner-only; platform admin
  is superadmin-only. Outreach approval is role-checked in the UI/actions and re-checked in
  the service layer against the workspace's current approval policy, so a direct service call
  cannot bypass an owner-only policy.
- Compliance: retention windows soft-delete stale leads and purge them after a 30-day grace;
  the worker runs the same cleanup on each tick. DSAR exports are admin-only, rate-limited,
  audit-logged, and exclude soft-deleted leads. Workspace deletion requires the exact
  workspace name and current password, is refused while a Razorpay subscription is live, and
  revokes sessions and pending invites immediately.
- Secrets: `.env.local` only, `.gitignore`d; `.env.example` contains placeholders. Server
  modules read secrets through `src/lib/env.ts`; nothing security-sensitive is exposed via
  `NEXT_PUBLIC_*`.
- Headers: `next.config.ts` applies the output of `src/lib/security/headers.ts` to every
  route — origin-locked CSP, production-only HSTS, `nosniff`, frame denial, referrer and
  permissions policies, COOP/CORP, DNS-prefetch off. The CSP is intentionally nonce-free
  because static pages cannot receive nonces; `'unsafe-inline'` remains a documented
  residual risk with a strict-CSP path in `docs/SECURITY.md`.
- Worker: `POST /api/worker/run` requires a constant-time `Bearer`/`x-worker-secret` match
  and stays disabled (`503`) when `WORKER_SECRET` is unset.
- Webhooks: Razorpay HMAC-SHA256 verification over the raw body and idempotent processing via
  `WebhookEvent`; checkout refuses to start without a working activation path.
- Logging: emails/phones redacted; request IDs; no bodies of auth or billing requests.
- Audit log: append-only application entries for login, role changes, exports, lead deletion,
  field verification, agent runs, approvals, sends, outcomes, invitations, switches, and plan
  changes. Audit-write failures are logged but do not block the action, and there is no
  external tamper evidence yet.
- Dependency hygiene: lockfile committed. `npm audit --omit=dev` reports three high
  advisories from `deepmerge-ts` through Prisma 6 CLI/config; the fix requires a breaking
  Prisma 7 upgrade and is tracked as a residual risk rather than silently suppressed.

## 10. Folder structure

```
leadpilot/
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ SECURITY.md
│  ├─ ROADMAP.md
│  ├─ COMPLIANCE.md
│  └─ INTEGRATIONS.md
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts                # plans, agent definitions, admin bootstrap
├─ public/                   # static assets
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/        # landing, features/agents, pricing
│  │  ├─ (auth)/             # login, signup, forgot-password, reset
│  │  ├─ (onboarding)/       # business + ICP wizard
│  │  ├─ (app)/              # dashboard shell + workspace pages
│  │  │  ├─ dashboard/
│  │  │  ├─ agents/          # marketplace + run detail
│  │  │  ├─ leads/           # table, filters, detail, import, export
│  │  │  ├─ campaigns/
│  │  │  ├─ integrations/
│  │  │  ├─ settings/        # profile, team, billing, suppression, compliance
│  │  │  └─ layout.tsx
│  │  ├─ admin/              # plans, providers, users, audit
│  │  ├─ api/
│  │  │  ├─ auth/[...]
│  │  │  ├─ jobs/tick/       # protected worker trigger
│  │  │  ├─ leads/export/
│  │  │  ├─ workspace/export/ # admin-only DSAR JSON bundle
│  │  │  ├─ outreach/send/
│  │  │  ├─ billing/razorpay/  # signed subscription webhook
│  │  │  ├─ worker/run/      # secret-authenticated queue + retention tick
│  │  │  └─ health/
│  │  ├─ layout.tsx
│  │  └─ globals.css
│  ├─ components/
│  │  ├─ ui/                 # buttons, inputs, dialogs, tables, badges
│  │  ├─ marketing/          # nav, hero, pricing, footer
│  │  ├─ dashboard/          # shell, charts, usage meters
│  │  ├─ agents/             # cards, run status, logs
│  │  └─ leads/              # table, filters, drawer, provenance
│  ├─ lib/
│  │  ├─ auth/               # password, session, rbac, guards
│  │  ├─ db/                 # prisma client, scoped helpers
│  │  ├─ ai/                 # provider + prompts + schema validation
│  │  ├─ sources/            # provider adapters + normalizers
│  │  ├─ outreach/           # approval, suppression, sending
│  │  ├─ billing/            # plans, limits, Razorpay adapter + webhook parsing
│  │  ├─ compliance/         # retention windows, approval policies, purge helpers
│  │  ├─ jobs/               # queue, leases, pipeline stages
│  │  ├─ security/           # CSP/header builder, worker auth, hashing helpers
│  │  ├─ validation/         # zod schemas
│  │  └─ utils/
│  ├─ server/
│  │  ├─ services/           # workspace, lead, campaign, run, billing, compliance, team, account services
│  │  └─ actions/            # "use server" mutations
│  └─ types/
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
├─ scripts/                  # worker tick helper, seed/ops scripts
├─ .env.example
├─ next.config.ts
├─ package.json
└─ README.md
```

## 11. Environments and configuration

| Environment | Database | Providers | Purpose |
|---|---|---|---|
| Local | SQLite file | Real keys from `.env.local`; actions disabled if absent | Development and manual QA |
| Preview | Postgres branch | Razorpay test mode, provider test keys | Review before release |
| Production | Postgres | Live keys | Customers |

All configuration is environment-based; no secrets in source. Plan prices and limits are
stored in the database and editable by a superadmin, with Razorpay `plan_id` values
referenced by plan and interval in `PlanProviderPrice`.

## 12. Observability and error handling

- `/api/health` reports app, DB, and provider configuration status without secrets. It is
  unauthenticated by design, exposes only booleans and latencies, and returns `503` when the
  database probe fails so orchestrators can route around an unhealthy instance.
- Structured logs include `requestId`, `workspaceId`, `userId`, route, latency, and
  outcome. PII is redacted.
- Server actions return typed results; UI surfaces actionable errors. Unexpected errors
  are logged with a correlation ID and a generic message is shown.
- Audit log is the business-level trail; application logs are the operational trail.
- Optional Sentry via `SENTRY_DSN`; error boundaries at route-group level.
- Worker runs record per-step errors so failed provider calls are diagnosable.

## 13. Testing strategy

- Unit: scoring, ICP matching, plan limit math, suppression matching, provenance
  normalization, CSV parsing, auth token handling.
- Integration: Prisma repositories and services against a temporary SQLite database;
  route handlers for auth, leads, exports, approvals, worker ticks.
- End-to-end: signup → onboarding → CSV import → agent run (with a stub provider in the
  test environment only) → lead qualification → draft → approve → suppressed send blocked.
- Manual: browser walkthrough of every page at desktop and mobile widths.
- Gates per phase: type-check, lint, unit/integration tests, production build, browser QA.
  A feature is "done" only after these pass.

## 14. Deployment

Recommended: Vercel (app + cron) with managed Postgres (Neon/Supabase), Razorpay, and an
email provider. Alternative: Docker image on a Node host with a reverse proxy; run the
worker tick from system cron every minute.

Release steps: run `prisma migrate deploy`, seed reference data idempotently, verify
`/api/health`, check webhook signing secrets, and confirm cron is calling the worker with
`CRON_SECRET`. The Phase 6 deployment guide will contain exact commands and a rollback
procedure.

## 15. Decision log

| Decision | Rationale | Revisit when |
|---|---|---|
| Custom auth instead of hosted auth | Workspace roles and superadmin are core; fewer external failure modes | SSO/enterprise demand appears |
| SQLite locally, Postgres in production | Zero-setup development; production-grade concurrency | Team grows or preview environments need shared DB |
| DB-backed job queue | No Redis to operate; jobs survive restarts | Sustained queue depth or sub-minute latency requires Redis |
| Real providers only, no production demo mode | User requirement; prevents fabricated data reaching customers | Never — test fixtures stay isolated |
| Human approval mandatory for outreach | Compliance and user trust | Never |
| Provider adapters behind interfaces | Vendor flexibility and testability | A provider becomes a hard platform dependency |
| Razorpay hosted checkout; webhook as the only activation path | No client checkout script, and no paid state without a verified payment event | Provider supports a better local checkout flow or a second billing provider is added |
