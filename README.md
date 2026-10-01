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
cp .env.example .env   # fill in DATABASE_URL at minimum
npm run db:migrate
npm run dev
```

Run the job-queue worker separately during development:

```bash
npm run worker
```

## Status

Scaffold only — data model, module boundaries, and the engagement
stage-machine pattern are in place; feature logic (proposal builder,
billing math, onboarding drafts, follow-up scheduling, portal
aggregation) is not yet implemented. See **Out of Scope for v1**
(PRD §16) before adding anything not in the lifecycle above.
