# Client Lifecycle Platform

Multi-tenant SaaS platform that runs a service business's entire client
lifecycle — lead capture, proposal, e-signature, deposit invoicing,
India-compliant payment collection, AI-generated onboarding, access
requests, kickoff, a shared client portal, automated follow-ups, and
feedback/handover — as one connected pipeline.

Full specs: [`System Design.md`](./System%20Design.md) and
[`PRD & Features.md`](./PRD%20&%20Features.md). This README is a map of
how the code maps to those docs, not a replacement for them.

## Stack (locked, System Design §7)

Next.js (App Router) + TypeScript · Node (same project, Route Handlers) ·
PostgreSQL + Prisma · pg-boss (Postgres-backed job queue, no Redis) ·
Razorpay · OTP-based e-sign (custom) · provider-agnostic AI Gateway ·
WhatsApp Business API + email · S3-compatible storage.

## Structure

```
prisma/schema.prisma        Full data model (System Design §3) — every
                             table scoped to tenant_id.

src/lib/
  db.ts                      Prisma client singleton.
  tenant.ts                  withTenant() — the mandatory tenant-isolation
                             guard (System Design §4). Every service
                             function must route through this.
  auth.ts                    Session -> TenantContext resolution.
  ai-gateway/                The ONE module allowed to import an AI
                             provider SDK (System Design §5). generate()
                             retries once, falls back to a static template
                             on repeated failure, and always returns a
                             draft — callers persist it with status:"draft".
  queue/                     pg-boss setup + job names (System Design §2,
                             §6) and the standalone worker entry point.
  integrations/               Razorpay, WhatsApp, email — each the single
                             place that vendor's SDK is imported.

src/services/<context>/     One folder per bounded context from System
                             Design §2's service table (engagement,
                             proposal, billing, onboarding, kickoff,
                             portal, followup, feedback). Not separate
                             deployables — module boundaries so a future
                             split is a refactor, not a rewrite.
                             `engagement/index.ts` is the reference
                             pattern: TenantContext first arg, withTenant()
                             for every query, stage transitions centralized
                             so the "no silent auto-advance" rule
                             (§3.1) stays enforceable in one place.

src/app/
  (owner)/                   Owner-side app: dashboard, engagements,
                             settings (PRD §15).
  portal/[engagementId]/     Client-facing portal, no login (PRD §13).
  api/webhooks/razorpay/     Idempotent, signature-verified payment
                             webhook — the only path that marks an
                             invoice paid (System Design §3.1, §7).
  api/public-lead-form/      Per-tenant embeddable lead-capture form
                             (PRD §3).
```

## Binding design rules (do not drift from these — System Design §1)

1. **Multi-tenant from day one.** No "single business" shortcut, anywhere.
2. **One pipeline.** `Engagement.stage` (System Design §3.1) is the single
   state machine; the portal and follow-up engine both just read it.
3. **AI drafts, humans approve.** No AI output is ever auto-sent.
4. **Provider-agnostic AI.** Only `src/lib/ai-gateway` imports a vendor SDK.
5. **No raw credential storage.** "Request for Access" generates
   instructions/invite steps — never a password vault.
6. **India-compliant by default, currency-flexible.** GST/UPI/INR
   first-class; every amount also supports a second currency.
7. **Revenue path (lead → payment) to production quality first;**
   onboarding → handover can ship narrower, but the data model for all of
   it already exists in `prisma/schema.prisma`.
8. **Boring technology.** No microservices, no Kubernetes, no bleeding-edge
   framework.

## Getting started

```bash
npm install
npx playwright install chromium      # one-time, for the e2e test layer
docker compose up -d postgres        # local dev database
cp .env.example .env                 # fill in DATABASE_URL at minimum
npm run db:migrate
npm run dev
```

Run the job-queue worker separately during development:

```bash
npm run worker
```

## Testing

Every iteration's acceptance criteria get a test as part of being "done,"
not as a follow-up — this section is the standing contract for that.

**Layers:**

