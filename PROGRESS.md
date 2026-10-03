# Progress Log

Purpose: let a fresh Claude Code session pick up this project cheaply —
without replaying the full conversation history. Read this file, the PRD
(`PRD & Features.md`), and `System Design.md` first; they're the source of
truth for *what* and *why*. This file tracks *sequencing decisions* and
*in-flight state* that aren't derivable from code or git history alone.

## Standing rules for this project (don't re-derive, just follow)

- Git commits: author as `0x12md10 <0x12md10@users.noreply.github.com>`,
  **no** `Co-Authored-By: Claude` line (explicit user override of the default
  attribution). **Always use the noreply email, never the user's real Gmail**
  — GitHub attributes a commit by matching the author *email* to whichever
  account has it verified, not by who pushes it. A different GitHub account
  (`0x12m10d`, transposed letters — not this project's account) has the
  user's real Gmail verified, so a commit authored with that email gets
  misattributed on GitHub even though the push itself is authenticated
  correctly. Caught and fixed once already (iteration 16, commit amended +
  force-pushed) — don't repeat it.
- Push to `origin main` as `0x12md10` (switch with `gh auth switch --user 0x12md10`
  if a push 403s under a different account).
- Workflow per feature/iteration: present a plan → get explicit "yes start" →
  implement (schema/migration, service layer, routes, pages, tests) →
  `npx tsc --noEmit` → `npx vitest run` → live-verify against the real local
  dev server (Docker Postgres + `npm run dev`) via curl/script → commit → push.
- Standing instruction from the user: **flag whenever something needs their
  input/credentials/decisions** — don't silently assume.
- Dev stack: Next.js App Router + TS, Prisma + Postgres (Docker, ports
  55432 dev / 55433 test), pg-boss, Razorpay, AI Gateway (Anthropic),
  Vitest + Playwright.

## Completed (PRD §3–§15, full lifecycle — all iterations 1–14)

Auth, Lead Capture, Proposal Builder, E-sign, Invoice/GST, Payment
Collection, Welcome Doc, Intake Form, Request for Access, Kickoff Call,
Follow-ups, Client Portal, Feedback & Handover, Dashboard/Engagement List
(PRD §15) — all implemented, tested, live-verified, committed, pushed.

## Iteration 15 — Magic-link tokens + real email (Resend) — DONE

- Added `publicToken String @unique` to every publicly-exposed model:
  `Engagement` (serves `/portal` and `/access`), `Proposal` (`/p`),
  `Invoice` (`/i`, `/pay`), `WelcomeDoc` (`/w`), `IntakeForm` (`/intake`),
  `KickoffCall` (`/kickoff`), `FeedbackRequest` (`/feedback`),
  `HandoverPacket` (`/handover`). Migration:
  `prisma/migrations/20261003000000_public_tokens/`.
- `src/lib/public-token.ts` — `generatePublicToken()` via
  `crypto.randomBytes(24).toString("base64url")`.
- Pattern used everywhere: every public (no-login) service function now
  takes `token` (not the raw id), resolves `where: { publicToken: token }`
  first, then uses the real row's `.id` for all *internal* writes/queries
  (FollowUpTask targetId, EsignEvent.proposalId, stage transitions, etc.).
  Public-facing serialized objects return `id: row.publicToken` so existing
  frontend code that calls `thing.id` for follow-up requests keeps working
  unchanged.
- Exception: `AccessRequest` has **no** publicToken of its own — the
  `/access/[engagementToken]` checklist page is gated by
  `Engagement.publicToken`, and individual "mark granted" actions from
  within that already-gated page use the real `AccessRequest.id` in the
  POST body. This is intentional, not an oversight.
- Added `publicToken` to the owner-facing serializers (`serializeInvoice`,
  `serializeIntakeForm`, `serializeWelcomeDoc`, `serializeKickoffCall`) and
  to `createFeedbackRequest`'s return (`requestToken`) — safe since these
  are only ever returned to the authenticated owner, and tests/future owner
  UI need the token to construct public links without a second call.
- Real email: `src/lib/integrations/email.ts` now calls the actual Resend
  SDK (`resend` npm package, `^6.32.0`) instead of the old
  always-throws-then-dev-console-log stub. `EMAIL_PROVIDER_API_KEY` is set
  in `.env` (gitignored). Default `from` is Resend's shared test domain
  `onboarding@resend.dev` (works with no domain verification); override via
  `EMAIL_FROM_ADDRESS` once a real domain is verified.
  - **Known limitation (Resend test mode, not a bug):** until a sending
    domain is verified, Resend only accepts the account owner's own email
    (`abish18.dev@gmail.com`) as a recipient — sends to other addresses
    403/422. This is why some integration tests that email fake addresses
    (`dev@test.com`, `owner@example.com`) log a `[Resend API Error]` to
    stderr — it's caught and falls through to the existing dev-console-log
    fallback, so those tests still pass. Not a regression; will resolve
    itself once a real domain is verified (part of PRD §17's deferred
    "product/brand name" decision, probably).
- Live-verified end-to-end: ran a real `sendProposal` through the dev
  server against `abish18.dev@gmail.com` — `emailed: true`, real Resend
  send succeeded, and `getPublicProposal(token)` round-tripped correctly.
- Full regression: `tsc --noEmit` clean, `vitest run` — 173/173 passing.
- Committed and pushed as `0x12md10`.

## Iteration 16 — Real S3-compatible file storage (Cloudflare R2) — DONE

- Chose **Cloudflare R2** for the MVP: free tier (10 GB storage, 1M Class A /
  10M Class B ops/month, **zero egress fees**, no 12-month trial clock unlike
  AWS S3's free tier). Fully S3-compatible API — the wrapper is written
  against the generic `@aws-sdk/client-s3` interface, so switching to real
  AWS S3 (or Backblaze, DigitalOcean Spaces, ...) later is an env-var change
  only (`S3_ENDPOINT`/`S3_REGION`), no code change.
- `src/lib/storage/s3.ts` — `buildStorageKey`, `uploadObject`,
  `deleteObject`, `getSignedDownloadUrl` (signed, time-boxed GET url, 24h
  default TTL). Uses `forcePathStyle: true` — required for R2 and most
  non-AWS S3-compatible providers (virtual-hosted-style, the SDK default,
  doesn't resolve against them).
- `Deliverable` (handover packets) changed from `{ fileName, url }` (a raw
  URL string the owner typed in) to `{ fileName, storageKey }` stored in the
  DB; `SerializedDeliverable` (`{ fileName, storageKey, url }`) is resolved
  at read time with a **fresh signed url on every request** — the owner
  editor round-trips `storageKey` on save, the public `/handover/[token]`
  page gets `{ fileName, url }` only (storageKey is stripped — it's an
  internal object key, not meant to leak to an unauthenticated caller).
- New owner-only, tenant-scoped upload route:
  `POST /api/engagements/[id]/handover-packet/upload` (multipart form-data,
  50 MB cap) — uploads to R2 under
  `handover/{tenantId}/{engagementId}/{random}-{fileName}` and returns
  `{ fileName, storageKey }`. `handover-editor.tsx` now has a real file
  picker (uploads immediately on choose) instead of a free-text URL field.
- No Prisma migration needed — `deliverables` is already a JSON column.
- Live-verified directly against real R2 (not mocked): uploaded a real
  object, generated a signed url, fetched it via `curl`, confirmed the
  content round-tripped, then deleted it. Credentials are in `.env`
  (gitignored) — user's own Cloudflare account/bucket (`flowdesk`).
- Full regression: `tsc --noEmit` clean, `vitest run` — 173/173 passing
  (presigning is a local HMAC computation in the AWS SDK, no network call,
  so tests don't hit R2 even with real credentials loaded).
- **Not yet done:** credential handoff/MVP-to-production switch is deferred
  — this is explicitly the MVP/free-tier choice; user said to revisit
  providers once there are real users, no action needed now.

## Iteration 17 — WhatsApp Business API — CORE WIRING DONE, loose ends below

Provider decision made: **direct Meta Cloud API**, no BSP (Gupshup/360dialog)
— cost difference was negligible (~$0.0014/msg utility rate in India direct
vs ~$0.001/msg markup from Gupshup), so going direct avoids a third-party
dependency.

Blocked on 2026-10-03 (Meta "restricted from advertising" flag on the
Developer app-creation wizard), then **unblocked the same day** — Meta's
Account Quality review cleared faster than the ~3 day estimate. App
"flowdesk" created under the Asyniq business, test number provisioned.

**What's implemented and live-verified (real Graph API calls, not mocked):**
- `src/lib/integrations/whatsapp.ts` — `sendWhatsAppMessage()` posts a
  template message via `POST /{phone-number-id}/messages` (Graph API
  v21.0). Normalizes `Client.phone` (free-text, may have `+`/spaces/dashes)
  to Meta's required digits-only format.
- 7 message templates created and submitted via the Graph API
  (`/{WABA_ID}/message_templates`), one per client-facing "your X is ready"
  moment: `proposal_ready`, `invoice_ready`, `welcome_doc_ready`,
  `intake_form_request`, `followup_nudge_v2`, `feedback_request`,
  `handover_ready`. All UTILITY category, `en_US`, 2 body variables each
  (`{{1}}` client name, `{{2}}` link — except `followup_nudge_v2`'s
  `{{2}}` is the item description, e.g. "your proposal", matching
  `describeTarget()` in `src/services/followup/index.ts`, since a
  template's wording is fixed and can't carry the AI-drafted free text
  verbatim; email still gets the full personalized draft).
  **As of 2026-10-03, 5/7 are APPROVED** (`proposal_ready`, `invoice_ready`,
  `welcome_doc_ready`, `feedback_request`, `followup_nudge_v2`); **2 are
  still PENDING** (`handover_ready`, `intake_form_request`) — check
  `GET /{WABA_ID}/message_templates?fields=name,status` and expect approval
  within hours. Sending with a PENDING template throws, which (in
  non-production) falls back to email via the notifier below — not a hard
  failure, just silently prefers email for those two moments until approved.
  Note: a dangling template named exactly `followup_nudge` (no `_v2`) exists
  in Meta's system in a permanently-deleting state from a fixed typo during
  setup — harmless, just don't reuse that name.
- `prisma/schema.prisma` — `Tenant.notificationChannel` enum
  (`whatsapp_first` / `email_first`, default `email_first`) — the PRD §12
  "channel preference" setting. Migration:
  `prisma/migrations/20261003162032_whatsapp_channel_preference/`.
- `src/lib/integrations/notify.ts` — new `notifyClient()` shared by every
  send site: tries the tenant's preferred channel, falls back to the other
  only if the preferred one didn't actually send (no phone/email on file,
  or — in dev only — a provider error). **Production still throws on a
  preferred-channel provider error rather than silently falling back**,
  matching the pre-existing single-channel `sendEmail` error philosophy at
  every call site before this module existed — this was a deliberate choice
  to not invent new production fallback semantics without the user's
  sign-off; revisit once WhatsApp is actually live for real clients.
- Wired into all 6 "document ready" send functions (`sendProposal`,
  `sendInvoice`, `sendWelcomeDoc`, `sendIntakeForm`, `createFeedbackRequest`,
  `sendHandoverPacket`) and `reviewAndSendFollowUp` — each now returns an
  added `whatsapped: boolean` alongside the existing `emailed: boolean`.
  No existing caller/UI reads `whatsapped` yet (see TODOs).
- `NEXT_PUBLIC_APP_URL` env var added — WhatsApp is plain text and can't
  resolve a relative path the way an email client's browser context might;
  used to build absolute links for the WhatsApp template params.
- Tests: `tests/unit/notify.test.ts` (7 cases, mocked — preferred channel
  success, fallback on missing contact info, fallback on dev-mode provider
  error, production rethrow instead of fallback), `tests/unit/whatsapp.test.ts`
  (3 cases, mocked fetch — missing-config throw, phone normalization +
  request shape, Meta error passthrough), plus one integration assertion in
  `tests/integration/billing.test.ts` that `whatsapped` is `false` by
  default (no client phone on file). Full suite: **184/184 passing**,
  `tsc --noEmit` clean.
- Live-verified for real: sent a real template message through the actual
  `sendWhatsAppMessage()` code path (not curl) to a verified test number
  and got real delivery.

**TODOs — explicitly deferred, pick up later:**
1. **Settings UI toggle** for `Tenant.notificationChannel` doesn't exist
   yet — the field defaults to `email_first` and can currently only be
   changed via direct DB/Prisma Studio edit. Folds into the already-planned
   "Settings sub-items" work below (Razorpay/WhatsApp connection UI).
2. **Webhook not built** — `src/app/api/webhooks/whatsapp/route.ts` doesn't
   exist. Needed for delivery/read receipts and inbound replies; outbound
   sends (this iteration's scope) don't need it. Requires a public HTTPS
   URL (ngrok in dev) and a verify token.
3. **Still on the test number** (`+1 555 631 9323`, ≤5 verified recipients)
   — real client sends need the actual business WhatsApp number registered
   and a payment method added in Meta's "Production setup" checklist
   (steps left undone there: "Add payment", "Register your WhatsApp phone
   number" with the real number).
4. **2 templates still PENDING approval**: `handover_ready`,
   `intake_form_request` — check status, nothing else to do but wait.
5. **Email's own links are still relative paths** (`/p/${token}`, pre-
   existing gap from before this iteration, not something introduced here)
   — only the new WhatsApp path uses `NEXT_PUBLIC_APP_URL` to build an
   absolute link. Worth fixing email too once a real domain exists (ties
   to PRD §17's deferred product/brand-name decision).
6. **No owner-facing UI surfaces `whatsapped` yet** — e.g. the dashboard/
   engagement views that currently might show "emailed" status don't know
   about the new field. Check call sites if/when building that UI.
7. **Per-client WhatsApp opt-in isn't tracked** — PRD §12 says "where the
   client has opted in" but there's no `Client`-level consent flag, only
   the tenant-wide channel preference + whether a phone number is on file.
   Fine for v1/internal use; revisit before onboarding external tenants
   (Meta's own policies may require explicit opt-in tracking for template
   messages at scale).

## Iteration 18 — Settings sub-items — PARTIALLY DONE

**What's implemented and live-verified (real dev server + real dev DB, not just tests):**
- `src/services/settings/index.ts` extended: `getIntegrationStatus`
  (read-only Razorpay/WhatsApp/email "configured" flags from env presence),
  `listTeamMembers` / `inviteTeamMember` / `removeTeamMember`.
- `Tenant.notificationChannel` now editable from Settings (ties into
  iteration 17's WhatsApp-first/email-first channel preference) via
  `NotificationChannelForm` — previously only settable by direct DB edit.
- Team member management: list/add/remove `User` rows under the tenant.
  No invite-link flow needed — login is email+OTP
  (`src/app/api/auth/verify-otp/route.ts`), so a pre-created `User` row
  just logs in with the usual email code. Guards: can't remove yourself,
  can't remove the only remaining owner, refuses to add an email already
  registered under a *different* tenant (login resolves a user by email
  alone, not (tenantId, email) — see the service docstring for why that
  collision has to be refused rather than silently allowed). Owner-only for
  add/remove (403 for a `team_member` role); any member can view the list.
  Removing a member also revokes their active sessions.
- New routes: `GET /api/settings/integrations`,
  `GET`/`POST /api/settings/team-members`,
  `DELETE /api/settings/team-members/[id]`; `PUT /api/settings` extended
  to accept `notificationChannel`.
- New UI: `notification-channel-form.tsx`, `integrations-status.tsx`,
  `team-members-panel.tsx`, wired into `settings/page.tsx`.
- Tests: `tests/integration/settings.test.ts` (10 cases). Full suite:
  **195/195 passing**, `tsc --noEmit` clean, `next build` clean.
- Live-verified in the browser's place (curl against a real logged-in
  session on the dev server + real dev Postgres): fetched the rendered
  Settings page and confirmed all 4 new sections render; exercised every
  new endpoint for real — integration status, add/list/remove a team
  member, self-removal guard, last-owner guard, and switching the channel
  preference to `whatsapp_first` — then cleaned up the smoke-test tenant.

**Explicitly NOT done this iteration — see service module docstring and TODOs below:**
- **Razorpay/WhatsApp connection UI** is read-only status, not a live
  credential-entry form. Both providers are still single, platform-wide env
  vars (`RAZORPAY_KEY_ID`/`SECRET`, `WHATSAPP_PROVIDER_API_KEY`/etc.), not
  per-tenant — there's nothing per-tenant to store yet. Building real
  per-tenant credential storage (encryption at rest, `getRazorpayClient()`/
  `sendWhatsAppMessage()` switched to read from the tenant row instead of
  `process.env`) is real architecture work, and the PRD itself frames this
  as relevant once there are *outside* tenants — v1 is dogfooding on one
  real tenant (the founder's own business). Building it now would be
  speculative. Revisit when a second real tenant actually needs it.
- **Configurable templates/question-library seeds** not built at all — no
  "service type" concept exists anywhere in the schema (`Lead`/`Engagement`
  have no such field), so "seeds per service type" needs a product decision
  on what's actually configurable before there's anything to build. Ask the
  user for concrete scope before attempting this.

## Still next up, in the user's explicit stated order

1. **Testing gaps**: broader Playwright e2e coverage beyond `payment.spec.ts`,
   CI pipeline.
2. Deferred to the very end, only if/when the user asks:
   - **PRD §16** out-of-scope items.
   - **PRD §17** open questions: product/brand name, follow-up cadence
     tuning (currently PRD's proposed 2/5/9 default), external-tenant
     pricing model. (WhatsApp provider choice is now resolved: direct Meta
     Cloud API.)
   - Per-tenant Razorpay/WhatsApp credentials and configurable template
     seeds (see iteration 18's "explicitly NOT done" above) — only once
     there's a concrete second tenant or explicit product direction.

## Notes for whoever (human or Claude) picks this up next

- Don't re-derive the lifecycle state machine, tenant isolation pattern, or
  money-handling conventions from scratch — read `src/services/engagement/index.ts`'s
  top comment and `src/lib/tenant.ts`; they're the reference pattern every
  service follows.
- If `rtk gain`/`rtk` commands appear in shell history, that's the user's
  token-optimizing CLI proxy (see global `RTK.md`) — unrelated to this file.
- When starting a *new* session for the next iteration (recommended, to
  avoid replaying this whole history and burning tokens on re-reading long
  file dumps): just point it at this file, the PRD, and System Design doc.
  It should not need the original conversation transcript.
