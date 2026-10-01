# PRD and Features

Oct 2, 2026 · @Someone

## 1. Vision, Problem & Target Users

**Vision.** One platform that carries a service business's client from first proposal through final handover — replacing the 5–8 disconnected tools (invoicing app, e-sign tool, forms tool, WhatsApp, spreadsheets, a project tracker) that agencies, consultants, and freelancers currently stitch together by hand.

**Problem (validated, see Appendix references in §14):**

- HoneyBook, Dubsado, and Bonsai do not support India (no UPI, no GST, Stripe-only backends) — confirmed directly on G2 and by competitors positioning against this gap.
- India-first invoicing tools (Refrens, 100k+ users) solve billing well but are weak on the client-facing proposal and portal experience.
- The agency-onboarding pain ("chasing clients for docs and access") is extremely well-documented across Reddit and agency-ops content, but existing onboarding software (Rocketlane, GuideCX, Dock) is priced and built for enterprise B2B SaaS customer-success teams, not 1–5 person agencies.
- The one SMB-priced onboarding tool (Content Snare, $29–$99/mo) deliberately does only form/document collection — no contracts, no payments, no portal.

**Target user (ICP).** Indian and emerging-market agencies, consultants, and freelancers (1–10 people) who sell services to clients both domestically and internationally — design studios, dev shops, marketing/AI-implementation consultants, coaches. They currently run their client relationships through a mix of WhatsApp, email, spreadsheets, and 2–4 point tools.

**First customer: the founder's own agency/consulting work.** The product is dogfooded on real client engagements before being sold — this is the validation step the earlier market research recommended (a concierge MVP proven on real paying work) rather than a separate step to do first.

**What this product is explicitly NOT (see §16 for the full out-of-scope list):** not a full CRM pipeline with deep lead-scoring, not a project-management tool competing with Asana/ClickUp, not a cold-outreach/sequencing tool. It is the proposal-to-handover spine; everything else stays an integration.

## 2. Lifecycle Overview

The full client lifecycle this product runs, in order. Each stage below is one feature section (§3–§14); each maps to one `Engagement.stage` value from the System Design doc's data model.

```
1. Lead Capture        ->  2. Quote/Proposal      ->  3. E-sign
                                                           |
                                                           v
6. Welcome Doc  <-  5. Payment Collection  <-  4. Deposit/Milestone Invoice
     |
     v
7. Onboarding Form -> 8. Request for Access -> 9. Kickoff Call
                                                      |
                                                      v
          11. Client Portal  <-(runs throughout)->  10. Follow-ups (runs throughout)
                                                      |
                                                      v
                                          12. Feedback & Handover
```

Steps 10 (Follow-ups) and 11 (Client Portal) are not sequential stages — they run continuously across the whole lifecycle, which is why the System Design doc (§6) builds them as one engine and one read-aggregation service rather than per-stage features.

## 3. Feature: Lead Capture

**What it does.** Captures a prospective client into the system as a `Lead`, which converts into an `Engagement` once the owner decides to send a proposal. Deliberately lightweight — this is not a full CRM pipeline (see §16).

**User story.** As an agency owner, I want to log a new prospect in under 30 seconds (from a call, a WhatsApp message, or a form submission) so nothing I'm actively talking to gets forgotten.

**Inputs:** name, company, email, phone, source (manual/web-form/WhatsApp), notes (free text). **Outputs:** a `Lead` record with `status = new`; appears in a simple list view (not a kanban pipeline) sorted by most recent.

**UI:**

- A single "+ New Lead" quick-add form (5 fields max) accessible from anywhere in the app.
- An optional embeddable public web form (one per tenant, a shareable link) that creates a `Lead` with `status = new, source = web-form` directly — for owners who want a "Contact us" form on their own site.
- A list view: Lead name, company, source, days since created, one action button → "Create Proposal" (which creates the `Engagement` and takes the owner to §4).

**Edge cases:**