| Layer | Tool | Scope | Status |
| --- | --- | --- | --- |
| Unit | Vitest (`tests/unit/`) | Pure functions with no DB/network — money math (`src/services/proposal`'s `toMinorUnits`/`lineTotalMinor`/`computeTotals`), the `Engagement.stage` transition map, anything else that doesn't need I/O to prove correct. | Active |
| Integration | Vitest (`tests/integration/`) | Service-layer functions (`src/services/**`) against a real Postgres (`docker-compose`'s `postgres-test`, port 55433) — tenant isolation, state-machine guards, dedup logic, the full draft -> send -> decline -> re-version lifecycle. Razorpay is mocked at the integration-module boundary (`vi.mock("@/lib/integrations/razorpay")`, see `tests/integration/payments.test.ts`). Anthropic/email/WhatsApp are **not** mocked — they're called for real, but every call site already falls back gracefully (dev-mode `console.log`) when the provider key is unset or the call fails, so the suite passes with no secrets configured; a provider call occasionally logs a caught error to stderr mid-run, which is expected, not a failure. | Active |
| End-to-end | Playwright (`tests/e2e/`) | Real browser against the real dev server and dev DB, for flows the Vitest layers can't reach — third-party UI we don't control (Razorpay's hosted Checkout.js) and genuine multi-step client-side JS. Specs seed their own data directly via the service layer (`tests/e2e/seed.ts`) and clean up after themselves. Kept to a handful of high-value golden paths, not broad coverage — that stays at the integration layer. `payment.spec.ts` drives Razorpay's real hosted Checkout and is occasionally flaky on UI timing (third-party iframe, not our code) — rerun once before assuming a regression. | Active |
| CI | GitHub Actions (`.github/workflows/ci.yml`) | Runs unit + integration (`npm test`) and `tsc --noEmit` on every push/PR to `main`, against a Postgres service container. e2e is **not** run in CI — it needs real credentials and a running dev server; stays local-only (`npm run test:e2e`). | Active |

**Running tests:**

```bash
docker compose up -d postgres-test   # one-time per machine restart
npm test                             # runs the full unit + integration suite once
npm run test:watch                   # watch mode while iterating

docker compose up -d postgres        # e2e needs the real dev DB running
npm run dev                          # and the real dev server, in another terminal
npm run test:e2e                     # drives a real headless browser against it
```

`tests/setup/global-setup.ts` applies every Prisma migration to the test
database once per run; `tests/setup/reset-db.ts` truncates every app table
before each test for isolation. Test files run serially
(`fileParallelism: false` in `vitest.config.ts`) because they share that one
physical database — parallel files would truncate out from under each other.

**Conventions:**

- New service-layer logic gets an integration test in the matching
  `tests/integration/<service>.test.ts` file; use `tests/helpers/factories.ts`
  to seed a tenant/client/engagement rather than hand-rolling Prisma calls
  in each test.
- Pure, DB-free logic worth isolating (currency math, state machines, parsers)
  gets exported from its module specifically so a unit test can hit it
  directly — see the `// Exported for ... unit testing` comments in
  `src/services/proposal/index.ts` and `src/services/engagement/index.ts`
  for the pattern.
- An acceptance criterion from the PRD gets a test named after it in plain
  English (see existing `it(...)` descriptions) — a failing test should read
  like the broken promise, not like an assertion dump.
- **When a UI feature's own pages are the thing worth testing** (not just
  the service call behind them) — especially third-party UI we don't
  control, like Razorpay Checkout — add a spec under `tests/e2e/`. Keep e2e
  specs few and high-value (golden-path flows a real client/owner takes);
  they're slower and more selector-fragile than the Vitest layers, so the
  bulk of coverage should stay at the integration layer. `tests/e2e/payment.spec.ts`
  is the reference pattern, including hard-won notes on Razorpay's test-mode
  quirks (iframe-scoped locators, which test card/OTP values actually work,
  dismissing the "save card" dialogs) so the next spec doesn't have to
  rediscover them.

## Status

Scaffold only — data model, module boundaries, and the engagement
stage-machine pattern are in place; feature logic (proposal builder,
billing math, onboarding drafts, follow-up scheduling, portal
aggregation) is not yet implemented. See **Out of Scope for v1**
(PRD §16) before adding anything not in the lifecycle above.
