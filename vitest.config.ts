import { defineConfig } from "vitest/config";
import path from "path";

// Points every test run at the dedicated test Postgres instance
// (docker-compose's postgres-test, port 55433) — set here, before any test
// file (and therefore before src/lib/db.ts's PrismaClient singleton) loads,
// so tests never touch the dev database defined in .env.
// Vitest already sets NODE_ENV=test by default (which otp.ts's dev-fallback
// logging also treats as "not production") — only DATABASE_URL needs to be
// pointed at the test instance here.
process.env.DATABASE_URL = "postgresql://clp:clp@localhost:55433/client_lifecycle_platform_test";

export default defineConfig({
  test: {
    environment: "node",
    // tests/e2e is Playwright's (different test runner, run via
    // `npm run test:e2e`) — Vitest's default glob would otherwise also
    // pick up its *.spec.ts files and fail on Playwright's `test` global.
    exclude: ["**/node_modules/**", "tests/e2e/**"],
    globalSetup: ["./tests/setup/global-setup.ts"],
    setupFiles: ["./tests/setup/reset-db.ts"],
    testTimeout: 15_000,
    hookTimeout: 20_000,
    // All integration tests share one physical Postgres (docker-compose's
    // postgres-test) and reset it via TRUNCATE between tests — running test
    // files in parallel lets one file's truncate wipe rows another file is
    // mid-test with. Serial execution trades some wall-clock time for that
    // correctness; worth it at this suite's size.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
