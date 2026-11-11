# LeadPilot — Security Model

Status: Phase 5B slice 3 hardening applied; deployment-time controls outstanding ·
Last updated: 2026-11-10

This document describes what the application enforces today, how it was verified, and
which risks remain. It is an engineering reference, not a certification or legal opinion.

## 1. Scope and assets

LeadPilot is a multi-tenant B2B prospecting application. The assets that matter most:

- **Customer lead data** — contact fields, provenance, verification, notes, and campaign
  content, scoped to one workspace.
- **Outreach authority** — the ability to approve and send email on a customer's behalf.
- **Billing authority** — plan entitlements and the Razorpay subscription that pays for
  them.
- **Identity material** — passwords, session tokens, verification/reset tokens, invite
  tokens, unsubscribe tokens, and worker/webhook secrets.
- **Provider credentials** — AI, lead-source, email, and Razorpay keys held only in server
  environment variables.
- **Audit integrity** — the record of who changed plans, roles, switches, approvals, and
  sends.

## 2. Threat model

| Actor | Capability assumed | Primary controls |
|---|---|---|
| Anonymous internet user | Can reach marketing, auth, public unsubscribe, webhook, and worker routes | Rate limits, signed tokens, no public data routes, CSP/headers |
| Authenticated member of a workspace | Valid session, lowest useful role | Role checks and workspace scoping in the service layer; approval requires admin/owner |
| Malicious workspace admin | Can invite, approve, export, and import | Owner-only billing/admin-invite; audit trail; provider-managed plan protection |
| Compromised browser session | Can act as the signed-in user until expiry/revocation | httpOnly/SameSite cookies, short-lived high-risk rate limits, session revocation on password change |
| Rogue or compromised provider | Returns malicious/malformed data | Schema validation, no invented fallbacks, source/verification labels, prompt-injection delimiting |
| Network attacker | Can tamper with requests in transit | HSTS and Secure cookies in production; webhook HMAC; worker secret |
| Platform superadmin | Can manage plans, switches, and audit | Superadmin-only routes, explicit confirmations, audit entries with previous/next values |

Trust boundaries:

1. Browser ↔ Next.js server. Cookies are the session boundary; Server Actions and route
   handlers re-check identity and authorization on every mutation.
2. Next.js ↔ database. The app is the only writer; every tenant query includes a workspace
   predicate.
3. Next.js ↔ external providers. Provider responses are untrusted input and are normalized
   and validated before storage.
4. Provider ↔ webhook. Razorpay events are authenticated by HMAC over the raw body before
   parsing.
5. Scheduler ↔ worker. The worker endpoint requires a shared secret, compared in constant
   time.

## 3. Authentication and sessions

- Passwords are hashed with bcrypt at cost 12 (`src/lib/auth/password.ts`). Password length
  and confirmation are validated before hashing.
- Sessions use a 256-bit random token. Only `sha256(token)` is stored; the plaintext token
  exists only in the cookie (`src/lib/auth/session.ts`).
