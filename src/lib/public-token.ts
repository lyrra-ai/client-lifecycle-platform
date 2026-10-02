import { randomBytes } from "crypto";

/**
 * Opaque, unguessable identifier for every client-facing link — set on
 * each publicly-exposed entity's `publicToken` column at creation time.
 * The internal database id is never exposed in a URL; this is also what
 * makes rotating/revoking a leaked link possible later without touching
 * the underlying record's id or its internal relations.
 */
export function generatePublicToken(): string {
  return randomBytes(24).toString("base64url"); // 32 URL-safe characters
}
