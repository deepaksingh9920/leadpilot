# LeadPilot — Development Roadmap

Status: Phase 4B verification and analytics complete — verified drafts, approval-gated sends, suppression, unsubscribe, human field checks, manual outcomes · Last updated: 2026-11-07

## Working rules

- Build in phases; each phase ends with a working, reviewed increment.
- No feature is reported as working until it is implemented, type-checked, tested, and
  exercised in the browser.
- No fabricated leads, contact details, or company facts at any point.
- Existing ChatCRM files at the workspace root are untouched.
- Secrets stay in `.env.local`; `.env.example` contains placeholders only.

## Phase 1 — Inspection and architecture (complete)

Deliverables:
- [x] Inspected the workspace: existing ChatCRM kit is static marketing content with no app stack.
- [x] Verified toolchain: Node.js 26.13.0 LTS + npm 11.20.0 installed; network to npm registry verified.
- [x] Confirmed decisions: name **LeadPilot**, Next.js stack, real integrations only.
- [x] `docs/ARCHITECTURE.md` — stack, topology, data model, orchestration, security, folder structure.
- [x] `docs/ROADMAP.md` — phased plan and acceptance criteria.
- [x] `docs/COMPLIANCE.md` — data-source and outreach rules.
- [x] `docs/INTEGRATIONS.md` — adapters, required keys, environment inventory.

Exit criteria: direction documented and approved. No application code yet.

## Phase 2 — Foundation, marketing, auth, onboarding, dashboard shell (complete)

Build:
1. `leadpilot/` Next.js 16 + TypeScript strict + Tailwind v4 project, design tokens
   (typography, color, spacing), base UI primitives.
2. Marketing pages: landing (hero, agent showcase, workflow, trust/provenance section,
   industries, pricing teaser, FAQ, CTA), features/agents page, pricing page with monthly
   and yearly toggle fed by seeded plans, responsive navigation and footer.
3. Auth: signup, login, logout, forgot/reset password, email verification token flow
   (delivery via configured email provider; no sending until configured), session
   management, rate limiting, CSRF protection.
4. Onboarding wizard: business profile + ICP (industry, region, company size, target
   customer type, budget, offer), plan selection state, completion gating.
5. Workspace dashboard shell: sidebar/topbar, workspace switcher, usage meters, empty
   states, onboarding checklist, dashboard summary cards and charts using real queries
   (empty until data exists).
6. Settings page foundation: profile, team list, security, workspace preferences.
7. Prisma schema for identity, tenancy, plans, profile, audit, rate limits; initial
   migration; idempotent seed (plans, agent definitions, superadmin from env).

Acceptance criteria:
- Sign up → verify (or configured flow) → onboarding → dashboard works end to end.
- Session cookie is httpOnly/Secure/SameSite; protected routes redirect correctly;
  cross-workspace access is denied.
- Marketing pages work at 375 px, 768 px, 1024 px, 1440 px with no overflow.
- Production build, type-check, lint, and auth/tenancy tests pass.
- No placeholder copy left in shipped pages; no real keys required to view marketing pages.

Depends on: Phase 1.
Note: pages whose data depends on later phases show honest empty/disabled states, not
invented sample data.

### Phase 2 verification (2026-10-29)

Automated:
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all pass.
- [x] Vitest: 22 tests across 4 files (validation, role hierarchy, rate limits, formatting).
- [x] Production build emits 16 routes; marketing pages render dynamically because they read
  plans and agents from the database.

Browser QA (desktop, 912 px viewport):
- [x] Landing, features, and pricing load with zero console errors.
- [x] Signup → three-step onboarding → dashboard (`?welcome=1`) completes end to end.
- [x] Dashboard, leads, campaigns, agents, integrations, settings load with zero console
  errors and no horizontal overflow.
- [x] Agent enable toggle persists across reload.
- [x] `/admin` redirects non-superadmins to `/dashboard`; superadmin login loads the console
  with all four plans.
- [x] Admin plan save round-trips and writes an audit entry.
- [x] Logout works; logged-out `/dashboard` redirects to `/login`.

Fixed during verification:
- Signup created duplicate `UsageCounter` rows (deduplicating `Date` objects does not
  dedupe equal timestamps) and then misreported the resulting unique-constraint failure as
  "email taken". Workspace creation now writes one counter per metric, and only an `email`
  unique clash maps to `EMAIL_TAKEN`.