- The session cookie is `httpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, and
  expires with the session record. There is no sliding refresh: expiry is 30 days from
  creation.
- Expired sessions are deleted on lookup; disabled users are rejected even with a valid
  token. Changing a password revokes other sessions.
- Account closure requires the current password and the exact account email, revokes every
  session, and replaces the password hash with an unknown value. Owners must transfer or
  delete active workspaces first, and superadmins must be removed by another administrator.
- Email verification, password reset, and invitations use single-use random tokens stored
  only as SHA-256 hashes. Reset and verification tokens have bounded lifetimes; invitations
  expire after seven days.
- `AUTH_SECRET` must be at least 32 characters and is required before a session is issued.

## 4. Authorization and tenant isolation

- Roles are `VIEWER < MEMBER < ADMIN < OWNER`, checked through `src/lib/auth/workspace.ts`.
- The active workspace is resolved from the session and a workspace cookie; membership is
  re-checked on every request. A user cannot select a workspace they do not belong to.
- All domain reads and writes go through server services that include the workspace ID.
  Components do not query Prisma directly.
- Privileged actions have explicit role gates: approving/sending outreach requires
  `ADMIN`/`OWNER` (or `OWNER` under an owner-only policy); billing, admin invitations, and
  ownership transfer require `OWNER`; platform administration requires `isSuperAdmin`.
  Ownership transfer additionally requires the current password and refuses viewer targets.
- Superadmin status is a platform capability, not a workspace role. `/admin` and its actions
  redirect or refuse non-superadmins before any data is loaded.

## 5. CSRF and request integrity

- Session cookies are `SameSite=Lax`, so cross-site form posts do not carry the session.
- Mutations are Next.js Server Actions, which Next.js rejects when the request Origin does
  not match the host.
- The only mutating route handlers are the worker endpoint (shared secret) and the Razorpay
  webhook (HMAC signature). The CSV export route is read-only and still requires a session
  and an allowed role.
- Public unsubscribe mutates only the token's bound workspace/address and is idempotent; it
  requires possession of a signed token that cannot be re-bound to another recipient.

## 6. Rate limits

All limits are centralized in `src/lib/auth/rate-limits.ts` and use the database-backed
fixed-window limiter in `src/lib/auth/rate-limit.ts`. The limiter fails closed on database
errors. Keys are stable because the limiter stores them.

| Policy | Limit | Window | Key scope | Guards |
|---|---:|---|---|---|
| `signup` | 3 | 1 h | IP | Account creation |
| `login` | 5 | 15 min | IP + email | Credential guessing |
| `forgotPassword` | 5 | 1 h | IP | Reset-mail abuse |
| `resetPassword` | 5 | 1 h | IP | Token guessing |
| `resendVerification` | 3 | 1 h | User | Verification-mail abuse |
| `onboarding` | 15 | 1 h | User + IP | Wizard writes |
| `passwordChange` | 5 | 1 h | User | Session takeover persistence |
| `profileUpdate` | 30 | 1 h | User | Profile write abuse |
| `csvImport` | 10 | 1 h | User | Import cost and storage abuse |
| `suppressionImport` | 5 | 1 min | Workspace + user | Suppression churn |
| `leadExport` | 10 | 1 h | User | Bulk data exfiltration |
| `agentRun` | 20 | 5 min | User | Provider spend and queue flooding |
| `outreachDraft` | 60 | 1 h | User | AI/template draft abuse |
| `outreachSend` | 30 | 5 min | Workspace + user | Send bursts |
| `teamInvite` | 20 | 1 h | Workspace | Invite spam and seat churn |
| `inviteAccept` | 10 | 1 h | IP | Token guessing |
| `inviteRegister` | 5 | 1 h | IP | Invite-based account spam |
| `billingCheckout` | 10 | 1 h | Workspace + user | Duplicate subscription creation |
| `complianceUpdate` | 20 | 1 h | Workspace + user | Approval-policy/retention churn |
| `dataExport` | 3 | 1 h | User | Full-workspace DSAR exfiltration |
| `retentionCleanup` | 5 | 1 h | Workspace + user | Destructive-job abuse |
| `workspaceDeletion` | 3 | 1 h | Workspace + user | Password-guessing against deletion |
| `ownershipTransfer` | 3 | 1 h | Workspace + user | Password-guessing against ownership transfer |
| `accountDeletion` | 3 | 1 h | User | Password-guessing against account closure |

Plan entitlements (seats, monthly leads, daily sends, exports, agent runs) are enforced
separately and atomically in the service layer. Rate limits do not replace plan limits.

## 7. Security headers and CSP

`src/lib/security/headers.ts` builds the headers applied to every route by
`next.config.ts`:

| Header | Value |
|---|---|
| `Content-Security-Policy` | See below |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` (production only) |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | camera, microphone, geolocation, browsing-topics disabled |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `X-DNS-Prefetch-Control` | `off` |
| `X-Permitted-Cross-Domain-Policies` | `none` |

The policy is nonce-free:

```
default-src 'self';
script-src 'self' 'unsafe-inline' ['unsafe-eval' in development];
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' ['ws: wss:' in development];
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
worker-src 'self' blob:;
manifest-src 'self';
[upgrade-insecure-requests in production]
```

**Why no nonce.** The marketing pages (`/`, `/features`, `/pricing`) and some auth pages
(`/_not-found`, `/forgot-password`) are statically generated. A per-request nonce would
force every page to render dynamically and would still not reach static documents. The
current policy instead locks script/style origins to the app and keeps `'unsafe-inline'` for
the framework bootstrap and Tailwind's injected styles. `'unsafe-eval'` is development-only.

**Residual risk.** `'unsafe-inline'` weakens XSS defence: an injected inline `<script>` could
execute. Mitigations are React's auto-escaping, server-side rendering of user content,
`form-action`/`frame-ancestors` restrictions, httpOnly cookies, and no user-controlled raw
HTML rendering. **Path to strict CSP:** move to dynamic rendering with a proxy-generated
nonce, drop `'unsafe-inline'` from `script-src`, and either hash or nonce the remaining
styles. Treat this as a post-launch hardening item with browser regression testing.

`next.config.ts` also sets `poweredByHeader: false`, removing the `X-Powered-By` hint.

## 8. Worker endpoint

