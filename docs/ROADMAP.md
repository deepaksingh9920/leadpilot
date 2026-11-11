# LeadPilot — Development Roadmap

Status: Phase 6 verification and hardening in progress — health/readiness probe complete. Phase 5B enforcement, admin, security, compliance, and ownership-transfer work is complete except workspace-count enforcement and account-level deletion · Last updated: 2026-11-11

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
- Live agents, lead sources, outreach sending, CSV import, billing checkout, and team
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
  approval-gated outreach. Billing checkout and account email delivery remained unavailable
  at that time; Phase 5A now implements Razorpay billing behind explicit env flags.
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

### Phase 5A — Razorpay billing (complete, 2026-11-08)

Build (done):
1. `PlanProviderPrice` maps each plan and interval to a Razorpay `plan_id`; migration
   applied, superadmin edits monthly/yearly IDs in the admin console with audit.
2. `src/lib/billing/razorpay.ts`: Basic-auth API client for create/fetch/cancel, hosted
   `short_url` checkout, raw-body HMAC-SHA256 verification, webhook parsing.
3. `src/server/services/billing.ts`: billing state, owner-gated checkout/cancel, safe
   Razorpay-host redirect check, and transactional webhook application. Local plan state
   changes only from a verified event; activation, past-due, paused, resumed, and canceled
   states are handled, with end-of-period cancellation keeping paid access.
4. `POST /api/billing/razorpay`: signature verification over the raw body, event-id
   fallback hash, duplicate-safe 200s, and 503 when the webhook secret is missing.
5. Settings and integrations UI: plan status/interval/renewal, checkout options only for
   mapped intervals, cancel form, and honest unconfigured states. No client checkout
   script.

Verified:
- Adapter unit tests cover request shaping/auth, parsing, cancellation payloads, and
  signature accept/reject cases.
- Integration tests cover checkout gating, unconfigured/missing-webhook refusal, plan and
  interval mapping, webhook activation, replay idempotency, tenant isolation, status
  mapping, downgrade to Free, and cancellation failure leaving state unchanged.
- Browser QA: unconfigured settings state, configured checkout options (fake keys), admin
  Razorpay plan-ID save, audit metadata, invalid-ID rejection, and the 503 webhook response.
- `npm test` (29 files / 228 tests), `npm run typecheck`, `npm run lint`, and `npm run build`
  pass.

Limitations:
- Live Razorpay checkout/webhook verification is blocked until real test keys, a webhook
  secret, and provider plan IDs are supplied.
- Razorpay plan changes are not automated: the UI requires canceling the current
  subscription before a different plan. No Billing Portal equivalent is used.

### Phase 5B — Remaining enforcement, admin, compliance, security (in progress)

#### Slice 1 — Admin console and platform switches (complete, 2026-11-09)

Build (done):
1. `src/lib/features.ts`: database-backed `signups`, `csv_import`, and `outreach_sending`
   switches stored as `feature.<key>` in `Setting`, defaulting to enabled.
2. Service-level gates: signup returns a clear configuration error, CSV import returns
   `DISABLED`, and outreach sending returns `DISABLED` before any provider call. Drafts,
   approvals, suppression checks, and existing leads stay available.
3. `src/server/services/admin.ts`: paginated workspace listing with owner/plan/member/lead
   data and keyword search; manual plan assignment that refuses a live provider-managed
   subscription with `CONFLICT`; feature-flag updates; audit search with keyword,
   workspace, action-prefix, and date filters plus pagination.
4. `/admin`: workspace table with inline plan assignment, feature-flag card, audit
   search/filter/pagination, and honest saved/error banners. Workspaces billed through
   Razorpay show a read-only plan instead of the selector.
5. Server actions are superadmin-gated and audit `workspace.plan_assigned` and
   `platform.feature_flags_updated` with previous/next values.

Verified:
- `admin.integration.test.ts` covers default-on flags, toggle persistence and single audit,
  invalid payloads, signup blocking, workspace search/pagination, assignment/no-op/conflict
  handling, and audit filters/pagination.
