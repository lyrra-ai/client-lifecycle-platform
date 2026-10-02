import { defineConfig } from "@playwright/test";

/**
 * E2E layer (README's Testing section) — real browser against the real dev
 * server and dev database, exercising flows the Vitest layers can't: actual
 * third-party UI (Razorpay Checkout.js), real multi-step client-side JS.
 *
 * Not run as part of `npm test` — these hit real external services
 * (Razorpay's test API) and a running dev server, so they're opt-in via
 * `npm run test:e2e`, same as the README documents.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 90_000,
  fullyParallel: false, // specs seed their own data against the one dev DB
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
  },
});