`POST /api/worker/run` is the only job trigger. `src/lib/security/worker-auth.ts` accepts the
secret as a `Bearer` token or an `x-worker-secret` header, compares it with
`timingSafeEqual` after an explicit length check, and returns `false` when `WORKER_SECRET` is
not configured. Missing or wrong secrets therefore produce `401`; an unconfigured secret
produces `503`. The endpoint rejects methods other than `POST`.

## 9. Webhook authentication and billing integrity

- `POST /api/billing/razorpay` verifies an HMAC-SHA256 signature over the **raw** request
  body before parsing. Without `RAZORPAY_WEBHOOK_SECRET` the route returns `503`.
- Each event is recorded once by `(provider, externalEventId)`. A duplicate event returns
  `200` without applying anything twice; a missing event ID falls back to a content hash.
- Subscription, plan, and audit changes happen in one transaction. A redirect from checkout
  never changes the local plan.
- Checkout is refused unless the API keys **and** webhook secret are present, so payment
  cannot be collected without an activation path.
- Only the workspace owner can start checkout or cancel. Cancellation defaults to the end
  of the paid period.

## 10. Secret handling and rotation

- Secrets live only in `.env.local` (gitignored) or the hosting provider's secret store.
  `.env.example` contains placeholders.
- Secrets are read server-side through `src/lib/env.ts`; none are exposed through
  `NEXT_PUBLIC_*` variables or client components.
- Rotate `AUTH_SECRET` by issuing new sessions (all existing sessions become invalid once
  their tokens no longer resolve; plan for a sign-in prompt). Rotate `WORKER_SECRET` by
  updating the scheduler and app together. Rotate Razorpay keys and webhook secret in the
  provider dashboard, then update both app and webhook configuration before the next event.
- Rotate provider keys (AI, Apollo, PDL, Google Places, Resend) in the provider dashboard,
  update the environment, redeploy, and confirm the Integrations page reports the new state.
- Never paste secrets into chat, tickets, logs, or audit metadata. Audit entries record
  actions and identifiers, not credentials.
- `INTEGRATION_ENCRYPTION_KEY`, `CRON_SECRET`, and `RATE_LIMIT_WINDOW_SECONDS` appear in
  `.env.example` but are not read by the current code; do not treat their absence as a
  misconfiguration, and do not rely on them for protection today.

## 11. Audit logging

`writeAuditLog` records workspace, actor, action, entity, metadata, IP, and user agent.
Auditing failures are logged but never block the user action, so audit is not a
transactional guarantee. Covered actions include logins, exports, imports, lead deletions,
field verification, approvals, sends, outcomes, role/team changes, plan and switch changes,
and superadmin actions. The admin console supports keyword, workspace, action, and date
filters with pagination and is read-only.

Audit records are append-only from the application's perspective; there is no edit or delete
UI. Database-level tamper evidence (for example, hash chaining or shipping to an external
log store) is not implemented and should be considered for regulated customers.

## 12. Data protection in the application

- Only provider-returned or user-imported fields are stored; missing fields stay missing.
- Suppression is checked before drafting and again immediately before sending, including
  after approval.
- Outbound messages include the workspace mailing address and a signed one-click
  unsubscribe link; unsubscribe works without login and is idempotent.
- Exports include provenance and verification columns and are audit-logged and rate-limited.
- Sensitive personal data is out of scope by policy (`docs/COMPLIANCE.md`).
- Retention is workspace-configurable. Leads past the window are soft-deleted, then
  permanently purged after a 30-day grace; soft-deleted workspaces are purged on the same
  schedule. The cleanup runs after each worker batch (and can be triggered manually by an
  admin). Suppression entries and audit records are not purged with a lead.
- DSAR export is an admin-only JSON bundle. It is rate-limited to three per hour, carries
  `Cache-Control: no-store` and an attachment filename, excludes soft-deleted leads, and
  writes a `workspace.data_exported` audit entry.
- Workspace deletion requires the exact workspace name and the owner's current password. It
  is refused while a Razorpay subscription is live, soft-deletes the workspace immediately,
  revokes pending invites, ends the session, and leaves purge to the retention worker after
  30 days. Account-level deletion is not implemented.
- Workspace ownership transfer is owner-only and requires the current password. The target
  must already be a member or admin (never a viewer), and a single transaction moves `ownerId`,
  demotes the former owner to admin, promotes the target, and audits both identities. Billing
  stays attached to the workspace, so the new owner inherits it.
- Outreach approval policy is enforced twice: the UI/actions gate on the workspace policy,
  and the approval/send services re-read the actor's membership and the policy. A direct
  service call by an admin under `OWNER_ONLY` returns `FORBIDDEN`.
- Backups must inherit the same retention window; backup automation is a deployment task and
  is not part of this repository.

