# LeadPilot — Compliance and Data Policy

Status: Phase 1 baseline · Last updated: 2026-10-29

This document defines product rules. It is not legal advice; before launch, have counsel
review the policy against the jurisdictions you sell into (GDPR/UK GDPR, CAN-SPAM, PECR,
CCPA/CPRA, and local marketing laws).

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
- Default retention: active workspace data retained while the account is active; deleted
  leads soft-deleted for 30 days then purged, except suppression hashes and audit records
  required for compliance.
- Account deletion: purge business data within 30 days, retain minimal billing/audit
  records as legally required, and document the schedule in the privacy policy.
- Backups inherit the same retention window.

## 4. Outreach requirements

- Sender identity: verified from name, physical address, and reply-to for the workspace.
- Every message includes a working unsubscribe link and a one-line reason for contact.
- Approval: `MEMBER` drafts; `ADMIN`/`OWNER` approves by default (workspace policy can
  allow self-approval only if the workspace enables it; never automatic).
- Send caps: plan-level daily cap plus a workspace cap; new workspaces start conservatively.
- Bounce/complaint handling: hard bounces and complaints are suppressed automatically when
  the email provider reports them.
- Record-keeping: who approved what content, when, to which address, and the provider
  message ID.
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
- Incident response: contain, assess, notify the workspace owner, and meet breach
  notification timelines where applicable.

## 7. Customer-facing controls

- Suppression list: add/remove manually, import CSV, view reason/source/date.
- Approval policy and send caps in workspace settings.
- Sender identity and unsubscribe footer configuration.
- Data export and deletion requests handled per plan and law.
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
- [ ] Suppression and unsubscribe tested end to end.
- [ ] Email authentication configured (SPF, DKIM, DMARC) on the sending domain.
- [ ] Retention and deletion jobs implemented and tested.
- [ ] Audit log coverage verified for all privileged actions.
- [ ] Data processing register and subprocessor list maintained.
- [ ] Security headers and rate limits verified in production.
- [ ] Support and abuse-report contact published.
