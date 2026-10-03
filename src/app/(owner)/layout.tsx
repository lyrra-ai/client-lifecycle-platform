import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession, requireTenantContext } from "@/lib/auth";
import { getTenantSettings } from "@/services/settings";
import { prisma } from "@/lib/db";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";

/**
 * Guards every owner-side page (dashboard, engagements, settings) behind a
 * real session (System Design §4) and provides the shared app shell
 * (sidebar nav + top bar) — previously this layout was just the auth
 * guard with no navigation between pages at all.
 */
export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = requireTenantContext(session);
  const [settings, user] = await Promise.all([
    getTenantSettings(ctx),
    prisma.user.findUniqueOrThrow({ where: { id: session.userId }, select: { email: true } }),
  ]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppTopbar businessName={settings.businessName} userEmail={user.email} />
        <div className="flex-1 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
