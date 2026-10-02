# Progress Log

Purpose: let a fresh Claude Code session pick up this project cheaply —
without replaying the full conversation history. Read this file, the PRD
(`PRD & Features.md`), and `System Design.md` first; they're the source of
truth for *what* and *why*. This file tracks *sequencing decisions* and
*in-flight state* that aren't derivable from code or git history alone.

## Standing rules for this project (don't re-derive, just follow)

- Git commits: author as `0x12md10`, **no** `Co-Authored-By: Claude` line
  (explicit user override of the default attribution).
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

## Next up, in the user's explicit stated order

1. **WhatsApp Business API** (3rd/last deferred integration). User flagged:
   expect provider verification lead time — this will likely need the user
   to go create a Business API account/app before it can be wired up, so
   flag that early rather than discovering it mid-iteration.
2. **Settings sub-items**: team member management UI, Razorpay/WhatsApp
   connection UI, configurable templates/question-library seeds.
3. **Testing gaps**: broader Playwright e2e coverage beyond `payment.spec.ts`,
   CI pipeline.
4. Deferred to the very end, only if/when the user asks:
   - **PRD §16** out-of-scope items.
   - **PRD §17** open questions: product/brand name, follow-up cadence
     tuning (currently PRD's proposed 2/5/9 default), WhatsApp provider
     choice, external-tenant pricing model.

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