- `outreach.integration.test.ts` proves the send switch blocks delivery, leaves the message
  approved, and reserves no allowance. `imports.integration.test.ts` proves the import
  switch leaves no leads, import record, or usage behind.
- Browser QA: workspace search, no-op plan assignment, switching outreach off and back on
  with audit rows, and audit filters/pagination.
- `npm test` (30 files / 245 tests), `npm run typecheck`, `npm run lint`, and `npm run build`
  pass.

#### Slice 2 — Team invitations and seat enforcement (complete, 2026-11-09)

Build (done):
1. `src/server/services/team.ts`: invite, revoke, preview, accept, and
   register-and-accept flows. Pending unexpired invitations reserve a seat; the seat cap is
   checked after a no-op write to the workspace row, which serializes concurrent invites and
   acceptances in SQLite. Only admins/owners can invite; only the owner can invite an admin.
2. Invitations are single-use bearer tokens stored only as SHA-256 hashes, expire after seven
   days, and are scoped to one workspace and email. Accepting requires the signed-in email to
   match; a new teammate registers from the same link, which proves address ownership and
   sets `emailVerifiedAt`. Public signup switches do not block invite-based registration.
3. `src/lib/email/send.ts`: `sendInviteEmail` with the 7-day expiry copy; when email is not
   configured, the inviter still gets a copyable share link and an honest warning.
4. `/settings` Team card: live seat count including pending invites, member list, pending
   invitation list with revoke, and a role-aware invite form. `/invite/[token]` handles
   invalid/expired/accepted links, signed-in wrong-account warnings, existing-account sign-in,
   and new-account registration.
5. Server actions are role-gated and rate-limited; invites, revocations, and acceptances write
   audit entries with role/email metadata.

Verified:
- `team.integration.test.ts` covers invite permission and admin-escalation rules, duplicate
  and existing-member conflicts, seat reservation/refusal, revocation and seat release,
  existing-account acceptance, wrong-email refusal, new-account registration, replay refusal,
  expiry for preview/accept/register, seat-limit refusal at accept time, tenant scoping, and
  the seven-day TTL.
- Browser QA: assigned a 10-seat plan, invited a teammate, saw the pending invite and 2/10
  seats, opened the link while signed in as the wrong account, registered a new account from
  the link into the workspace, and revoked a second invite with the seat count returning to
  2/10.
- `npm test` (31 files / 256 tests), `npm run typecheck`, `npm run lint`, and `npm run build`
  pass.

#### Slice 3 — Security hardening (complete, 2026-11-10)

Build (done):
1. `src/lib/security/headers.ts`: one pure builder for the headers applied to every route
   by `next.config.ts`. The CSP locks scripts, styles, images, fonts, connections, workers,
   and manifests to this origin; plugins, framing, base-tag hijacking, and cross-origin form
   posts are blocked. HSTS and `upgrade-insecure-requests` are production-only, and
   `'unsafe-eval'`/dev websockets are development-only. `X-Powered-By` is removed.
2. `src/lib/auth/rate-limits.ts`: a centralized policy matrix used by every sensitive
   server action and API route. New coverage includes password change, profile update,
   agent runs, outreach drafts and sends, billing checkout, and lead export. The shared
   message helper reports the real retry window.
3. `src/lib/security/worker-auth.ts`: constant-time `Bearer`/`x-worker-secret` comparison
   that fails closed when `WORKER_SECRET` is unset. The worker route now uses it.
4. `docs/SECURITY.md`: threat model, authentication/session and tenant-isolation notes,
   CSRF posture, the full rate-limit matrix, CSP rationale and residual risk, worker and
   webhook authentication, secret rotation, audit limitations, dependency-audit result, and
   a production checklist.
5. Dependency audit recorded rather than hidden: `npm audit --omit=dev` reports three high
   advisories from `deepmerge-ts@7.1.5` through Prisma's CLI/config packages. The fix is a
   breaking Prisma 7 upgrade and is scheduled, not forced into this slice.

