import { execSync } from "child_process";

const TEST_DATABASE_URL = "postgresql://clp:clp@localhost:55433/client_lifecycle_platform_test";

/**
 * Runs once before the whole Vitest run: applies every migration to the
 * dedicated test database (docker-compose's postgres-test). Assumes that
 * container is already up — `npm test` doesn't start Docker itself, same
 * as `npm run dev` doesn't; see README's Testing section.
 */
export default function globalSetup() {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
