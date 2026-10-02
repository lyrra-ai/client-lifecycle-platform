import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/lib/auth";

/**
 * Guards every owner-side page (dashboard, engagements, settings) behind a
 * real session (System Design §4) — no page in this group may render
 * without a resolved TenantContext.
 */
export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return <>{children}</>;
}
