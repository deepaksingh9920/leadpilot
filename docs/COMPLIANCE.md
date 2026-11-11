# LeadPilot — Compliance and Data Policy

Status: Phase 5B enforcement, admin, and security hardening work in progress ·
Last updated: 2026-11-10

This document defines product rules. It is not legal advice; before launch, have counsel
review the policy against the jurisdictions you sell into (GDPR/UK GDPR, CAN-SPAM, PECR,
CCPA/CPRA, and local marketing laws). Engineering controls and residual risks are detailed
in `docs/SECURITY.md`.

## 1. Non-negotiable product rules

1. **No fabrication.** The platform must never generate a lead, email address, phone
   number, company name, employee count, or source citation that did not come from a
   configured provider or a user import.
2. **No scraping.** No crawling search results, social networks, directories, or websites
   to extract contact data. Only licensed APIs, contractual data providers, and
   user-supplied data with the user's confirmation of rights.
3. **No sending without approval.** Every external message requires an explicit human
   approval on the exact content. There is no autonomous cold outreach.
4. **No sensitive data.** Do not collect or infer special-category data (health, religion,
   ethnicity, political views, sexual orientation, precise location of individuals,
   biometric data) or data about minors. Lead records are business contacts only.
5. **Source visibility.** Source, source URL, retrieval date, and verification status are
   shown on leads and included in exports.
6. **Suppression is absolute.** A suppressed or unsubscribed address cannot be messaged
   through any path, including direct API calls and scheduled jobs.
7. **Revocable consent.** Unsubscribe works without login, is one click, and is honored
   immediately.
8. **Honest AI.** AI output is labeled as a draft, grounded in stored data, and never
   presented as verified fact. Low-confidence output is flagged, not hidden.

## 2. Lawful basis and data sources

| Source type | Allowed | Conditions |
|---|---|---|
| Licensed B2B data API | Yes | Contract permits lead generation/outreach; terms recorded in `LeadSource`; rate limits respected |
| Public company website (manual research) | Limited | User-initiated, public business information only; no bulk crawling; respect robots/ToS |
| User CSV import | Yes | User attests they have rights; import screen requires confirmation; provenance recorded |
| Purchased/scraped lists of unknown origin | No | Rejected |
| Social network scraping, browser extensions | No | Prohibited |
| Personal email guessing/permutation | No | Never implemented |

The customer is the data controller for their workspace; LeadPilot acts as processor for
customer-provided and provider-sourced lead data. The platform's own marketing list is
separate and requires its own consent and unsubscribe handling.

## 3. Data minimization and retention

- Collect only fields needed for B2B prospecting: business name, website, industry,
  region, company size, business contact name/title, business email/phone, LinkedIn
  company/profile URL where the provider supplies it.
- Do not collect home addresses, personal mobile numbers, government IDs, or free-text
  personal notes beyond what the customer types intentionally.
- Retention is a workspace setting: keep until deleted (default), or soft-delete leads after
  30, 90, 180, or 365 days without an update. Soft-deleted leads are permanently purged
  after a 30-day grace period. The worker runs cleanup after each queue batch; an admin can
  also run it manually from Settings. Suppression entries and audit records are retained for
  compliance rather than purged with a lead.
- Workspace deletion: the owner types the workspace name and re-enters their password. The
  workspace is soft-deleted immediately (access ends for every member and pending invites
  are revoked) and purged after 30 days. Deletion is refused while a live Razorpay
  subscription is attached so a customer cannot keep paying for an inaccessible workspace.
- Data export: an admin can download a versioned JSON bundle of workspace, member, lead,
  campaign, outreach, suppression, import, job, integration, and audit data. The export is
  audit-logged and rate-limited.
- Account-level deletion and ownership transfer are not implemented; workspaces must be
  deleted individually by their owner. Document the actual schedule and this limitation in
  the privacy policy.
- Backups inherit the same retention window.

## 4. Outreach requirements

Implemented in Phase 4B and enforced server-side:

- **Sender identity:** a workspace mailing address is required before approval, and the
  sender name/email are appended from the workspace profile. The app refuses to approve
  without an address rather than inventing one.
- **Unsubscribe:** every message includes a signed one-click link that works without login.
  The link is bound to one workspace/message/recipient; only its hash is stored. Confirming
  adds a suppression entry and is idempotent. The message also includes the sender identity
  and mailing address.
