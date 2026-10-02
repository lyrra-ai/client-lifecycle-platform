/**
 * Client-facing proposal view (PRD §4) — no login required, magic link.
 * First open flips sent -> viewed; an expired validUntil flips to expired.
 * Accept hands off to E-sign (PRD §5).
 */
import { getPublicProposal } from "@/services/proposal";
import { DeclineButton } from "./decline-button";

function formatMinor(totalMinor: string, currency: string): string {
  return `${currency} ${(Number(totalMinor) / 100).toFixed(2)}`;
}

export default async function PublicProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposal = await getPublicProposal(id);

  // getPublicProposal always flips "sent" -> "viewed" on read, so "viewed"
  // is the only actionable status this page will ever see.
  const actionable = proposal.status === "viewed";

  return (
    <main style={{ maxWidth: 600, margin: "2rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <h1>{proposal.businessName}</h1>
      <p>Prepared for {proposal.clientName}</p>

      {proposal.coverNote && <p>{proposal.coverNote}</p>}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Description</th>
            <th align="left">Qty</th>
            <th align="left">Unit price</th>
            <th align="left">Currency</th>
          </tr>
        </thead>
        <tbody>
          {proposal.lineItems.map((item) => (
            <tr key={item.id}>
              <td>{item.description}</td>
              <td>{item.qty}</td>
              <td>{item.unitPrice.toFixed(2)}</td>
              <td>{item.currency}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Total</h3>
      <ul>
        {Object.entries(proposal.totals).map(([currency, minor]) => (
          <li key={currency}>{formatMinor(minor, currency)}</li>
        ))}
      </ul>

      {proposal.validUntil && (
        <p>Valid until {new Date(proposal.validUntil).toLocaleDateString()}</p>
      )}

      {actionable ? (
        <div>
          <a href={`/esign/${proposal.id}`}>
            <button>Accept &amp; Sign</button>
          </a>{" "}
          <DeclineButton proposalId={proposal.id} />
        </div>
      ) : proposal.status === "accepted" ? (
        <p><em>This proposal has been signed. Thank you!</em></p>
      ) : (
        <p><em>This proposal is {proposal.status} and can no longer be acted on.</em></p>
      )}
    </main>
  );
}