- Duplicate lead (same email/phone already exists) → warn and link to the existing record rather than silently creating a duplicate; do not block creation (the owner may be right that it's a new, separate opportunity).
- A lead that goes nowhere → manually marked `status = lost`; it is not auto-archived or deleted, since even dead leads are useful context later (per §1, this tool never discards user-entered data on its own initiative).

**Acceptance criteria:**

- A new lead can be created in ≤ 3 UI interactions (open form, fill, save).
- The public web-form link works with no login required by the person filling it in.
- Creating an `Engagement` from a `Lead` carries the lead's contact info forward with zero re-typing.

## 4. Feature: Quote/Proposal Builder

**What it does.** The differentiated core of the product (per the market validation in §14): a client-facing proposal document, not just a billing line-item form. Converts a scope conversation into a branded, persuasive proposal with line-item pricing in dual currency.

**User story.** As an agency owner, I want to turn a 10-minute call into a professional proposal in a few minutes, with pricing in both INR and the client's currency, so I look credible fast and don't lose momentum after a good call.

**Inputs:** client (existing `Lead`/`Client` or new), project title, line items (description, qty, unit price, currency — supports mixed INR/USD lines on one proposal), validity period, optional AI-assisted draft from a short brief ("3-page website redesign, $1,500, 3-week timeline" → AI expands this into full line items and a cover note via `AIGateway.generate(task: "proposal_draft")`). **Outputs:** a `Proposal` (status `draft`) with `ProposalLineItem`s; a branded PDF/web-view version; once sent, a trackable link (viewed/not viewed, via `Proposal.status = viewed` when the client opens it).

**UI:**

- Proposal editor: line-item table (add/remove/reorder rows), a cover-note rich-text area (AI-draftable, always editable before sending), currency toggle per line item, auto-calculated subtotal/total per currency.
- "Generate with AI" button that takes a short brief and produces a full draft the owner edits before sending — never auto-sent (§1 principle 3, §5).
- A client-facing view (no login required, magic link) showing the proposal cleanly, with an "Accept" button that leads into §5 (E-sign).
- Send via WhatsApp/email with one click; view-tracking pixel/event records when the client opens the link.

**Edge cases:**

- Client wants changes → owner edits and re-sends as a new `version` of the same `Proposal` (version history kept, never overwritten silently — so the owner can see what was negotiated).
- Proposal expires (`valid_until` passed, unaccepted) → status moves to `expired`; owner can reactivate with a new validity date. This does NOT trigger the follow-up engine (§6) to keep nudging on an intentionally expired quote.
- Multi-currency rounding → all monetary math stored in the smallest unit (paise/cents) to avoid floating-point rounding errors across INR/USD lines.

**Acceptance criteria:**

- A proposal with 5 line items can be created, previewed, and sent in under 5 minutes end to end.
- The client-facing view renders correctly on a mobile browser with no app or login.
- AI-drafted content is always inserted as editable text the owner can change before send — never sent unreviewed.

## 5. Feature: E-sign

**What it does.** Converts an accepted proposal into a legally-evidenced signed agreement using OTP-based e-sign (per System Design §4) — no third-party e-sign subscription needed at launch.

**User story.** As a client, I want to accept and sign a proposal from my phone in under a minute, without creating an account or downloading anything.

**Inputs:** the accepted `Proposal`, the signer's name and phone number. **Outputs:** an `EsignEvent` record (signer name, phone, OTP-verified timestamp, IP address) and a signed PDF that merges the proposal content with a signature block showing the verified details — this PDF is the artifact both parties keep.

**UI:**

- On the client-facing proposal view, clicking "Accept" opens a signer-details form (name, phone — pre-filled if already known from the `Lead`/`Client` record).
- An OTP is sent via SMS to that phone number; the client enters the 6-digit code to confirm.
- On verification, the signed PDF is generated and both the client (via email/WhatsApp) and the owner receive a copy automatically.
- `Proposal.status` moves to `accepted`, and `Engagement.stage` advances to `proposal_accepted` (System Design §3.1), which is what unlocks §6 (Invoice).

**Edge cases:**

- OTP not received → a "resend" option with a short cooldown (e.g. 30 seconds) to prevent abuse; after 3 failed attempts, lock for a short period and surface a "contact the agency" fallback.
- Client declines instead of accepting → `Proposal.status = declined`; this stops the follow-up engine's nudges for that proposal (a decline is a clear answer, not something to keep chasing) and surfaces to the owner so they can follow up personally if they choose.
- Signer is not the decision-maker (e.g. an assistant signs) → out of scope for v1 to validate signer authority beyond phone-OTP identity; this is a known, accepted limitation of lightweight e-sign, same as the approach ClearWork and similar India-first tools use.

**Acceptance criteria:**

- The full accept-and-sign flow completes in under 60 seconds on a mobile browser.
- The signed PDF is generated and delivered to both parties within seconds of OTP verification — no manual step by the owner required.
- The `EsignEvent` record is immutable once created (no edits to a signed record, only new versions via a new proposal version if terms change).

## 6. Feature: Deposit/Milestone Invoice

**What it does.** Auto-generates an invoice directly from the signed proposal — no re-typing line items into a separate billing tool, which is the exact friction point that makes agencies juggle two systems today.

**User story.** As an agency owner, I want the deposit invoice ready the moment a proposal is signed, pre-filled and GST-correct if needed, so I can send it before the client's attention moves elsewhere.

**Inputs:** the signed `Proposal`, invoice type (deposit % / milestone / final), GST applicability (toggle, per System Design §4 — off by default for tenants under the threshold). **Outputs:** an `Invoice` record with calculated GST breakup if applicable (CGST/SGST for intra-state, IGST for inter-state, based on client state vs tenant state), a branded invoice PDF, `status = draft` until sent.

**UI:**

- Auto-created draft invoice appears the moment `Engagement.stage` becomes `proposal_accepted`, pre-filled from the proposal's line items and the tenant's default deposit percentage (configurable, e.g. 50% upfront).
- Owner reviews, adjusts if needed (e.g. changes to a milestone schedule with 2–3 invoices instead of one), and sends.
- Invoice includes a "Pay Now" link/button that leads directly into §7 (Payment Collection) — the client should never have to ask "how do I pay this."

**Edge cases:**

- Multi-milestone projects → the owner can split one proposal into multiple `Invoice` records against one `Engagement` (e.g. 50% deposit, 30% at midpoint, 20% on delivery), each independently trackable.
- Client is GST-registered but the tenant is not (or vice versa) → the GST toggle and breakup logic handles this per-invoice, not as a fixed tenant-level setting, since a tenant's own registration status is fixed but which client needs what documentation can vary.
- Invoice edited after sending → not allowed; a correction requires voiding the invoice and issuing a new one, to preserve a clean audit trail for both GST compliance and dispute resolution.

**Acceptance criteria:**

- An invoice is auto-drafted within seconds of e-sign completion, with zero manual line-item re-entry.
- GST breakup, when applicable, is calculated correctly for both intra-state and inter-state scenarios.
- The invoice PDF is GST-compliant in format (invoice number sequence, GSTIN display, HSN/SAC where applicable) when the GST toggle is on.

## 7. Feature: Payment Collection (India Compliance)

**What it does.** Collects payment against an invoice via Razorpay (UPI, cards, net banking for domestic clients; cards/international rails for cross-border clients) and records it as the single source of truth that advances the engagement — never a manual "mark as paid" click for real payments.

**User story.** As a client, I want to pay an invoice in whatever way is easiest for me (UPI if I'm in India, a card if I'm abroad) without creating an account. As an agency owner, I want to know the moment a payment clears, not when I remember to check.

**Inputs:** the sent `Invoice`, the client's chosen payment method. **Outputs:** a `Payment` record (Razorpay payment ID, amount, method, timestamp) linked to the `Invoice`; `Invoice.status` moves to `paid`; `Engagement.stage` advances from `deposit_invoiced` to `deposit_paid` (System Design §3.1).

**UI:**

- The invoice's "Pay Now" link opens a Razorpay-hosted checkout (UPI/card/net banking) — the platform never builds its own card-entry form (PCI scope stays with Razorpay, per System Design §4).
- Real-time payment confirmation on the client's screen; the owner gets an instant notification (WhatsApp/email) the moment the webhook confirms payment.
- Owner's dashboard shows outstanding vs. paid invoices across all engagements at a glance.

**Edge cases:**

- Payment webhook delayed or fails to arrive → a reconciliation job polls Razorpay's API periodically as a safety net so a dropped webhook never leaves a paid invoice stuck showing `sent` (System Design §7 flags this path as the one place idempotent, retry-safe handling is non-negotiable).
- Partial payment attempted → v1 does not support partial payment against a single invoice; the owner instead issues a separate invoice for a different amount if a client needs to split payment (keeps the payment model simple and auditable at MVP stage).
- International card payments → Razorpay's international payment support (where enabled on the tenant's account) handles currency conversion; the platform displays both the invoice currency and the settled INR amount so the owner isn't confused by conversion differences.

