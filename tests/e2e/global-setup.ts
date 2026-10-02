import { readFileSync } from "fs";
import { join } from "path";

/**
 * Loads .env into process.env before any spec imports our services —
 * Playwright doesn't do this itself, and these specs need DATABASE_URL
 * (pointed at the real dev DB, not the Vitest test DB) plus the real
 * Razorpay test credentials to seed data and hit their live test API.
 */
export default function globalSetup() {
  const envPath = join(__dirname, "../../.env");
  const content = readFileSync(envPath, "utf8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
    if (!process.env[key]) process.env[key] = value;
  }
}
