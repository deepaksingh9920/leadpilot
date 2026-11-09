# LeadPilot — Integrations and Environment Reference

Status: Phase 5B enforcement and admin work in progress · Last updated: 2026-11-09

Real integrations are required. Provider-dependent features stay disabled until the
matching keys are configured; there is no production mock mode. Automated tests use
injected `fetch` stubs and a throwaway database, but those are never used to serve
customer data.

## 1. What is implemented

| Capability | Status |
|---|---|
| OpenAI-compatible AI adapter | Implemented for research and qualification |
| Apollo lead discovery | Implemented |
| People Data Labs lead discovery | Implemented |
| Google Places lead discovery | Implemented |
| CSV import with mapping and dedupe | Implemented (Phase 3) |
| Lead Finder / Company Research / Lead Qualification executors | Implemented |
| Email delivery (verification, reset, invitations, outreach) | Implemented through Resend; requires keys |
| Outreach drafting and approval gate | Implemented (Phase 4B) |
| Suppression list and public unsubscribe | Implemented (Phase 4B) |
| Campaign analytics and field verification | Implemented (Phase 4B): manual outcomes and human field checks; no provider webhook |
| Razorpay subscription billing | Implemented (Phase 5A): hosted checkout, signed/idempotent webhooks, cancel; disabled until keys and webhook secret exist |
| Platform feature switches | Implemented (Phase 5B): DB-backed signup, CSV-import, and outreach-send switches with audit |

`COMPETITOR_RESEARCH`, `EMAIL_OUTREACH`, and `FOLLOW_UP` have no executor in this build.
They remain disabled and are not advertised as runnable. Resend webhooks are also not
connected, so opens and replies are never ingested automatically; outcomes are logged
manually and analytics report opens as untracked.

## 2. AI model (required for research and qualification)

Recommended: any OpenAI-compatible chat completions API.

| Variable | Purpose |
|---|---|
| `AI_API_KEY` | Server-only key |
| `AI_BASE_URL` | API base, default `https://api.openai.com/v1` (supports compatible gateways) |
| `AI_MODEL` | Model identifier available to your account |
| `AI_TIMEOUT_MS` | Request timeout (default 30000) |
| `AI_MAX_OUTPUT_TOKENS` | Output cap per call (default 2000) |

The adapter sends `POST {AI_BASE_URL}/chat/completions` with
`response_format: { type: "json_object" }`. Every response is validated against the
agent's zod schema. Truncated JSON, non-JSON content, and schema mismatches are treated
as retryable dependency failures; they never become lead data. Prompts include only the
workspace record already stored, and instruct the model not to invent contacts, sources,
or facts.

## 3. Lead data sources (required for discovery)

`PRIMARY_LEAD_SOURCE` chooses the active adapter:

- When it names `apollo`, `pdl`, or `google_places`, that provider is used and must have
  its matching key set.
- When it is blank or `csv`, exactly one configured API key is used automatically.
- When multiple API keys are configured and no provider is named, selection fails closed
  with an ambiguity error instead of guessing.
- An unsupported value fails with a configuration error.
- CSV import is always available and never depends on these variables.

| Provider | Best for | Implemented call | Notes |
|---|---|---|---|
| Apollo.io API | B2B companies and business contacts | `POST /mixed_people/api_search` | The workspace operator must confirm its plan permits prospecting use |
| People Data Labs | Company/person enrichment | `POST /company/search` | Company search only; no contact data is implied |
| Google Places API (New) | Local businesses | `POST /places:searchText` | Business listings only; no personal emails; caching/display terms apply |

| Variable | Purpose |
|---|---|
| `PRIMARY_LEAD_SOURCE` | `apollo`, `pdl`, `google_places`, `csv`, or blank |
| `APOLLO_API_KEY` | Apollo API key (if selected) |
| `APOLLO_API_BASE_URL` | Apollo API base (default `https://api.apollo.io/v1`) |
| `PDL_API_KEY` | People Data Labs key (if selected) |
| `PDL_API_BASE_URL` | PDL API base (default `https://api.peopledatalabs.com/v5`) |
| `GOOGLE_PLACES_API_KEY` | Places API key (if selected) |
| `GOOGLE_PLACES_API_BASE_URL` | Places base (default `https://places.googleapis.com/v1`) |
| `APOLLO_TERMS_URL`, `PDL_TERMS_URL`, `GOOGLE_PLACES_TERMS_URL` | Optional terms overrides stored with sourced leads |

Rules enforced in code:

- Adapters keep only fields the provider actually returned. Missing email or phone stays
  empty; nothing is derived from a name, domain, or pattern.
- A record is usable only when it has both a company name and a provider record ID.
  Unattributable rows are skipped and counted in the run result.