Deferred / known limitations:
- Email verification and password-reset delivery stay disabled until `RESEND_API_KEY` and
  `EMAIL_FROM` are configured; the UI states this explicitly.
- Live agents, lead sources, outreach sending, CSV import, Stripe checkout, and team
  invitations are later phases.
- The 390 px mobile layout was reviewed only through static responsive-class inspection.
  Device emulation was unavailable in this environment (`X-Frame-Options: DENY` blocks
  iframe testing and `window.resizeTo` is ignored), so full 375 px browser QA remains open
  for Phase 6.

## Phase 3 — Database, lead management, agent task system

Build:
1. Full Prisma schema and migration for leads, sources, field verification, activities,
   campaigns, campaigns-leads, outreach, suppression, integration, jobs/steps, webhooks.
2. Lead management: CSV import with column mapping, validation, dedupe, provenance and
   source recording; searchable/filterable/sortable paginated table; lead detail with
   owner, status, score breakdown, notes/timeline, source links, verification badges;
   soft delete; authorized CSV export with provenance and verification columns.
3. Agent marketplace: database-driven agent cards, plan entitlements, enable/configure
   per workspace, run form validated against each agent's input schema.
4. Job system: worker endpoint with secret + cron, atomic lease claiming, per-step
   records, retries/backoff, cancellation, stale-lease recovery, usage reservation.
5. Agent runtime wiring: every agent declares the provider it needs, jobs are gated by
   plan access and a global `AGENT_RUNTIME_READY` flag, and the run UI explains missing
   configuration. Source and AI adapters ship in Phase 4; until then the server rejects
   runs cleanly and the UI never pretends execution is available.
6. Campaign scaffolding: create campaigns, add qualified leads, statuses, daily send cap,
   campaign detail with funnel counts.

Acceptance criteria:
- Import 500-row CSV with mixed valid/invalid rows; invalid rows are reported, valid rows
  are stored once with source attribution; duplicate re-import does not duplicate leads.
- Filters, search, pagination, notes, status changes, and export all work with correct
  workspace scoping.
- Worker claims each job once; simulated transient failure retries and succeeds; forced
  permanent failure is recorded without partial duplicate leads.
- No run can exceed plan limits; usage counters reconcile after cancel/failure.
- With no AI/source keys, provider-dependent actions are disabled server-side with clear
  setup guidance (verified by test).

### Phase 3 verification (2026-11-05)

Automated:
- [x] `npm run test`: 11 files, 72 tests, including DB-backed integration suites that push
  the real schema to a throwaway SQLite database (import/dedupe/limits and job
  claim/retry/cancel/refund).
- [x] `npm run typecheck`, `npm run lint`, and `npm run build` pass. The production build
  includes every new route: import wizard and reports, lead detail, campaign creation and
  detail, agent detail, run detail, CSV export, and the worker endpoint.

Browser QA (desktop):
- [x] CSV import of 4 rows stored 2 leads, skipped 1 duplicate, and reported 1 invalid row
  with reasons. Re-importing the same file stored 0 and skipped 3.
- [x] Leads list shows source, evidence link, and verification status; lead detail status
  change, notes, and activity timeline all persist.
- [x] Campaign creation, the activation guard with no leads, adding a qualified lead,
  activation, and daily cap update all work.
- [x] Status controls reflect the saved value immediately after the action, with no reload.
- [x] Agent detail replaces the run form with an explicit execution-unavailable notice and
  provider setup guidance while `AGENT_RUNTIME_READY` is false.
- [x] A queued run can be cancelled, the reserved run is refunded, and workspace usage
  returns to 0/10. A succeeded run shows its step log and structured result.
- [x] CSV export returns leads with provenance/verification columns, writes an audit entry,
  allows the Free plan's two exports, then returns 429.
- [x] Worker endpoint returns 503 when no secret is configured, 401 for a missing or wrong
  secret, 200 with the correct secret, and 405 for GET.

Fixed during verification:
- Uncontrolled status selects kept showing the pre-action value after a successful server
  action because React resets the form. Campaign and lead status selects now remount when
  the saved value changes.
- SQLite does not support `createMany({ skipDuplicates })`; campaign lead inserts now dedupe
  explicitly.
- CSV auto-mapping could bind the same column to two fields; it now uses a two-pass
  exact-then-fuzzy match.

Known limitations:
- Phase 3 shipped before the live adapters. Phase 4A now implements Apollo, People Data
  Labs, Google Places, and the OpenAI-compatible AI adapter; execution remains gated by
  `AGENT_RUNTIME_READY` and the configured keys.