**Acceptance criteria:**

- A client can pay via UPI in under 3 taps from the invoice link.
- `Engagement.stage` advances automatically and only on confirmed payment — never on a manual click, per the state-machine rule in System Design §3.1.
- The owner is notified of a successful payment within seconds, without needing to check the dashboard.

## 8. Feature: Welcome Doc (AI-generated)

**What it does.** The moment payment clears, auto-generates a branded welcome document — team intros, what happens next, timeline overview — so the client's first post-payment experience is immediate and professional, not silence while the agency scrambles internally (the exact "day-1 gap" the onboarding research flagged as a common failure point).

**User story.** As an agency owner, I want a polished welcome document to reach the client within the hour of payment, without writing one from scratch for every new client.

**Inputs:** the `Engagement`'s scope (from the accepted proposal), tenant's team info (names/roles, configured once in settings), tenant's standard onboarding timeline template (configurable). **Outputs:** a `WelcomeDoc` (status `draft`) — `AIGateway.generate(task: "welcome_doc")` drafts it from the proposal scope and team info; the owner reviews and sends (System Design §1 principle 3, §5).

**UI:**

- Auto-created draft appears in the engagement the moment `Engagement.stage` reaches `deposit_paid`.
- Owner sees a pre-filled document (team intro, project recap, what happens next, how to reach us) with inline edit, then "Send" via WhatsApp/email and into the client portal (§12).
- A reusable tenant-level template (set once in settings) seeds tone and structure so every welcome doc feels consistent, not generated from scratch each time.