- Every stored lead keeps the provider, provider record ID, source URL, retrieval time,
  dedupe key, and license note. The source row also records the terms URL.
- Apollo records are deduped by normalized email, then domain, then company+location.
- PDL uses company search, so contact fields are intentionally empty.
- Google Places skips permanently and temporarily closed listings and never produces an
  email address.
- Provider calls have timeouts and classify auth, rate-limit, upstream, and invalid
  response failures. Retry/backoff belongs to the job queue, not the adapter.

## 4. CSV import

CSV import is available now from **Lead management → Import**. The client previews the
mapping, and the server re-parses and re-validates the uploaded file before writing.
Duplicates are detected with the same dedupe key used by API sources. The importer
requires the user to confirm they have the right to use the data and records provenance.

## 5. Email sending and outreach

Resend with a verified sending domain is the implemented adapter. It powers account
verification, password reset, and approval-gated outreach.

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key (server only) |
| `EMAIL_FROM` | Verified sender, e.g. `LeadPilot <outreach@yourdomain.com>` |
| `EMAIL_REPLY_TO` | Optional default reply-to; outreach prefers the workspace sender email |
| `EMAIL_TIMEOUT_MS` | Request timeout (default 15000) |

When the provider is not configured, the UI says delivery is unavailable. Account email
cannot be sent, and outreach messages remain `APPROVED` with a `NOT_CONFIGURED` result;
nothing is simulated.

### Outreach safety rules enforced in code

- Drafts use only stored workspace and lead facts (deterministic template), optionally
  polished by the configured AI model; prompts forbid inventing contacts, facts, or sources.
- Approval requires an admin/owner, a workspace mailing address, and a valid recipient.
  Approval stores a SHA-256 hash of subject + body. Editing the content clears it.
- A send re-checks the approval hash, active campaign status, campaign daily cap, plan
  daily send allowance, and the suppression list before calling Resend.
- Messages append the workspace mailing address and a signed one-click unsubscribe link.
  The token is an HMAC-signed payload bound to workspace, message, and recipient; only
  `sha256(token)` is stored on the message.
- Provider failures restore `APPROVED`, record the honest reason, and release the reserved
  send allowance. Successful sends store the provider message ID, timestamp, and audit row.
- Suppression is workspace-scoped and is checked before a draft is created and again at
  send time. Hard bounces, complaints, and unsubscribes can be recorded through the
  suppression list, CSV import, or the public unsubscribe page.

Public unsubscribe URL shape: `{APP_URL}/unsubscribe/{token}`. The page requires no login,
shows a masked address, and is idempotent.

## 6. Billing (Razorpay)

Razorpay subscriptions are implemented behind `BILLING_PROVIDER`. Checkout is refused until
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` are all set, so the
app cannot take a payment it has no way to activate. The workspace owner starts checkout on
**Settings → Plan and usage**; the API creates the subscription server-side and redirects to
Razorpay's hosted `short_url`. No client checkout script and no publishable key are used.

| Variable | Purpose |
|---|---|
| `BILLING_PROVIDER` | `razorpay` (default). Other values leave billing unconfigured |
| `RAZORPAY_KEY_ID` | Server API key ID (test mode for staging) |
| `RAZORPAY_KEY_SECRET` | Server API key secret |
| `RAZORPAY_WEBHOOK_SECRET` | Secret used to verify `X-Razorpay-Signature` |
| `RAZORPAY_API_BASE_URL` | API base, default `https://api.razorpay.com/v1` |

Setup:
1. Create monthly and yearly subscription plans in the Razorpay dashboard and note each
   `plan_id`.
2. Paste them into **Admin → Plans and limits** for the matching plan and interval. Each
   provider plan ID can map to only one local plan/interval.
3. Add the three secrets to `.env.local` and restart.
4. Register `POST {APP_URL}/api/billing/razorpay` for the subscription events you need
   (`subscription.activated`, `charged`, `pending`, `halted`, `paused`, `resumed`,
   `cancelled`, `completed`).
5. Run a test-mode checkout. Payment alone does not change the plan; confirm the webhook
   activates it in **Settings** and that the audit log records the event.

Webhook behavior: the raw body is verified with HMAC-SHA256 and compared in constant time.
Events are inserted into `WebhookEvent` with a unique `(provider, externalEventId)`, and the
subscription update plus audit write happen in the same transaction, so replays are
acknowledged without re-applying. `subscription.cancelled` downgrades the workspace to Free
unless the provider reports cancellation at cycle end with a future period end, in which
case the paid plan stays active until that date. Cancellation from the app sends
`cancel_at_cycle_end` by default; choosing immediate cancellation downgrades locally to
Free. Missing provider notes are resolved through `PlanProviderPrice` by external `plan_id`.

