/**
 * Shared shell for every public/client-facing page (proposal, invoice,
 * portal, e-sign, etc.) — no owner sidebar, single-column, mobile-first
 * per System Design §7 ("clients open this from their phones, often from
 * a WhatsApp link"). Just a small trust-marker header, not the owner app
 * chrome.
 */
import type { ReactNode } from "react";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-4 py-3">
        <span className="font-serif text-lg text-foreground">Flowdesk</span>
      </header>
      <main className="mx-auto w-full max-w-xl px-4 py-8">{children}</main>
    </div>
  );
}
