/**
 * Public, no-login handover packet view (PRD §14).
 */
import { getPublicHandoverPacket } from "@/services/feedback";

export default async function PublicHandoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const packet = await getPublicHandoverPacket(id);

  return (
    <main style={{ maxWidth: 600, margin: "2rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <h1>{packet.businessName}</h1>
      <p>Project handover for {packet.clientName}</p>

      <div style={{ whiteSpace: "pre-wrap" }}>{packet.summary}</div>

      <h3>Deliverables</h3>
      <ul>
        {packet.deliverables.map((d, i) => (
          <li key={i}><a href={d.url} target="_blank" rel="noreferrer">{d.fileName}</a></li>
        ))}
      </ul>
      {packet.deliverables.length === 0 && <p>No files attached.</p>}
    </main>
  );
}