Verified:
- `headers.test.ts` checks the development and production policies, HSTS gating, and every
  static header. `worker-auth.test.ts` covers Bearer and header secrets, wrong values,
  length mismatches, and the unconfigured case. `rate-limits.test.ts` pins the sensitivity
  bounds of the matrix.
- `npm test` (34 files / 269 tests), `npm run typecheck`, `npm run lint`, and `npm run build`
  pass.
- Dev-server `/login` response carried all expected headers; HSTS was correctly absent in
  development.
- Browser QA loaded `/dashboard`, `/agents`, `/campaigns`, `/leads`, `/settings`,
  `/settings/suppression`, and `/integrations` under the CSP with zero console errors;
  `/admin` redirected the non-superadmin.
- `/api/leads/export` returned ten `200` responses and then `429` with `Retry-After`,
  proving the new limit is enforced through the route.

Residual risk:
- The CSP is nonce-free because static pages cannot receive per-request nonces, so
  `'unsafe-inline'` remains for framework bootstrap and Tailwind styles. A strict nonce
  policy requires dynamic rendering; the path is documented in `docs/SECURITY.md`.
- `X-Forwarded-For` is trusted for rate-limit keys and audit IPs. Production must run behind
  a trusted proxy that overwrites it.
- The `deepmerge-ts` advisory stays open until Prisma 7.

#### Slice 4 — Compliance controls (complete, 2026-11-10)

Build (done):
1. `Workspace` gains `leadRetentionDays` (null / 30 / 90 / 180 / 365) and an
   `approvalPolicy` (`ADMIN_OR_OWNER` default, or `OWNER_ONLY`) plus a `deletedAt` index.
   The migration is `20261110185203_phase5b_compliance_settings`.
2. `src/lib/compliance/settings.ts`: pure parsing, cutoff, grace-period, and label helpers
   used by the service and UI.
3. `src/server/services/compliance.ts`: settings read/update with audit of previous and next
   values; retention cleanup that soft-deletes leads older than the window and permanently
   purges leads and workspaces after the 30-day grace; versioned DSAR export; and
   workspace deletion requiring the exact workspace name and current password, refusing
   while a Razorpay subscription is live, then soft-deleting, revoking invites, and ending
   the session.
4. `src/app/api/workspace/export/route.ts`: admin-only JSON download with
   `Content-Disposition`, `no-store`, audit logging, and a 3/hour limit.
5. `/settings` "Data and compliance" card: retention and approval-policy form, current-data
   summary, manual cleanup, DSAR download, and the owner-only delete-workspace form.
6. Outreach policy is enforced twice: the UI and server actions gate on the workspace policy,
   and `approveOutreachMessage`/`sendOutreachMessage` re-read the actor's membership and the
   workspace policy, returning `FORBIDDEN` on a direct-call bypass.
7. The worker endpoint runs retention cleanup after each queue batch and returns its counts;
   a cleanup failure is reported without discarding the job result. Compliance settings,
   export, cleanup, and deletion take their limits from the centralized matrix.

Verified:
- `compliance.integration.test.ts` covers valid/invalid settings, no-op audit behaviour,
  retention soft delete, grace-period purge, active-workspace safety, workspace purge and
  audit survival, export contents/soft-delete exclusion/audit, wrong-name and wrong-password
  deletion refusal, live-subscription refusal, and successful deletion with invite cleanup.
- `outreach.integration.test.ts` proves an admin can approve under the default policy but is
  refused at approval and send under `OWNER_ONLY`, while the owner can still approve.
- `npm test` (36 files / 287 tests at the time of this slice), `npm run typecheck`,
  `npm run lint`, and `npm run build` pass.

Residual risk:
- The worker must be scheduled for retention and purge to run automatically; manual cleanup
  and the in-app worker trigger are the only execution paths in this build.
- Workspace deletion is soft delete plus scheduled purge. Account-level ownership transfer
  and account deletion remain out of scope.
