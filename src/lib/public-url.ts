/**
 * Builds an absolute URL for a public-facing path. Email and WhatsApp
 * messages have no "current page" to resolve a relative URL against (unlike
 * a web page) — a bare `/p/${token}` link is broken in an email client, so
 * every outbound message embeds the absolute form instead. The relative
 * path is still correct for same-origin use (e.g. an owner-UI page linking
 * to its own public view) — only outbound messages need this.
 */
export function absolutePublicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${path}`;
}
