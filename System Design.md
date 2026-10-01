# Client Lifecycle Platform — System Design

Oct 2, 2026 · @Abishek

System design for an AI-powered, multi-tenant platform that carries a service business's client from first proposal through payment, onboarding, kickoff, and handover.

## 1. Overview & Design Principles

**What this is.** A multi-tenant SaaS platform that runs a service business's entire client lifecycle — lead capture, proposal, e-signature, deposit invoicing, India-compliant payment collection, AI-generated onboarding, access requests, kickoff, a shared client portal, automated follow-ups, and feedback/handover — as one connected pipeline instead of 5–8 disconnected tools.

**Who it's for.** v1 is built for the founder's own agency/consulting work first (dogfooding), then sold to Indian and emerging-market agencies, consultants, and freelancers who serve global clients. Every design decision below is made for a 1–10 person service business, not an enterprise buyer.

**Design principles (binding on every feature below):**

1. **Multi-tenant from day one.** Every table is scoped to a `tenant_id`. There is no "single business" shortcut anywhere in the schema or auth layer, even though the first tenant is the founder's own business. Retrofitting multi-tenancy later is the single most expensive mistake this system can make, so it is a hard constraint, not an optimization.
2. **One pipeline, not modules bolted together.** Lead → Proposal → Contract → Payment → Onboarding → Kickoff → Delivery → Handover is one state machine on one `Client Engagement` entity (defined in §3), not separate apps that sync. The client portal and the follow-up engine both read from this single source of truth.
3. **AI drafts, humans approve.** Every AI-generated artifact (proposal copy, welcome doc, onboarding questions, kickoff agenda, follow-up messages) is created as a **draft** the agency owner reviews and sends — never auto-sent to a client without a human in the loop in v1. This avoids reputational risk from a bad AI draft reaching a client unreviewed.
4. **Provider-agnostic AI layer.** No feature calls an AI vendor's SDK directly. Every AI call goes through one internal interface (§5) so the underlying model can change without touching feature code.
5. **No raw credential storage.** The platform never stores or transmits a client's actual passwords. "Request for Access" (§8) generates scoped, time-boxed instructions and invite links — it is a workflow tool, not a password vault. This is a hard legal/security boundary, not a v2 nice-to-have.
6. **India-compliant by default, currency-flexible.** GST handling, UPI, and INR are first-class, but every amount field supports a second currency (e.g. USD) for cross-border clients, because the target user bills both domestic and international clients (§6).
7. **Build the revenue path to production quality first.** Lead capture through payment collection (§9–§13) is what lets the founder invoice a real client on day one and must have no placeholder logic. Onboarding through handover (§14–§19) can ship with a narrower feature set initially, but the data model for all of it is designed now (§3) so nothing is re-architected later.
8. **Boring technology.** Next.js + Node + PostgreSQL, Razorpay, OTP e-sign. No microservices, no Kubernetes, no bleeding-edge framework for a pre-revenue solo-built product — see §7 for the full stack rationale.

## 2. Architecture

**Component flow (request path, left to right):**

```
Browser (Next.js App Router)
  |
  v
API Layer (Next.js Route Handlers / Node)
  |--> Auth & Tenant Context (session -> tenant_id on every request)
  |--> Domain Services (one module per bounded context, see table)
  |--> Job Queue (Postgres-backed, for async/scheduled work)
  |
  v
PostgreSQL (single database, every table has tenant_id)

External integrations (called FROM Domain Services, never directly from the browser):
  Razorpay (payments, GST invoices) | OTP/SMS provider (e-sign, access-request notices)
  WhatsApp Business API / Email (SendGrid or similar) | AI Provider (behind the AI Gateway, §5)
  Calendar (kickoff scheduling: ICS generation v1, Google/Outlook OAuth v2)
```

**Bounded-context services** (each owns its own tables and exposes functions to the API layer — not separate deployables in v1, just clear module boundaries so they *could* be split later):

