/**
 * E-sign (PRD §5) — no login required, reached from the public proposal
 * view's "Accept & Sign" link.
 */
import { getEsignContext } from "@/services/proposal/esign";
import { EsignFlow } from "./esign-flow";
import { PublicShell } from "@/components/public-shell";

export default async function EsignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getEsignContext(id);

  return (
    <PublicShell>
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-2xl">Sign &amp; Accept</h1>
        <EsignFlow context={context} />
      </div>
    </PublicShell>
  );
}