**Edge cases:**

- No team info configured yet → falls back to a generic single-point-of-contact version rather than blocking the whole feature on an unfilled settings page.
- AI generation fails or times out → falls back to the tenant's static template with placeholders, per the AI Gateway's fallback rule (System Design §5) — the client never waits on an AI outage.

**Acceptance criteria:**

- A usable welcome-doc draft exists within seconds of payment confirmation, with zero manual data entry beyond initial team setup.
- The owner can send it in one click after a quick read, or edit first if something doesn't fit this particular client.

## 9. Feature: Onboarding/Intake Form (AI-generated)

**What it does.** Generates a scope-specific intake questionnaire automatically (rather than the owner building a generic form once and reusing it for every project type), since a website-redesign scope needs different questions than a marketing-retainer scope.

**User story.** As an agency owner, I want the right intake questions ready automatically based on what I just sold, so I don't have to build or remember a custom questionnaire for every engagement.

**Inputs:** the `Engagement`'s scope/line items (from the proposal), an optional tenant-level question library per service type (configurable, grows over time as the owner edits AI drafts). **Outputs:** an `IntakeForm` (status `draft`, AI-generated question set via `AIGateway.generate(task: "intake_questions")`), reviewed and sent by the owner; client-submitted `IntakeResponse`.

**UI:**