Live verification is still pending because this checkout has no real Razorpay test keys or
webhook secret. The adapter, webhook route, and integration tests use injected `fetch`
stubs; nothing is simulated in the running app.

## 6a. Platform switches

`signups`, `csv_import`, and `outreach_sending` are database-backed switches in
**Admin → Feature flags**, not environment variables. They default to enabled and change
runtime behavior immediately: signup is refused, CSV import returns `DISABLED`, and approved
outreach returns `DISABLED` before the email provider is called. Pausing sending does not
delete drafts, revoke approvals, or consume the daily allowance. Every change is
audit-logged. Use these for incidents or abuse response without redeploying; they are not a
substitute for per-workspace limits or provider credentials.

## 6b. Team invitation email

Invitations are sent through the same Resend adapter as verification and reset mail. Links
use `{APP_URL}/invite/{token}` and expire after seven days. When `RESEND_API_KEY` or
`EMAIL_FROM` is absent, the invitation is still created and audit-logged, and the settings
page shows the inviter a copyable link plus a warning that no email was sent. There is no
separate invitation provider or webhook.

## 7. Monitoring (optional)

| Variable | Purpose |
|---|---|
| `SENTRY_DSN` | Server/client error reporting |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` |

## 8. Application and security variables

| Variable | Purpose |
|---|---|
| `APP_URL` | Canonical URL used in emails and redirects |
| `DATABASE_URL` | SQLite locally; Postgres in staging/production |
| `AUTH_SECRET` | 32+ byte random value for session signing |
| `INTEGRATION_ENCRYPTION_KEY` | 32-byte base64 key for encrypting stored provider credentials |
| `WORKER_SECRET` | Bearer secret for internal worker calls |
| `CRON_SECRET` | Secret expected by the scheduler endpoint |
| `AGENT_RUNTIME_READY` | Operator switch; execution stays off unless it is exactly `true` |
| `BOOTSTRAP_ADMIN_EMAIL` | Initial superadmin email (seed only) |
| `BOOTSTRAP_ADMIN_PASSWORD` | Initial password, change after first login (seed only) |

Generate secrets with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## 9. Environment files

- `.env.example` — committed, placeholders only.
- `.env.local` — real local values, never committed.
- Hosting environment — production values set in the provider dashboard, never in git.

Keys are read only in server modules. No `NEXT_PUBLIC_` provider key is required: Razorpay
checkout uses a server-created hosted link and Resend is server-only.

## 10. Configuration status behavior

The Integrations page reports the active lead source and each provider's actual state:

| State | UI | Server behavior |
|---|---|---|
| Not configured | "Not configured" badge and required variable names | Agent runs that need it return a provider error |
| Configured but not selected | "Configured" badge, no "Active" badge | Calls are not made for discovery |
| Active | "Configured" + "Active" | Lead Finder may call it when execution is enabled |
| Ambiguous or invalid | Warning with the selection error | Discovery fails closed |

## 11. Setup sequence

1. Add keys to `.env.local` (never paste them into chat).
2. Set `PRIMARY_LEAD_SOURCE` if more than one lead-source key is present.
3. Restart the dev server so the environment is re-read.
4. Open Integrations and confirm the active source and provider states.
5. Before enabling execution, confirm the provider terms permit your prospecting use.
6. Set `AGENT_RUNTIME_READY=true` only when both the AI provider and lead source are ready.
7. Queue a Lead Finder run with a small limit, then inspect the run steps and stored leads.
8. Add `RESEND_API_KEY` and `EMAIL_FROM` for account email and outreach delivery, and save a
   workspace mailing address in **Settings**.
9. Generate an outreach draft, inspect the exact preview, approve it, then send with a small
   campaign daily cap and confirm the Resend response and unsubscribe link.
10. Import any existing do-not-contact addresses into **Settings → Suppression** before
    sending.
11. Add the Razorpay keys and webhook secret, map each paid plan's monthly/yearly
    `plan_id` in **Admin**, then run a test-mode checkout and confirm the webhook
    activation in **Settings** and the audit log.

## 12. Data handling notes

- Provider payloads are stored only as needed for provenance and display; full raw
  responses are not retained.
- API keys are never logged, rendered, or included in client bundles.
- Disconnecting a provider stops future calls; existing leads keep their provenance.
- Provider failures never write partial lead records. Discovery writes inside a single
  transaction and releases unused plan capacity.
- Qualification preserves statuses a person set (`CONTACTED`, `CONVERTED`) even when the
  model suggests a different stage.
- Outreach stores only the SHA-256 hash of each unsubscribe token, never the token itself.
  Suppression entries keep the normalized address, reason, source, and timestamp.
- Message bodies, approval hashes, approver ID, provider message ID, and failure reasons are
  retained for the audit trail. Nothing is sent when the provider is unconfigured.