| Service | Owns | Talks to |
| --- | --- | --- |
| Engagement Service | `Client`, `Engagement` (the lifecycle state machine, §3) | Every other service reads engagement state from here |
| Proposal Service | `Proposal`, `ProposalLineItem`, `EsignEvent` | OTP provider, AI Gateway (draft generation) |
| Billing Service | `Invoice`, `Payment`, `TaxLine` | Razorpay, AI Gateway (none — billing math is deterministic, not AI-generated) |
| Onboarding Service | `WelcomeDoc`, `IntakeForm`, `IntakeResponse`, `AccessRequest` | AI Gateway, WhatsApp/Email |
| Kickoff Service | `KickoffCall`, `CallSummary`, `ActionItem` | AI Gateway, Calendar |
| Portal Service | Read-only aggregation across all of the above, scoped to one `Engagement`, for the client-facing portal view | Nothing external — pure read aggregation |
| Follow-up Engine | `FollowUpTask`, `FollowUpRule` | Job Queue, WhatsApp/Email, AI Gateway (message drafting) |
| Feedback Service | `FeedbackRequest`, `FeedbackResponse`, `HandoverPacket` | AI Gateway (handover summary drafting) |

**Why one database, one deployable (v1):** a solo-built MVP does not need microservices — it needs low operational overhead and fast iteration. Module boundaries above exist so the code stays organized and a future split (e.g. pulling the Follow-up Engine into its own worker process) is a refactor, not a rewrite. See §7 for the concrete stack and hosting choice.

**The Job Queue is load-bearing.** Every scheduled or async action — a follow-up nudge, an AI draft generation, a WhatsApp send, a webhook retry from Razorpay — goes through one Postgres-backed queue table (`v1`: a library such as `pg-boss` or a hand-rolled polling worker; no Redis/separate infra for v1). This is what makes §6's follow-up engine and §13's AI drafting reliable without a human watching them fire.

## 3. Data Model

Every table below carries `tenant_id` (the agency/business using the platform) even where not written out. `Engagement` is the spine every other entity hangs off — it is the one state machine described in §1's principle 2.

**Core entities**

| Entity | Key fields | Belongs to |
| --- | --- | --- |
| `Tenant` | id, business\_name, gst\_number (nullable), default\_currency, razorpay\_account\_id | — (root) |
| `User` | id, tenant\_id, name, email, role (owner/team\_member), phone | Tenant |
| `Client` | id, tenant\_id, name, company, email, phone, country, preferred\_currency | Tenant |
| `Lead` | id, tenant\_id, client\_id (nullable until converted), source, status (new/contacted/qualified/lost), notes | Tenant, Client |
| `Engagement` | id, tenant\_id, client\_id, lead\_id (nullable), **stage** (enum, §3.1), currency, created\_at | Tenant, Client, Lead |
| `Proposal` | id, engagement\_id, version, status (draft/sent/viewed/accepted/declined), valid\_until, pdf\_url | Engagement |
| `ProposalLineItem` | id, proposal\_id, description, qty, unit\_price, currency | Proposal |
| `EsignEvent` | id, proposal\_id, signer\_name, signer\_phone, otp\_verified\_at, ip\_address, signed\_pdf\_url | Proposal |
| `Invoice` | id, engagement\_id, type (deposit/milestone/final), amount, currency, gst\_applicable (bool), gst\_breakup (jsonb), status (draft/sent/paid/overdue), due\_date | Engagement |
| `Payment` | id, invoice\_id, razorpay\_payment\_id, amount, method (upi/card/netbanking), paid\_at | Invoice |
| `WelcomeDoc` | id, engagement\_id, content (generated), status (draft/sent), sent\_at | Engagement |
| `IntakeForm` | id, engagement\_id, questions (jsonb, AI-generated from scope), status | Engagement |
| `IntakeResponse` | id, intake\_form\_id, answers (jsonb), submitted\_at | IntakeForm |
| `AccessRequest` | id, engagement\_id, platform (e.g. "Google Analytics"), instructions (generated), status (requested/granted/na), requested\_at, granted\_at | Engagement |
| `KickoffCall` | id, engagement\_id, scheduled\_at, agenda (generated), recording\_url (nullable), status | Engagement |
| `CallSummary` | id, kickoff\_call\_id, summary\_text (AI-generated), action\_items (jsonb) | KickoffCall |
| `FollowUpTask` | id, engagement\_id, target\_type (proposal/invoice/intake\_form/access\_request), target\_id, trigger\_rule, next\_run\_at, attempts, status (pending/sent/stopped) | Engagement |
| `FeedbackRequest` | id, engagement\_id, sent\_at, response\_id (nullable) | Engagement |
| `FeedbackResponse` | id, feedback\_request\_id, rating, comments | FeedbackRequest |
| `HandoverPacket` | id, engagement\_id, deliverables (jsonb), summary (AI-generated), sent\_at | Engagement |