## 13. Dependency and supply-chain posture

- The lockfile is committed and installs are deterministic.
- `npm audit --omit=dev` currently reports **3 high-severity advisories** in the production
  tree: `deepmerge-ts@7.1.5` is reachable through `@prisma/config@6.19.3` and
  `prisma@6.19.3` (the CLI/config path, not the runtime query engine). The advisory is a
  stack-exhaustion issue when merging recursive objects. The fix requires Prisma 7, which is
  a breaking major upgrade.
- **Decision:** do not force the Prisma 7 upgrade in Phase 5B. Document the advisory, keep
  Prisma configuration objects free of attacker-controlled input, and schedule the upgrade
  with a full migration/test pass. Re-run `npm audit --omit=dev` at that time.
- `deepmerge-ts` is not called with customer data by application code. The practical risk is
  low but not zero, so it remains an explicit residual risk rather than a silent exception.

## 14. Verification performed (2026-11-11)

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run build` — clean; all routes compile and prerender as before.
- `npm test` - **38 files / 298 tests** pass, including suites for header/CSP values, worker
  constant-time authorization, the rate-limit matrix, compliance settings/retention/export/
  deletion, and owner-only approval enforcement at the service layer.
- Live dev-server header check on `/login` confirmed CSP, HSTS absence in development,
  `nosniff`, `DENY`, referrer, permissions, COOP/CORP, DNS-prefetch, and cross-domain
  headers.
- Browser QA signed in as a QA user and loaded `/dashboard`, `/agents`, `/campaigns`,
  `/leads`, `/settings`, `/settings/suppression`, and `/integrations` with zero console
  errors; `/admin` redirected the non-superadmin to `/dashboard`.
- `/api/leads/export` returned ten `200` responses and then `429` with `Retry-After` and the
  honest "too many exports" message, proving the new limit is wired through the route.
- Compliance QA signed in as a workspace owner: changed retention and approval policy and saw
  the saved values after revalidation (the form is re-keyed so uncontrolled selects cannot show
  stale values), downloaded `/api/workspace/export` and confirmed a `formatVersion: 1` JSON
  bundle with `no-store` and an attachment filename, ran retention cleanup and saw honest zero
  counts, and submitted a wrong workspace name to the deletion form, which was refused with the
  workspace intact. No console errors were recorded.
- `/api/health` returned `200` with `Cache-Control: no-store`, `x-robots-tag: noindex`,
  database `ok`, and provider states only. Unit tests prove a failed database probe degrades
  the report without throwing (the route maps it to `503`) and that no key names, URLs, or
  secrets appear in the payload.
- Account closure QA with a disposable member account: signed in, typed the account email and
  password, confirmed the warning, and landed on `/login?account=deleted` with the closure
  notice. The old credentials were then rejected. The database showed the tombstone email,
  `disabledAt` set, zero memberships/sessions/tokens, and an `account.deleted` audit entry with
  the expected counts. No console errors were recorded.
- Production-mode header values (HSTS and the stricter CSP) are unit-tested but were not
  served by a production build during this pass.

## 15. Production security checklist

- [ ] Serve only over HTTPS and confirm HSTS after the first production deploy.
- [ ] Put a trusted reverse proxy in front of the app and overwrite `X-Forwarded-For`; the
      app currently trusts that header for rate-limit keys and audit IPs.
- [ ] Replace SQLite with Postgres, enable TLS, and restrict network access.
- [ ] Set `AUTH_SECRET`, `WORKER_SECRET`, and all provider/billing secrets in the hosting
      secret store; never in the repository.
- [ ] Confirm `NODE_ENV=production` so Secure cookies, HSTS, and the production CSP apply.
- [ ] Configure Razorpay webhook delivery to the exact production URL and verify a real
      test event end to end.
- [ ] Configure SPF, DKIM, and DMARC on the sending domain before enabling outreach.
- [ ] Add monitoring/alerting for rate-limit spikes, failed logins, webhook failures, worker
      failures, and audit-write errors.
- [ ] Schedule the worker endpoint so retention/purge runs automatically and monitor its
      counts and failures. Manual cleanup and the worker trigger are the only paths today.
- [ ] Document and rehearse the DSAR/export and workspace-deletion runbook, including backup
      expiry, before taking regulated customers.
- [ ] Schedule the Prisma 7 upgrade to clear the `deepmerge-ts` advisory.
- [ ] Re-run `npm audit --omit=dev`, `npm test`, `npm run typecheck`, `npm run lint`, and
      `npm run build` as part of the release gate.
- [ ] Complete a strict-CSP migration (nonce-based, no `'unsafe-inline'`) when the marketing
      pages can tolerate dynamic rendering.