- **Approval:** a `MEMBER` drafts; `ADMIN`/`OWNER` approves under the default policy, or only
  the `OWNER` when the workspace selects owner-only approval. The policy is re-checked in the
  service layer at approval and send time. Approval is bound to a SHA-256 hash of the exact
  subject and body, so any later edit revokes it. There is no automatic send and no
  self-approval bypass.
- **Send caps:** plan-level daily send allowance plus a per-campaign daily cap; both are
  enforced atomically in the send path. Messages are refused if the campaign is not active.
- **Suppression:** workspace-scoped list with manual add, CSV import, search, and removal.
  Addresses are checked before drafting and again immediately before every send.
- **Failure handling:** provider failures leave the message approved, record the real
  reason, and release the reserved allowance. Successful sends store the provider message
  ID and audit entry.
- **Bounce/complaint handling:** a manually recorded hard bounce sets the message to
  `BOUNCED`, adds a workspace suppression entry with reason `BOUNCED`, and blocks future
  sends to that address. Complaint handling uses the suppression list; automatic ingestion
  from provider webhooks remains pending.
- **Outcome logging:** replies and meetings are recorded manually by a workspace member with
  an optional note. Each outcome writes lead activity and an audit entry. The product never
  infers a reply, meeting, or open from silence.
- **Analytics:** reply and meeting rates count only recorded sends and manual outcomes.
  Opens are explicitly reported as untracked because no email provider webhook is connected.
- **Verification:** field checks are human attestations by an admin with optional evidence.
  The overall lead status is derived from populated fields; provider data alone never marks
  a field verified.
- **Record-keeping:** who approved what content hash and when, to which address, the
  provider message ID, and linked lead activity/audit entries.
- No misleading subject lines, fake replies, or spoofed sender identities.
- The platform does not buy or sell lead data; customers export only data they are
  authorized to use.

## 5. AI-specific safeguards

- Prompts are server-side, versioned, and never accept instructions from lead content
  (prompt-injection mitigation: source text is treated as untrusted data, delimited, and
  summarized rather than executed).
- Structured output validation rejects unknown or unverified contact fields.
- Model calls log token usage and provider/model but not full personal data in logs.
- AI rationales must reference stored fields; if evidence is missing, the output says so.
- No model training on customer data without explicit opt-in (default: no training).
- Provider data-processing terms must be reviewed before enabling a model vendor.

## 6. Security and access

- Role-based access with workspace isolation; least privilege by default.
- MFA is on the post-MVP roadmap; strong password policy and session revocation now.
- Audit log covers logins, exports, deletions, approvals, sends, role changes, plan
  changes, integration changes, and superadmin access.
- Export requires an explicit action, is logged, and is rate-limited; exports include
  provenance so recipients can audit.
- Every sensitive action takes its limit from one reviewed policy matrix (signup, login,
  reset/change password, profile updates, onboarding, imports, exports, agent runs, outreach
  drafts/sends, invitations, billing checkout). The limiter fails closed on database errors,
  and browser-facing responses report the real retry window.
- Security headers apply to every route: origin-locked CSP, frame denial, `nosniff`,
  referrer and permissions policies, cross-origin isolation, and production-only HSTS.
  `docs/SECURITY.md` records the CSP's nonce-free trade-off and remaining risk.
- Worker calls require a constant-time secret check and stay disabled when the secret is
  unset. Razorpay events are HMAC-verified over the raw body and applied once.
- Passwords, sessions, reset/verification tokens, invitations, and unsubscribe tokens are
  stored only as hashes where the plaintext is not needed. No payment-instrument data is
  stored.
- Incident response: contain, assess, notify the workspace owner, and meet breach
  notification timelines where applicable.

### Billing and payment data

- Card and payment-instrument data never touches LeadPilot. Checkout happens on Razorpay's
  hosted payment page; the app stores only the provider subscription ID, customer ID,
  status, billing interval, and period dates.
- Plan changes are driven by signature-verified webhooks, not by redirects or client claims.
  The raw request body is HMAC-SHA256 verified before parsing, and each event is applied
  once via a unique `(provider, externalEventId)` record inside the same transaction as the
  subscription update and audit entry.
- Checkout is refused unless the API keys **and** webhook secret are configured, so the app
  cannot collect payment without a working activation path.
- Only the workspace `OWNER` can start checkout or cancel. Cancellation defaults to the end
  of the paid period; an immediate cancellation downgrades the workspace to Free. Both
  actions write audit entries.
