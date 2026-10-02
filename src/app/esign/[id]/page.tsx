/**
 * E-sign (PRD §5) — no login required, reached from the public proposal
 * view's "Accept & Sign" link.
 */
import { getEsignContext } from "@/services/proposal/esign";
import { EsignFlow } from "./esign-flow";

export default async function EsignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getEsignContext(id);

  return (
    <main style={{ maxWidth: 480, margin: "2rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <h1>Sign &amp; Accept</h1>
      <EsignFlow context={context} />
    </main>
  );
}
