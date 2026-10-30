# LeadPilot — Integrations and Environment Reference

Status: Phase 1 proposal · Last updated: 2026-10-29

Real integrations are required. Provider-dependent features stay disabled until the
matching keys are configured; there is no production mock mode. Automated tests may use
isolated stubs, but those are never used to serve customer data.

## 1. Providers

### AI model (required for research, qualification rationale, drafts)

Recommended: an OpenAI-compatible chat completions API.

| Variable | Purpose |
|---|---|
| `AI_API_KEY` | Server-only key |
| `AI_BASE_URL` | API base, default `https://api.openai.com/v1` (supports compatible gateways) |
| `AI_MODEL` | Model identifier, set to a current model available to your account |
| `AI_TIMEOUT_MS` | Request timeout (default 30000) |
| `AI_MAX_OUTPUT_TOKENS` | Output cap per call (default 2000) |

Requirements: JSON/structured output support, no training on submitted data, and a data
processing agreement acceptable to your business. The adapter validates all output; a
model that cannot return valid JSON is treated as a failed dependency, not a source of
lead data.

### Lead data sources (required for discovery)

Pick one primary provider and add others only if the contracts allow it.

| Provider | Best for | Notes |
|---|---|---|
| Apollo.io API | B2B companies and business contacts | Paid API access; confirm plan and contractual permission for your outreach use; respect export and contact limits |
| People Data Labs | Company/person enrichment | Contract required; verify permissible use |
| Google Places API (New) | Local businesses (name, address, business phone, website) | No personal emails; strong for local-service ICPs; caching/display restrictions apply |
| Hunter.io | Email finding and verification | Use for verification and provider-returned addresses within contract |
| CSV import | Customer-owned or licensed lists | User must confirm rights; provenance recorded; no enrichment guessing |

| Variable | Purpose |
|---|---|
| `PRIMARY_LEAD_SOURCE` | `apollo`, `pdl`, `google_places`, or `csv` |
| `APOLLO_API_KEY` | Apollo API key (if selected) |
| `PDL_API_KEY` | People Data Labs key (if selected) |
| `GOOGLE_PLACES_API_KEY` | Places API key (if selected) |
| `HUNTER_API_KEY` | Email verification (optional) |

Rules enforced in code:
- Only adapters with a key and a recorded terms URL can run.
- Records are mapped to LeadPilot fields; unknown fields are dropped.
- Provider calls respect documented rate limits with backoff.
- Every stored lead keeps provider, provider record ID, source URL, retrieval time, and
  license note.
- Missing email/phone stays empty. The platform does not construct or guess them.

### Email sending (required for outreach)

Recommended: Resend with a verified sending domain. SMTP is supported as an alternative.

| Variable | Purpose |
|---|---|
| `EMAIL_PROVIDER` | `resend` or `smtp` |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Verified sender, e.g. `Acme Team <outreach@acme.com>` |
| `EMAIL_REPLY_TO` | Reply-to address |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | SMTP alternative |
| `OUTREACH_DAILY_CAP_DEFAULT` | Workspace default cap before plan limits apply |

Before enabling: SPF, DKIM, and DMARC on the domain; unsubscribe route tested; approval
gate and suppression checks verified.

### Billing (required for paid plans)

Stripe Checkout + Billing Portal + webhooks.

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Server key (test mode for staging) |
| `STRIPE_WEBHOOK_SECRET` | Endpoint signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client key |
| `STRIPE_PRICE_STARTER_MONTHLY` / `_YEARLY` | Price IDs |
| `STRIPE_PRICE_PROFESSIONAL_MONTHLY` / `_YEARLY` | Price IDs |
| `STRIPE_PRICE_AGENCY_MONTHLY` / `_YEARLY` | Price IDs |

Free requires no Stripe price. Prices and limits are stored in the database and can be
edited by a superadmin; Stripe price IDs map plans to billing.

### Monitoring (optional but recommended)

| Variable | Purpose |
|---|---|
| `SENTRY_DSN` | Server/client error reporting |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` |

## 2. Application and security variables

| Variable | Purpose |
|---|---|
| `APP_URL` | Canonical URL used in emails, OAuth callbacks, Stripe redirects |
| `DATABASE_URL` | SQLite locally; Postgres in staging/production |
| `AUTH_SECRET` | 32+ byte random value for session signing |
| `INTEGRATION_ENCRYPTION_KEY` | 32-byte base64 key for encrypting stored provider credentials |
| `WORKER_SECRET` | Bearer secret for internal worker calls |
| `CRON_SECRET` | Secret expected by `/api/jobs/tick` from the scheduler |
| `BOOTSTRAP_ADMIN_EMAIL` | Initial superadmin email (seed only) |
| `BOOTSTRAP_ADMIN_PASSWORD` | Initial password, change after first login (seed only) |

Generate secrets with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## 3. Environment files

- `.env.example` — committed, placeholders only.
- `.env.local` — real local values, never committed.
- Hosting environment — production values set in the provider dashboard, never in git.

The repository `.gitignore` will exclude `.env*.local`, `*.db`, and build output. Keys are
read only in server modules; `NEXT_PUBLIC_` is reserved for the Stripe publishable key.

## 4. Configuration status behavior

The Integrations page and `/api/health` report, per provider:

| State | UI | Server behavior |
|---|---|---|
| Not configured | "Connect" card with setup steps | Action returns `INTEGRATION_NOT_CONFIGURED` |
| Configured, unverified | "Configured — test connection" | Health check allowed; no billable bulk calls |
| Connected | Status + last checked + account label | Feature enabled subject to plan limits |
| Error | Error message without secrets | Retry/backoff; audit entry |

## 5. Setup sequence for Phase 4/5

1. Add keys to `.env.local` (never chat).
2. Restart the dev server.
3. Open Integrations, run "Test connection" for AI, lead source, and email.
4. Record the provider terms URL for the lead source.
5. Verify a send to your own address end to end, including unsubscribe.
6. Switch Stripe to test keys and run the upgrade/cancel/webhook checklist.
7. For production, repeat with live keys and a verified domain.

## 6. Data handling notes

- Provider payloads are stored only as needed for provenance and display; full raw
  responses are not retained unless required for audit.
- API keys are never logged, rendered, or included in client bundles.
- Disconnecting a provider stops future calls immediately and preserves existing
  provenance.
- Provider webhooks (billing, email events) are signature-verified and idempotent.