**3.1 — `Engagement.stage` (the state machine, drives the portal and the follow-up engine):**

`lead` → `proposal_sent` → `proposal_accepted` → `deposit_invoiced` → `deposit_paid` → `onboarding` → `kickoff_scheduled` → `kickoff_done` → `in_delivery` → `feedback_requested` → `handed_over` → `closed`

A stage only moves forward automatically when its triggering event fires (e.g. `deposit_invoiced` → `deposit_paid` only on a confirmed Razorpay webhook, never on a manual click, to avoid a false "paid" state). An agency owner can manually advance or revert a stage, logged with a reason — real engagements don't always move linearly, and the tool must not fight the owner's judgment call.

## 4. Multi-tenancy & Security

**Tenant isolation.** Every query is scoped by `tenant_id` at the data-access layer, not left to each API handler to remember. In practice: a single shared ORM query helper (e.g. a `withTenant(tenantId)` wrapper) that every service function is required to use — a code-review rule and a lint check, not just a convention, since one missed filter is a cross-tenant data leak. Row-Level Security (RLS) in PostgreSQL is enabled as a second line of defense once there are real paying tenants beyond the founder's own business.

**Auth.** Email + OTP login for v1 (matches the OTP e-sign pattern already needed for §5, so it's one mechanism reused, not two). Session carries `tenant_id` and `role` (owner / team\_member). Team members (future) see only their assigned engagements; owners see everything in their tenant.

**Request for Access — the hard security boundary.** The platform **never stores or transmits a client's actual login credentials.** "Request for Access" (§8) works two ways, in order of preference:

1. **Invite-based** (preferred): where the platform the agency needs access to supports it (Google Analytics, Google Ads, Meta Business Suite, most CMSs), generate the exact "add user" steps for that platform and a copy-paste email/WhatsApp message asking the client to add the agency's own account as a user. No credential ever changes hands.
2. **Instruction-only** (fallback): for platforms with no invite flow (e.g. a domain registrar), generate clear written instructions for what the client needs to do or share, and log the request's status (requested/granted) — the platform tracks that access was asked for and received, it does not become a password vault. If a client insists on sharing a password directly, that exchange happens outside the platform (their own email/WhatsApp) and is never logged or stored here.

This is a hard product boundary, not a v1-vs-v2 tradeoff — storing client credentials turns a client-ops tool into a breach liability, and small agencies cannot absorb that risk.

**E-sign legal validity.** OTP-based e-sign (phone OTP + IP address + timestamp recorded against the signed PDF) is the v1 approach — it is what ClearWork and similar India-first tools use, and is broadly treated as consent evidence under India's IT Act, 2000. It is **not** Aadhaar e-sign (which requires a licensed e-signature provider such as Digio or Leegality and carries stronger legal weight for high-value contracts). The PRD (§4) flags Aadhaar e-sign as a clearly-scoped v2 upgrade path, not something to half-build now.

**Payment & GST compliance.** Razorpay handles PCI-DSS compliance for card data — the platform never touches raw card numbers. GST invoices are generated with correct CGST/SGST/IGST splits based on the client's state (intra-state vs inter-state) and the tenant's GST registration status; `Tenant.gst_number` is nullable because many target users sit under the ₹20L threshold and GST should be an optional toggle per §1's principle 6, never a forced field.

**Data residency.** Hosting defaults to an India-region deployment where the chosen platform supports it (§7), since most tenants and their data (client PII, GST records) are India-based; this is a preference for v1, not a hard legal requirement unless confirmed otherwise by counsel.

## 5. AI Abstraction Layer

**Why provider-agnostic.** Model quality and pricing shift fast; the product should not be rewritten every time a better or cheaper model appears. Every AI-touching feature in this PRD calls ONE internal interface, never a vendor SDK directly.

**The interface (conceptual, language-agnostic):**

```
AIGateway.generate({
  task: "proposal_draft" | "welcome_doc" | "intake_questions" |
        "access_instructions" | "kickoff_agenda" | "call_summary" |
        "followup_message" | "handover_summary",
  tenantId, engagementId,
  context: { ...task-specific structured input, never raw free text alone },
  outputSchema: <JSON schema the response must match>
})
-> { draft: string | structuredObject, modelUsed, tokensUsed, costEstimate }
```

**Implementation rule:** `AIGateway` is the ONLY module that imports an AI provider's SDK. Swapping Claude for GPT (or adding a second provider for a specific task) means changing one adapter file, never touching Proposal Service, Onboarding Service, etc.

**Structured output over free text.** Every `task` above defines a strict output schema (e.g. the kickoff agenda is `{sections: [{title, durationMinutes, talkingPoints: []}]}`, not a blob of prose) so the UI can render it predictably and an agent building this can validate the AI's output against the schema rather than parsing free text.

**Per-task prompt templates live in config, not scattered in code** — one prompt-template file per `task`, versioned, so prompt quality can be iterated without a code deploy for that alone (still deployed as code in v1 — the point is organizational separation, not a live-editable prompt CMS, which is out of scope for v1).

**Cost and failure handling:** every `AIGateway.generate` call is wrapped with (a) a timeout and retry-once policy, (b) a fallback to a plain non-AI template (e.g. a static welcome-doc template) if the AI call fails twice, so a provider outage never blocks an agency from sending a welcome doc or invoice, and (c) per-tenant usage logging (`tokensUsed`, `costEstimate`) so AI cost can be metered into pricing later (the earlier research flagged AI/usage-based pricing as the right model for cost pass-through).

**Human-in-the-loop, always (restates §1 principle 3 as a system rule):** `AIGateway.generate` output is written to the relevant entity with `status: "draft"` (e.g. `WelcomeDoc.status = "draft"`). No service is permitted to transition a draft to `"sent"` without an explicit user action. This is enforced in the Engagement Service's stage-transition logic, not left to UI discipline alone.

## 6. Follow-up & Notification Engine

This is the single most important automation in the product — the validation research (see PRD §1) found "chasing clients" to be the most-repeated pain point across every source, for proposals, invoices, onboarding forms, and access requests alike. One engine handles all four, not four separate reminder systems.

**Design:**

| Piece | Behavior |
| --- | --- |
| `FollowUpRule` | Per tenant, per target\_type (proposal/invoice/intake\_form/access\_request): how many days after the last action with no response before a nudge fires, and the max number of nudges before it stops and flags the owner instead (default: nudge at day 2, day 5, day 9; stop and alert the owner after 3 unanswered nudges — never nudge forever, which reads as spam and damages the agency's relationship) |
| `FollowUpTask` | Created automatically whenever a target enters a "waiting on client" state (`Proposal.status = sent`, `Invoice.status = sent`, `IntakeForm.status = sent` and unanswered, `AccessRequest.status = requested`); cancelled automatically the moment that target's state changes (client signs, pays, submits, grants) |
| Job Queue worker | Polls `FollowUpTask` where `next_run_at <= now()` and `status = pending`; for each, calls `AIGateway.generate(task: "followup_message")` with the engagement's context (what's outstanding, how many days late, the client's name/tone from prior messages) to draft a short nudge, which goes to the owner as a **draft to approve**, not auto-sent (§1 principle 3) — v1 is approve-then-send via WhatsApp/email; auto-send after N successful manual approvals is a clearly-flagged v2 option, not a v1 default |
| Channel | WhatsApp Business API preferred where the client has opted in (matches §1's India-first, WhatsApp-native design intent); email as the universal fallback |

**Escalation, not just repetition.** The nudge's tone and framing changes by attempt number (gentle reminder → direct ask → "let us know if priorities have changed" rather than three identical messages), generated by passing the attempt number into the AI context — this directly addresses the "chase loop" pattern surfaced in the earlier onboarding research, where the same repeated ask reads as nagging rather than professional follow-through.

**Visibility.** The owner's dashboard (§13) shows every open `FollowUpTask` across all engagements in one list — "what's waiting on a client right now" — so nothing falls through without the owner having to open each engagement individually.

## 7. Tech Stack & Non-functional Requirements

**Locked stack (per founder decision):**

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | Next.js (App Router), React, TypeScript | Server components for the client portal (read-heavy, SEO-irrelevant but fast-load matters since clients judge professionalism by load speed) |
| Backend | Node.js, same Next.js project (API routes / Route Handlers) | One deployable; no separate backend service in v1 |
| Database | PostgreSQL | Single instance; `tenant_id` on every table (§4); JSONB columns for AI-generated structured content (agendas, intake answers) to avoid premature schema rigidity on fields that will change shape |
| ORM | Prisma or Drizzle (implementer's choice) | Must support the `withTenant()` query-wrapper pattern from §4 cleanly |
| Job Queue | Postgres-backed (e.g. `pg-boss`) | No Redis/separate queue infra for v1 — one less moving part to operate solo |
| Payments | Razorpay | UPI, cards, net banking; GST invoice generation; webhook-driven payment confirmation (never trust a client-side "payment done" click) |
| E-sign | OTP-based (custom-built: phone OTP + IP + timestamp logged against the signed PDF) | Not a third-party e-sign SDK for v1 — the mechanism is simple enough to own, and owning it avoids a recurring per-document fee at low volume |
| AI | Provider-agnostic via the AI Gateway (§5) | No model vendor hard-coded into features |
| Messaging | WhatsApp Business API (e.g. via a provider like Gupshup or 360dialog) + email (e.g. Resend or SendGrid) | WhatsApp requires business verification lead time — flag this as a setup task, not a same-day integration |
| Hosting | A platform with an India/Mumbai region (e.g. AWS ap-south-1, or a PaaS with that region option) | Matches §4's data-residency preference and reduces latency for India-based tenants and clients |
| File storage | S3-compatible object storage | Signed PDFs, uploaded assets, handover deliverables |

**Non-functional requirements (sized for a pre-revenue MVP, not enterprise scale):**

- **Availability:** best-effort uptime acceptable for v1 (no formal SLA) — but payment webhook handling must be idempotent and retry-safe, since a missed webhook means an unrecorded payment, which is unacceptable regardless of overall uptime target.
- **Performance:** client portal pages load under 2 seconds on a typical Indian mobile connection — this is a real differentiator given the target client often opens the portal on a phone.
- **Scale target for v1:** designed to comfortably handle a few hundred tenants and a few thousand engagements — not designed for, or optimized toward, enterprise scale. Do not over-engineer for load the product does not yet have.
- **Backups:** daily automated Postgres backups from day one — this is client financial and contract data; losing it is an existential risk, not an inconvenience, so it is not deferred as a "later" item.
- **Observability:** basic error logging and alerting (even a simple Sentry-style integration) from v1, specifically on the payment webhook path and the follow-up job queue — these are the two places a silent failure directly costs the business money or a client relationship.