- Draft intake form auto-created alongside the welcome doc; owner reviews/edits questions (add, remove, reorder) before sending.
- Client fills it via a no-login web form (magic link, mobile-friendly) — matches the pattern used across the lifecycle (proposal view, e-sign) of never requiring the client to create an account.
- Submitted answers appear in the engagement and in the client portal (§12) for both sides to reference later.

**Edge cases:**

- Client doesn't respond → picked up automatically by the Follow-up Engine (System Design §6) as a `FollowUpTask`, not a separate reminder system.
- Client submits incomplete answers → required vs. optional questions are configurable per form; required ones block submission with a clear inline message, optional ones don't.
- Scope changes after the intake form was already generated (common in real projects) → the owner can regenerate or manually edit the question set at any time; it is not locked once sent.

**Acceptance criteria:**

- A relevant, scope-specific question set is drafted automatically without the owner writing it from scratch.
- The client can complete the form from a phone in one sitting with no account creation.
- Answers are visible to the owner and reflected in the client portal immediately on submission.

## 10. Feature: Request for Access

**What it does.** Generates per-platform access-request instructions (e.g. "add us as a user on your Google Analytics") and tracks their status — directly targeting the single most-quoted agency complaint ("chasing clients for logins"). Never stores a password (System Design §4 — this is a hard boundary, not a configurable option).

**User story.** As an agency owner, I want to request access to every platform I need for this project in one batch, with instructions the client can actually follow, instead of writing a new "how do I add you to our GA account" email every time.

**Inputs:** which platforms are needed for this engagement (owner picks from a library: Google Analytics, Google Ads, Meta Business Suite, common CMSs, domain registrar, etc., or adds a custom one), client contact. **Outputs:** one or more `AccessRequest` records (platform, generated instructions, status: `requested` / `granted` / `n/a`), sent as a single consolidated message to the client.

**UI:**

- Owner selects needed platforms from a checklist (pre-populated per service type, e.g. "Website redesign" suggests CMS + domain registrar + hosting).
- The system generates the exact invite steps for each platform (templated, since the invite flow for each major platform is stable and well-known) and bundles them into one client-facing checklist page (magic link, no login) rather than a wall of separate emails.
- Client marks each item done as they complete it, or the owner marks it `granted` once confirmed; status is visible to both in the client portal (§12).

**Edge cases:**

- A platform with no invite-flow (e.g. a GoDaddy domain) → falls back to instruction-only mode (System Design §4): clear steps for what to share and how, with an explicit note that credential sharing happens outside the platform, never through it.
- Client shares a password anyway (ignoring the instructions) directly in the checklist page's comment field → the platform must actively prevent this: a client-side pattern check blocks submission of anything that looks like a credential pair, with a message redirecting them to the correct platform-invite method instead of silently accepting it.
- Client stalls on granting access → picked up by the Follow-up Engine (System Design §6) like every other "waiting on client" state.

**Acceptance criteria:**

- An owner can request access to 5 platforms in under 2 minutes, as one consolidated client-facing request.
- No raw credential is ever stored in the database — this is tested explicitly, not assumed.
- Status (requested/granted per platform) is visible at a glance across all engagements, not just inside one engagement.

## 11. Feature: Kickoff Call

**What it does.** Schedules the kickoff meeting and auto-generates a scope-specific agenda, then turns the call recording/notes into a structured summary with action items — removing both the "what do we even cover" prep work and the "who writes up the notes" follow-through gap.

**User story.** As an agency owner, I want a ready-made agenda for this specific project's kickoff, and a clean action-item list afterward, without spending 30 minutes writing either by hand.