- Audit records are application-level only; external tamper evidence remains a launch gap.

#### Slice 5 — Workspace ownership transfer (complete, 2026-11-11)

Build (done):
1. `transferWorkspaceOwnership` in `src/server/services/team.ts`: owner-only, requires the
   current password, refuses self-transfer, missing members, viewers, and soft-deleted
   workspaces. A transaction locks the workspace, re-checks the owner and target roles, moves
   `ownerId`, demotes the former owner to `ADMIN`, promotes the target to `OWNER`, and writes
   `workspace.ownership_transferred` with previous and next owner identities.
2. `transferOwnershipAction` with the `ownershipTransfer` rate limit (3/hour); success
   redirects to `/settings?ownership=transferred`, where a notice explains the new role.
3. `/settings` "Workspace ownership" card lists eligible members and admins only, with the
   password confirmation and a warning that billing stays attached to the workspace.

Verified:
- `team.integration.test.ts` covers admin/self/viewer/missing-member refusals, wrong-password
  refusal, deleted-workspace refusal, successful atomic transfer with audit metadata, and the
  former owner losing the ability to transfer again.
- `npm test` (36 files / 290 tests), `npm run typecheck`, `npm run lint`, and `npm run build`
  pass.

Residual risk:
- The transfer is immediate rather than invitation-based; the password re-check is the only
  confirmation. Billing responsibility moves with the workspace without a Razorpay account
  hand-off check.
- Account-level deletion remains out of scope; owners delete workspaces individually.

Remaining Phase 5B:
1. Workspace-count enforcement is blocked: there is no account-level billing model or an
   extra-workspace creation flow, so the limit can only be displayed.
2. Account-level deletion (not workspace-level) remains.
3. Remaining hardening for launch: Postgres migration, trusted-proxy configuration,
   monitoring/alerting, worker scheduling, and the Prisma major upgrade.

Acceptance criteria:
- Test-mode Razorpay upgrade/downgrade/cancel/webhook replay all update entitlements once.
- Every limit is enforced server-side with an atomic test proving no overrun under
  concurrency.
- Non-admin cannot reach admin routes or APIs; every privileged action is audited.
- Suppression import blocks matching sends; approval policy cannot be bypassed by role or
  direct API call.
- Security checklist passes with documented residual risks.

Depends on: Phase 4B; for live billing, a Razorpay account, test keys, webhook secret, and
plan IDs.

## Phase 6 — Verification, hardening, deployment

#### Slice 1 — Health/readiness probe (complete, 2026-11-11)

Build (done):
1. `src/server/services/health.ts`: a structural database probe (`SELECT 1`), coarse provider
   status mapping from `env`, injected clock for tests, and a report that degrades instead of
   throwing when the database is unreachable. It never includes keys, URLs, or connection
   strings.
2. `src/app/api/health/route.ts`: unauthenticated `GET` returning `200` when healthy and `503`
   when degraded, with `Cache-Control: no-store` and `x-robots-tag: noindex`.

Verified:
- `health.test.ts` covers a healthy probe with measured latency, a failing probe that returns
  `degraded`/`unavailable` without throwing, configured/unconfigured provider mapping, a
  coarse-clock zero floor, and a check that no secret-shaped values appear in the payload.
- Live dev server: `GET /api/health` returned `200` with database `ok`, provider booleans, and
  the expected cache/robots headers; the dev server was then stopped.
- `npm test` (37 files / 294 tests), `npm run typecheck`, `npm run lint`, and `npm run build`
  pass.

Residual risk:
- The probe is unauthenticated and performs one trivial query per request; a production
  deployment should front it with platform rate limiting or cache it at the edge if abused.

Remaining build:
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
| Phase 5 | Razorpay test keys, webhook secret, and monthly/yearly `plan_id` values; confirm plan prices/limits |
| Phase 6 | Hosting choice and domain; production keys |

Never paste secrets in chat. I will provide `.env.example` and tell you exactly which
values to add locally or in the hosting dashboard.
