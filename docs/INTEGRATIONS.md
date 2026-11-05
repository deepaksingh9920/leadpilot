# LeadPilot — Integrations and Environment Reference

Status: Phase 4A implemented · Last updated: 2026-11-05

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
| Email delivery | Not implemented; verification/reset email is still pending |
| Outreach sending, approval, suppression | Not implemented by design |
| Stripe billing | Not implemented; Free plan is created internally |

`COMPETITOR_RESEARCH`, `EMAIL_OUTREACH`, and `FOLLOW_UP` have no executor in this build.
They remain disabled and are not advertised as runnable.

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

## 5. Email sending (not implemented)

Planned: Resend with a verified sending domain.

| Variable | Purpose |
|---|---|
| `EMAIL_PROVIDER` | `resend` (planned) |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Verified sender |
| `EMAIL_REPLY_TO` | Reply-to address |

No outreach email is sent in this build. Approval, suppression, unsubscribe, and send
limits remain future work. Account verification and password reset also depend on this
provider; until it is configured those emails cannot be delivered.

## 6. Billing (not implemented)

Stripe Checkout, Billing Portal, and webhooks are not exposed in this build. Plan records
and limits exist in the database and are created with the Free plan.

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Server key (test mode for staging) |
| `STRIPE_WEBHOOK_SECRET` | Endpoint signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client key |
| `STRIPE_PRICE_*` | Price IDs for paid plans |

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

Keys are read only in server modules; `NEXT_PUBLIC_` is reserved for the Stripe
publishable key.

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
8. Keep outreach sending disabled until approval, suppression, and unsubscribe are built.

## 12. Data handling notes

- Provider payloads are stored only as needed for provenance and display; full raw
  responses are not retained.
- API keys are never logged, rendered, or included in client bundles.
- Disconnecting a provider stops future calls; existing leads keep their provenance.
- Provider failures never write partial lead records. Discovery writes inside a single
  transaction and releases unused plan capacity.
- Qualification preserves statuses a person set (`CONTACTED`, `CONVERTED`) even when the
  model suggests a different stage.