**Inputs:** the `Engagement`'s scope and intake-form answers (§9), a scheduling link/time, optionally an uploaded call recording or notes after the call. **Outputs:** a `KickoffCall` record (scheduled time, AI-generated agenda via `AIGateway.generate(task: "kickoff_agenda")`); after the call, a `CallSummary` (AI-generated via `task: "call_summary"`) with structured `action_items`.

**UI:**

- Scheduling: v1 generates a simple scheduling link (a few proposed slots the owner sets, client picks one — full calendar OAuth integration is a v2 item, per System Design §7).
- Agenda: auto-drafted from the scope and intake answers (e.g. "confirm timeline," "review brand assets," pulled from what the intake form actually surfaced), editable before the call.
- Post-call: owner uploads a recording or pastes rough notes; AI generates a clean summary and action-item list, assignable to either side, visible in the client portal (§12).

**Edge cases:**

- No recording/notes provided → the summary step is simply skipped; this is optional value-add, not a blocking requirement to move the engagement forward.
- Client no-shows the kickoff → owner marks it and reschedules; this is surfaced as a flag on the engagement, not an automatic negative mark against the client.
- Action items span both sides (agency AND client owe something) → each action item carries an explicit owner field (agency/client), and client-owed items feed into the Follow-up Engine (§6) the same way an unanswered intake form does.

**Acceptance criteria:**

- A relevant agenda exists before the owner has to think about what to cover.
- A call summary with clear action items is produced from a recording/notes without manual note-taking.
- Action items are visible to both agency and client in the shared portal, with no ambiguity about who owes what.

## 12. Feature: Follow-ups (AI Engine)

The engineering design for this lives in System Design §6; this section specifies the product surface and behavior.

**What it does.** Surfaces and drafts nudges for every "waiting on client" item across the whole lifecycle — unsigned proposals, unpaid invoices, un-submitted intake forms, un-granted access requests — as one unified list, not four separate reminder habits the owner has to maintain manually.

**User story.** As an agency owner, I want one place that tells me exactly what's stalled and a ready-to-send nudge for each, so nothing slips through just because I got busy with delivery work.

**Inputs:** every entity that can enter a "waiting on client" state (see System Design §6 table) and its elapsed time without response. **Outputs:** a prioritized list of open `FollowUpTask`s with an AI-drafted message for each, ready to review and send.

**UI:**

- A dedicated "Needs Follow-up" view on the main dashboard: one row per stalled item, across all engagements, sorted by how overdue it is.
- Each row shows: client name, what's outstanding (e.g. "Deposit invoice, 6 days unpaid"), a one-click "Review & Send" that opens the AI-drafted nudge for editing and sending.
- A per-tenant settings page to adjust the default cadence (when nudges 1/2/3 fire) and the channel preference (WhatsApp-first vs. email-first).

**Edge cases:**

- Owner wants to silence follow-up on a specific item (e.g. they know the client is on vacation) → a "snooze" option per task, with a clear reason logged, rather than only a binary on/off.
- Client responds through a channel outside the platform (e.g. replies by phone call) → the owner manually marks the task resolved; the system cannot detect an off-platform response automatically in v1.

**Acceptance criteria:**

- Every "waiting on client" item across the lifecycle appears in one list within seconds of entering that state — nothing requires the owner to notice it manually.
- A usable, context-aware draft nudge exists for every item without the owner writing one from scratch.
- No nudge is ever sent without an explicit owner action, per the human-in-the-loop rule (System Design §1, §5).

## 13. Feature: Client Portal

**What it does.** One page per engagement where the client sees everything — proposal, signed contract, invoices and payment status, welcome doc, intake form, access-request status, kickoff agenda/summary — rather than hunting across email threads and WhatsApp for "where did that document go." This is the explicit wedge against both Refrens (strong on invoicing, weak on client-facing portal) and HoneyBook/Dubsado (not built for India), per §1.

**User story.** As a client, I want one link that always shows me the current status of my project — what's signed, what I owe, what you need from me — without asking the agency or digging through old messages.