- Campaign sending was unavailable when Phase 3 shipped; Phase 4B now implements
  approval-gated outreach. Stripe checkout and account email delivery remain unavailable by
  design and are labeled as such in the UI.
- 390 px mobile QA is limited to static review of responsive classes and overflow
  containers; the in-app browser cannot emulate a device. Wide tables use horizontal
  scrollers and the sidebar collapses into the mobile navigation.

Depends on: Phase 2, provider decisions in `docs/INTEGRATIONS.md`.

## Phase 4A — Provider adapters and grounded execution (complete)

Build:
- [x] Lead-source adapters behind `PRIMARY_LEAD_SOURCE`: Apollo, People Data Labs, and
  Google Places. Requests are shaped per provider, responses are normalized to one
  contract, and only fields the provider actually returned are kept. Timeouts, auth,
  rate-limit, upstream, and invalid-response failures are classified.
- [x] OpenAI-compatible AI adapter (`POST /chat/completions`) with JSON output, timeout,
  truncation handling, and zod validation for research and qualification results.
- [x] Executors for Lead Finder, Company Research, and Lead Qualification. Discovery
  writes source, evidence, verification, activity, and audit rows in one transaction and
  dedupes by email, then domain, then company+location. Research and qualification only
  update the workspace's own records and preserve statuses a person set.
- [x] Runtime gating: `AGENT_RUNTIME_READY` plus per-agent provider availability. Missing
  configuration fails closed; no mock provider is used to serve customer data.
- [x] UI and docs: Integrations shows the active source, per-provider Configured/Active
  badges, terms links, and the selection error. Agent and run pages describe what a run
  can actually change.

Acceptance criteria:
- [x] A run returns only records actually returned by the provider; every lead has
  provider, record ID, URL, retrievedAt, and verification status.
- [x] Provider and AI failures produce clear errors with no invented fallback records and
  no partial writes; retryable failures return to the queue.
- [x] AI output failing schema validation is rejected and retried, never stored.
- [x] Plan limits are enforced atomically and the reserved run is refunded on permanent
  failure or cancellation.

### Phase 4A verification (2026-11-05)

Automated:
- [x] `npm run test`: 19 files, 133 tests. New provider unit suites cover selection rules,
  request shaping, normalization, skips, and error mapping for Apollo, PDL, Google
  Places, and the AI adapter. A DB-backed executor suite covers discovery + dedupe/re-run,
  grounded research, qualification with human-status preservation, plan-limit failure +
  refund, and invalid AI output requeued without writes.
- [x] `npm run typecheck`, `npm run lint`, and `npm run build` pass.

Browser QA (desktop):
- [x] `/integrations` shows the active discovery source as "Not configured" with the
  selection guidance, per-provider Not configured badges, terms links, CSV "Available
  now", and no console errors.
- [x] Lead Finder, Company Research, and Lead Qualification pages show "Provider missing"
  (the honest state with no AI/source keys) and the updated copy about workspace-only
  writes; no console errors.
- [x] A succeeded run detail page shows the "What this run can change" notice and step
  log; no console errors.

Known limitations:
- Live provider calls require real Apollo/PDL/Google Places keys, an AI key/model, and
  `AGENT_RUNTIME_READY=true`. Adapter tests use injected stubs and never contact a
  provider.
- Phase 4B now implements approval-gated outreach, suppression, unsubscribe, human field
  verification, and manual outcome analytics.
- `COMPETITOR_RESEARCH`, `EMAIL_OUTREACH`, and `FOLLOW_UP` have no executor and remain
  disabled.

Depends on: Phase 3, live/test credentials, provider terms acceptance.

## Phase 4B — Outreach safety (complete)

Build:
- [x] Grounded outreach drafts: deterministic templates built only from stored workspace and
  lead facts, with an optional AI draft path when the model is configured. Subject/body are
  validated, and an edit to an approved message revokes approval.
- [x] Approval gate: an admin or owner approves the exact subject and body. Approval stores
  the approver, timestamp, and a SHA-256 content hash; sending re-computes and compares it.
  Approval requires a workspace mailing address and a valid recipient email.
- [x] Suppression: workspace-scoped suppression list with manual add, CSV import (validated,
  deduped), search, and removal. Addresses are checked before a draft is created and again
  immediately before every send.
