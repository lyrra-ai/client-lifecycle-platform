import { getSession, requireTenantContext } from "@/lib/auth";
import { getInvoiceForOwner } from "@/services/billing";
import { InvoiceEditor } from "./invoice-editor";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return null;

  const { id } = await params;
  const invoice = await getInvoiceForOwner(requireTenantContext(session), id);

  return <InvoiceEditor initial={invoice} />;
}