**Inputs:** pure read-aggregation across every entity tied to the `Engagement` (Portal Service, System Design §2) — this feature creates no new data of its own. **Outputs:** a single, no-login, magic-link page per engagement, always current.

**UI:**

- Timeline view: proposal → signed → paid → onboarding → kickoff → delivery → handover, with the current stage visually highlighted (reuses the `Engagement.stage` state machine from System Design §3.1 directly — the portal is never a separate source of truth about status).
- Document section: proposal PDF, signed contract PDF, invoices (with pay links for unpaid ones), welcome doc.
- "What we need from you" section: open intake form, open access requests — the client's own personal to-do list for this engagement, pulling directly from open `FollowUpTask`s targeting them.
- Mobile-first layout (System Design §7 performance target) since clients open this from their phones, often from a WhatsApp link.

**Edge cases:**

- Multiple engagements with the same client (a repeat client) → each engagement gets its own portal link; a future "client home" view listing all their engagements is a clearly-flagged v2 item, not built now.
- Portal link shared beyond the intended client (e.g. forwarded to their boss) → acceptable in v1 (the link itself is the access control, same model as most client-portal tools in this category); revoking/regenerating a link is a manual owner action if ever needed.

**Acceptance criteria:**

- The portal always reflects current state with no manual "refresh the portal" step by the owner — it is a live read, not a periodically-regenerated snapshot.
- A client can find "what do I owe" and "what do you need from me" within one glance of opening the link.
- Loads in under 2 seconds on a typical mobile connection, per System Design §7.

## 14. Feature: Feedback & Handover

**What it does.** Closes the engagement cleanly: requests feedback, and packages final deliverables with an AI-generated summary of what was delivered — both for the client's record and as reusable case-study/testimonial material for the agency.

**User story.** As an agency owner, I want a clean, professional close to every project — feedback captured and a tidy handover packet — without it being an afterthought I forget once the final invoice is paid.

**Inputs:** final deliverable files (uploaded by the owner), the engagement's full history (for the AI summary). **Outputs:** a `FeedbackRequest`/`FeedbackResponse` pair; a `HandoverPacket` (deliverables + AI-generated summary via `AIGateway.generate(task: "handover_summary")`).

**UI:**

