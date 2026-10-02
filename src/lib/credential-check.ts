/**
 * Heuristic guard against credential-sharing through the Request for
 * Access checklist (PRD §10, System Design §4's hard "never store a raw
 * credential" boundary). Pure/dependency-free so it can run both
 * client-side (immediate feedback) and server-side (the actual boundary —
 * the client-side check alone is not trustworthy).
 *
 * This is deliberately a second line of defense: the real guarantee is
 * that AccessRequest has no free-text column for client input to land in
 * at all, so even a false negative here can't result in a stored credential.
 */
export function looksLikeCredential(text: string): boolean {
  const normalized = text.toLowerCase();

  if (/\b(password|passwd|pwd)\b/.test(normalized)) return true;
  if (/\blogin\s*[:=]/.test(normalized)) return true;
  if (/\bpass\s*[:=]/.test(normalized)) return true;

  // email-ish token followed by a separator and another token — the
  // "user@domain.com : something" shape of a pasted credential pair.
  if (/\S+@\S+\.\S+\s*[:|/=]\s*\S+/.test(text)) return true;

  return false;
}