- Razorpay is a subprocessor for billing. Its terms, data location, and retention must be
  added to the subprocessor list before launch.

### Platform switches and audit access

- Superadmins can pause public signups, CSV import, or outreach sending platform-wide. These
  are availability controls, not deletion: pausing sending leaves approved drafts intact and
  releases no allowance; pausing import does not touch existing leads or exports.
- Manual plan assignment is support-only and refused while a live Razorpay subscription is
  attached, so entitlement cannot silently diverge from what the customer is billed.
- Audit entries record the actor, action, entity, previous/next values for plan and switch
  changes, and request metadata. Superadmin audit search is read-only and scoped to
  platform administration; customer workspace content is not exposed beyond the fields
  needed to identify the event.

### Team invitations

- Invitations are scoped to one workspace and one email, are single-use, expire after seven
  days, and are stored only as token hashes. Pending invitations reserve a seat; revoking one
  releases it.
- Only the workspace owner can invite an admin, which prevents an admin from creating a peer
  who could later alter approvals or billing-adjacent settings.
- Accepting requires the signed-in email to match. A new teammate proves control of the
  invited address by holding the token; that sets the email as verified. No invitation can
  grant access to data in another workspace.
- Invite, revoke, and accept events are audit-logged with email and role. Workspace content
  is not included in the invitation email.

## 7. Customer-facing controls

- Suppression list: add/remove manually, import CSV, view reason/source/date
  (implemented at **Settings → Suppression**).
- Approval and send caps enforced server-side; campaign daily caps are configurable
  (implemented). Each workspace chooses admins-and-owners or owner-only approval, enforced in
  the service layer (implemented in Phase 5B slice 4).
- Team invitations and seat limits: admins invite by email, pending invites reserve seats,
  and only the owner can invite an admin (implemented in Phase 5B slice 2).
- Sender identity, mailing address, and unsubscribe footer (implemented; address required
  before approval).
- Billing is owner-only: the settings page shows the current provider status, interval, and
  renewal/end date, and explains when billing is unconfigured (implemented in Phase 5A).
- Data export and deletion: admins download a JSON DSAR bundle; the owner deletes the
  workspace with typed-name and password confirmation, subject to the 30-day purge and the
  live-subscription guard (implemented in Phase 5B slice 4). Account-level deletion remains
  pending.
- Integration disconnection immediately stops provider access.
- Clear in-product explanations of verification status and source limitations.

## 8. Prohibited use enforcement

Terms prohibit using LeadPilot for spam, harassment, deceptive outreach, or collecting
sensitive data. Product safeguards: approval gates, send caps, suppression, provider
allow-lists, audit logs, and account suspension for abuse. Reports of abuse are reviewed
by a superadmin and recorded.

## 9. Launch checklist

- [ ] Privacy policy, terms, DPA, and cookie notice published and linked in the app.
- [ ] Provider contracts reviewed; terms URLs recorded per source.
- [x] Suppression and unsubscribe tested end to end (Phase 4B).
- [x] Field verification and manual outcome analytics tested (Phase 4B continuation).
- [x] Razorpay billing adapter, signature verification, replay idempotency, and cancellation
      tested with injected provider stubs (Phase 5A).
- [x] Admin workspace plan assignment, platform feature switches, and audit search tested;
      assignment refuses live provider-managed subscriptions (Phase 5B slice 1).
- [x] Team invitations, seat reservation, revocation, expiry, wrong-email refusal, and
      invite registration tested (Phase 5B slice 2).
- [ ] Live Razorpay checkout, webhook delivery, and cancellation verified with real test
      credentials and provider plan IDs.
- [ ] Payment/webhook subprocessor entry and billing terms reviewed for launch.
- [ ] Email authentication configured (SPF, DKIM, DMARC) on the sending domain.
- [x] Retention settings, soft-delete/purge cleanup, DSAR export, and workspace deletion
      tested (Phase 5B slice 4). The worker must still be scheduled in production.
- [ ] Audit log coverage verified for all privileged actions, including external tamper
      evidence for regulated customers.
- [ ] Data processing register and subprocessor list maintained.
- [x] Rate-limit matrix, security headers, worker authentication, and CSP documented and
      tested, with the CSP residual risk recorded (Phase 5B slice 3).
- [ ] Security headers, HSTS, and rate limits verified against the production deployment
      behind a trusted proxy.
- [ ] Prisma 7 upgrade completed to clear the `deepmerge-ts` advisory.
- [ ] Support and abuse-report contact published.
