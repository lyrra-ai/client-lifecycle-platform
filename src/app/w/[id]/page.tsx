/**
 * Public, no-login welcome doc view (PRD §8).
 */
import { getPublicWelcomeDoc } from "@/services/onboarding";

export default async function PublicWelcomeDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await getPublicWelcomeDoc(id);

  return (
    <main style={{ maxWidth: 600, margin: "2rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <h1>{doc.businessName}</h1>
      <p>For {doc.clientName}</p>
      <div style={{ whiteSpace: "pre-wrap" }}>{doc.content}</div>
    </main>
  );
}
