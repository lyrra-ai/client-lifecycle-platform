import type { Metadata } from "next";
import type { ReactNode } from "react";

// Product/brand name is not yet chosen (PRD §17 open questions) — no
// placeholder name is hard-coded into user-facing strings here.
export const metadata: Metadata = {
  title: "Client Lifecycle Platform",
  description: "Proposal through handover, in one pipeline.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