- [x] Signed unsubscribe: deterministic HMAC token bound to workspace/message/email; only
  `sha256(token)` is stored. The public page works without login, masks the address, is
  idempotent, and records a suppression plus lead activity and audit entries.
- [x] Delivery: Resend adapter gated by `RESEND_API_KEY`/`EMAIL_FROM`. Sends enforce an
  active campaign, campaign daily cap, and plan daily send allowance; failures leave the
  message approved and release the reserved allowance. Every message appends the workspace
  mailing address and one-click unsubscribe link.
- [x] UI: campaign outreach pipeline, message detail with exact delivery preview, approval
  and send actions, clear failure states, and a suppression settings page.

Acceptance criteria:
- [x] Editing a draft is preserved; approval covers the exact content sent.
- [x] Suppressed addresses are blocked at draft time and at send time, including after
  approval.
- [x] Unsubscribe works without login, adds a suppression entry, and blocks subsequent
  sends.
- [x] Provider failures are reported honestly on the message; nothing is simulated.

### Phase 4B verification (2026-11-06)

Automated:
- [x] `npm run test`: 24 files, 177 tests. New suites cover template grounding and approval
  hashes, unsubscribe token signing, suppression add/import/search/remove, and a DB-backed
  outreach suite covering content-hash revocation, suppression at draft and send time, caps,
  provider success/failure, allowance release, the Resend payload, and public unsubscribe
  (including forged and rebound tokens).
- [x] `npm run typecheck`, `npm run lint`, and `npm run build` pass.

Browser QA (desktop):
- [x] Generated a grounded draft from a real campaign lead and confirmed the exact preview
  includes the sender identity, mailing address, and signed unsubscribe URL.
- [x] Approval without a mailing address is blocked with a clear message; after saving the
  address, approval stores the content hash and updates the pipeline to Approved.
- [x] Sending without a provider reports `NOT_CONFIGURED` and leaves the message approved.
- [x] Suppression add, search/no-match, and removal all work.
- [x] Public unsubscribe rejects an invalid token, previews a valid one with a masked
  address, records the suppression, and shows an already-suppressed state on repeat.
- [x] Campaign detail reports the SENT count and stage; zero console errors.

Known limitations:
- Live sending requires `RESEND_API_KEY`, `EMAIL_FROM`, and ideally a verified sending
  domain. Account verification/reset email stays unavailable until then.
- Field-level verification and campaign analytics were completed in the Phase 4B
  continuation below.
- `COMPETITOR_RESEARCH`, `EMAIL_OUTREACH`, and `FOLLOW_UP` still have no executors.

Depends on: Phase 4A, verified email domain, provider terms acceptance.

## Phase 4B (continued) — Field verification and campaign analytics (complete)

Build:
- [x] Field-level verification: an admin records a `LeadFieldVerification` result per field
  (verified, partially verified, unverified) with an optional evidence URL and note. The
  overall lead status is derived from populated fields, never from provider claims. Values
  that were not checked stay unverified.
- [x] Campaign analytics: sent, replied, meeting, and bounced counts plus reply/meeting rates
  built from recorded sends and manual outcome logging. Open tracking is explicitly absent
  because no provider webhook is connected.
- [x] Manual outcomes: `REPLIED`, `MEETING`, and `BOUNCED` are recorded by a member with an
  optional note. Each writes lead activity and an audit entry; a hard bounce adds a
  `BOUNCED` suppression entry.
- [ ] Follow-up agent: due-date queue and reminders; no auto-send without approval. This
  remains for a later phase.

Acceptance criteria:
- [x] Provider values that cannot be cross-checked stay marked as unverified rather than
  being shown as verified.
- [x] Analytics distinguish recorded sends and manual outcomes from observed provider events
  and never invent opens/replies.
- [x] Hard bounces block future sends through the suppression list.
- [ ] Follow-up reminders cannot send without a fresh human approval (pending the executor).

Depends on: Phase 4B outreach safety. Provider-webhook tracking additionally depends on
live/test credentials and a verified email domain.

### Phase 4B continuation verification (2026-11-07)

Automated:
- [x] `npm run test`: 25 files, 187 tests. New suites cover manual reply/meeting/bounce
  outcomes, idempotent recording, bounce suppression, rejection before send and after a
  bounce, campaign analytics counts and rates, and human field verification (derivation,
  upsert, invalid fields/statuses/evidence URLs, and tenant isolation).
- [x] `npm run typecheck`, `npm run lint`, and `npm run build` pass.