- Triggered manually by the owner when delivery is complete (not auto-triggered by a date, since real projects don't end on a fixed schedule).
- Feedback request: a short rating + comments form sent to the client, visible in the portal.
- Handover packet: owner uploads final files; AI drafts a summary of what was delivered against the original scope (useful both as a client-facing close-out note and as raw material for a case study/testimonial later); owner reviews and sends.
- `Engagement.stage` moves to `handed_over` then `closed` once both are sent/collected.

**Edge cases:**

- Client doesn't respond to the feedback request → one follow-up nudge via the Follow-up Engine, then stop — feedback is valuable but not worth damaging a completed relationship by nagging for it.
- Ongoing/retainer engagements with no single "end" → this feature is used per-milestone rather than only once at full project close; the owner decides when a handover packet makes sense.

**Acceptance criteria:**

- A feedback request and a handover packet can each be sent in a few minutes, not built from scratch.
- The AI-generated delivery summary is accurate enough to be usable as a first draft for a testimonial request or case study, reviewed before any external use.

## 15. Cross-cutting: Admin, Settings & Dashboard

These are not lifecycle stages but are required for every feature above to function for a real tenant.

**Settings (tenant-level, configured once):**

- Business profile: name, GST number (optional), default currency, logo/branding (used on proposals, invoices, welcome docs, portal).
- Team members: name, role, email (for future multi-user support; v1 may ship owner-only and add team members in a fast-follow).
- Razorpay account connection (API keys, entered once).
- WhatsApp Business number connection (requires provider verification lead time — flagged in System Design §7 as a setup task, not instant).
- Default templates: welcome-doc tone/structure, follow-up cadence (System Design §6), intake-question library seeds per service type.

**Owner dashboard (the daily-use home screen):**

- "Needs Follow-up" list (§12) — the single most important widget, surfaced first.
- Engagement list: all active engagements with their current `Engagement.stage`, sortable/filterable.
- Outstanding invoices total (across all engagements) — "how much is owed to me right now," a number every owner wants at a glance.
- Recently completed actions (payment received, proposal signed, form submitted) as a simple activity feed.

**Acceptance criteria:**

- A new tenant can complete settings setup (minus WhatsApp verification lead time) in under 15 minutes.
- The dashboard answers "what needs my attention today" without opening any individual engagement.

## 16. Out of Scope for v1 (and Why)

Explicitly excluded so a building agent does not drift scope. Each exclusion is backed by the earlier market validation, not an arbitrary cut.

| Excluded | Why |
| --- | --- |
| Deep CRM pipeline (lead scoring, multi-stage sales automation) | Validation found this isn't the felt pain for this ICP; Lead Capture (§3) is deliberately lightweight. |
| Cold outreach / sequencing tooling | Research found no evidence this specific audience (Indian agencies/consultants) feels this pain — it's a US outbound-SDR problem, not this ICP's. |
| Full project/task management (competing with Asana/ClickUp) | Out of scope — the portal (§13) shows status, it does not replace a delivery-team's task tracker. |
| Aadhaar e-sign | OTP e-sign (§5) covers v1's legal-validity needs; Aadhaar e-sign needs a licensed ESP integration (Digio/Leegality) — a scoped v2 item, not half-built now. |
| Calendar OAuth (Google/Outlook) for kickoff scheduling | v1 uses a simple slot-picker link (§11); full calendar sync is a v2 convenience, not a blocker to the core flow. |
| Multi-team/role permissions beyond owner vs. team member | v1 targets 1–10 person teams where this is rarely the bottleneck; deeper permissioning is a fast-follow once team usage patterns are known. |
| Browser extension, mobile app | The portal and owner UI are both mobile-web first (System Design §7); a native app is not needed to validate the product. |
| Accounting/bookkeeping (full double-entry books, P&L) | Invoicing (§6–§7) covers what the client-facing lifecycle needs; full bookkeeping is Refrens/Zoho Books territory, not this product's job. |
| White-label/reseller features | Premature before the core product has paying tenants of its own. |

## 17. Success Metrics & Open Questions

**v1 success metrics (dogfooding phase, before any outside tenant):**

- Every new client engagement for the founder's own business runs through the full lifecycle (§3–§14) with zero fallback to spreadsheets, a separate invoicing tool, or manual WhatsApp chasing.
- Time from "call ends" to "proposal sent" drops to under 10 minutes.
- Time from "payment received" to "welcome doc + intake form sent" drops to under 1 hour, with no manual drafting.
- Zero missed follow-ups on open items (every stalled proposal/invoice/form/access-request surfaces in the Follow-up list before the owner has to remember it manually).

**Post-dogfooding, pre-sale metrics (first outside tenants):**

- A new tenant completes settings setup and sends their first proposal within one sitting (no multi-day onboarding).
- A tenant's clients complete e-sign and payment without needing to contact the agency to ask "how do I do this."

**Open questions for the founder to resolve before/during build (flagged, not answered here):**

- Product/brand name — not yet chosen; the data model and code should not hard-code any placeholder name into user-facing strings.
- Exact default follow-up cadence (days between nudges) — §6 proposes day 2/5/9 as a starting default; worth validating against the founder's own real client tolerance during dogfooding.
- WhatsApp Business API provider choice (Gupshup vs. 360dialog vs. others) — deferred to implementation time based on verification speed and pricing at build time.
- Pricing model for external tenants (flat vs. usage-based for AI/WhatsApp) — out of scope for this PRD; to be addressed separately once the product is validated internally, per the earlier market-validation conversation's recommendation to price with real PPP tiers and usage-based AI/messaging costs.
