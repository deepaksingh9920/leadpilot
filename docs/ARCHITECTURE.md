# LeadPilot — Architecture

Status: Phase 4B outreach safety implemented · Last updated: 2026-11-06

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
| Billing | Stripe Checkout + Billing Portal + signed webhooks | Standard SaaS subscriptions; admin-editable plans |
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
       ├─ stripe webhook ◄── Stripe (signature verified)
       └─ health
  │
  ├── PostgreSQL (Prisma) — tenants, leads, runs, billing state, audit
  ├── LLM API — research summaries, scoring rationale, outreach drafts
  ├── Lead source APIs — licensed business/contact data
  ├── Email provider — approved outreach only
  └── Stripe — subscriptions and usage-based entitlements
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
| `OWNER` | Everything in the workspace, billing, workspace deletion, member management |
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
- `Workspace` — name, slug, ownerId, billingCustomerId, deletedAt
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
suppression history survive. User deletion anonymizes PII while retaining audit records.

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
| `BillingProvider` | `createCheckout`, `createPortal`, `verifyWebhook` | Stripe keys + webhook secret |

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

Details and the required environment variables are in `docs/INTEGRATIONS.md`.

## 8. Data provenance and verification

`Lead.verificationStatus` is one of `UNVERIFIED`, `PARTIAL`, `VERIFIED`, and each
important field has its own `LeadFieldVerification` row.

- `VERIFIED` — provider returned the value and a second source check or provider
  verification flag confirms it.
- `PARTIAL` — present in one authoritative provider record but not independently checked.
- `UNVERIFIED` — user-entered or legacy data; never presented as confirmed.

The UI shows a source chip and last-checked date on the lead detail and in the table.
Exports include source, source URL, retrievedAt, and verification columns so customers
can audit what they received.

AI prompts receive only stored source data. Structured outputs are validated; unknown
fields are rejected. The draft agent has no tool access to the open web and cannot create
contact data.

## 9. Security controls

- Passwords: bcrypt (cost 12), minimum length 10, breached-password check optional.
- Sessions: random 256-bit token, only a hash stored, httpOnly + Secure + SameSite=Lax
  cookie, 30-day expiry with sliding refresh, revoked on password change.
- CSRF: SameSite cookies plus explicit Origin/Host checks on mutations.
- Input validation: Zod on every action, route handler, and CSV row; size caps on uploads.
- Rate limits (DB token buckets, per IP + account): login 5/15 min, signup 3/h,
  password reset 3/h, agent runs plan-capped + 10/min, exports 5/h, outreach sends
  plan-capped per day.
- Authorization: role + workspace checks in the service layer; no direct Prisma calls
  from components.
- Secrets: `.env.local` only, `.gitignore`d; `.env.example` contains placeholders.
- Headers: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, frame denial.
- Logging: emails/phones redacted; request IDs; no bodies of auth or billing requests.
- Audit log: append-only entries for login, role changes, exports, lead deletion, agent
  runs, approvals, sends, integration changes, and plan changes.
- Webhooks: signature verification and idempotent processing via `WebhookEvent`.
- Dependency hygiene: lockfile committed, `npm audit` in CI once Git/CI is set up.

## 10. Folder structure

```
leadpilot/
├─ docs/
│  ├─ ARCHITECTURE.md
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
│  │  │  ├─ settings/        # profile, team, billing, suppression
│  │  │  └─ layout.tsx
│  │  ├─ admin/              # plans, providers, users, audit
│  │  ├─ api/
│  │  │  ├─ auth/[...]
│  │  │  ├─ jobs/tick/       # protected worker trigger
│  │  │  ├─ leads/export/
│  │  │  ├─ outreach/send/
│  │  │  ├─ webhooks/stripe/
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
│  │  ├─ billing/            # plans, limits, stripe adapter
│  │  ├─ jobs/               # queue, leases, pipeline stages
│  │  ├─ security/           # rate limit, csrf, redaction, crypto
│  │  ├─ validation/         # zod schemas
│  │  └─ utils/
│  ├─ server/
│  │  ├─ services/           # workspace, lead, campaign, run, billing services
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
| Preview | Postgres branch | Stripe test mode, provider test keys | Review before release |
| Production | Postgres | Live keys | Customers |

All configuration is environment-based; no secrets in source. Plan prices and limits are
stored in the database and editable by a superadmin, with Stripe prices referenced by ID.

## 12. Observability and error handling

- `/api/health` reports app, DB, and provider configuration status without secrets.
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

Recommended: Vercel (app + cron) with managed Postgres (Neon/Supabase), Stripe, and an
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