Browser QA (desktop):
- [x] Campaign detail shows sent/replied/meeting/bounce counts, reply/meeting rates, and an
  explicit "opens are not tracked" note.
- [x] Recorded a manual reply on a sent message; the message page showed the timestamp and
  note, removed the replied option, and campaign analytics updated to 1 reply / 100%.
- [x] The message page warned that the recipient email was not verified, then removed the
  warning after an admin recorded a `contactEmail` field check.
- [x] Recorded a field check with an evidence URL; the lead's overall status recalculated to
  Partially verified and the activity timeline logged it. Zero console errors.

Known limitations:
- Provider webhook ingestion for opens/replies is not connected; outcomes are manual.
- Field verification is a human attestation. It depends on the reviewer actually checking
  the value; the product does not automate cross-source verification.

## Phase 5 — Billing, limits, admin, compliance safeguards

Build:
1. Stripe adapter: Checkout, Billing Portal, webhooks (signature verified, idempotent),
   subscription state sync, plan changes, cancellation, past-due handling.
2. Plan enforcement: atomic usage reservation for leads, runs, seats, workspaces, sends,
   exports; soft/hard limit behavior; upgrade prompts.
3. Admin console: plans and limits CRUD, agent catalog and entitlements, provider status,
   workspace overview, audit search, feature flags, superadmin-only access + audit.
4. Compliance controls: suppression management UI + import, unsubscribe settings, sender
   identity, approval policy per workspace, send caps, retention settings, DSAR/export
   and account deletion workflow.
5. Security hardening: full rate-limit matrix, CSP/headers, secret rotation notes, audit
   coverage review, dependency audit, permission tests.

Acceptance criteria:
- Test-mode Stripe upgrade/downgrade/cancel/webhook replay all update entitlements once.
- Every limit is enforced server-side with an atomic test proving no overrun under
  concurrency.
- Non-admin cannot reach admin routes or APIs; every privileged action is audited.
- Suppression import blocks matching sends; approval policy cannot be bypassed by role or
  direct API call.
- Security checklist passes with documented residual risks.

Depends on: Phase 4B, Stripe account and price IDs.

## Phase 6 — Verification, hardening, deployment

Build:
1. Full test pass: unit, integration, E2E critical flows, workspace isolation, limits,
   suppression, provider failure modes.
2. Fix all defects found; remove dead code and placeholder copy; accessibility pass
   (labels, focus, contrast, keyboard navigation).
3. Performance: query review/indexes, pagination limits, N+1 checks, bundle review.
4. Documentation: README, setup, environment reference, deployment guide, runbook,
   backup/restore, incident and key-rotation procedures.
5. Deployment: Postgres migration, env configuration, cron, webhooks, health checks,
   smoke test on the deployed URL.

Acceptance criteria:
- Clean install from README on a fresh machine succeeds.
- Production build + all tests pass; critical E2E flows pass in the browser.
- Deployed environment serves marketing pages, auth, onboarding, dashboard, import,
  provider-backed run (test account), approval-gated send, billing test flow, and admin
  console.
- No secrets in the repository or client bundle; `.env.example` complete.
- Known limitations are documented rather than hidden.

Depends on: Phase 5 and production credentials/domain.

## Cross-phase backlog (post-MVP)

- Team collaboration: comments, mentions, assignment rules.
- CRM sync (HubSpot/Salesforce), calendar booking, reply detection.
- Additional lead providers and data-quality scoring.
- SSO/SAML, audit export, custom retention.
- Localization and currency support.
- Usage-based add-on credits.

## What is needed from you

| When | Needed |
|---|---|
| Phase 2 | Confirm brand direction (logo/wordmark preferences, accent color) if you have one; otherwise I will propose a premium indigo/amber identity |
| Phase 3 | Decide primary lead-source provider and confirm its terms permit your intended use |
| Phase 4A | API keys in `.env.local`: AI model and at least one lead source (`APOLLO_API_KEY`, `PDL_API_KEY`, or `GOOGLE_PLACES_API_KEY`) |
| Phase 4B outreach safety | Email provider (verified domain) for approval-gated sends and unsubscribe handling |
| Phase 4B analytics | Provider webhook/event access if you want automatic opened/replied tracking; manual outcome logging works without it |
| Phase 5 | Stripe test keys + price IDs; confirm plan prices/limits |
| Phase 6 | Hosting choice and domain; production keys |

Never paste secrets in chat. I will provide `.env.example` and tell you exactly which
values to add locally or in the hosting dashboard.
