/**
 * Client-facing proposal view (PRD §4) — no login required, magic link.
 * First open flips sent -> viewed; an expired validUntil flips to expired.
 * Accept hands off to E-sign (PRD §5).
 */
import { getPublicProposal } from "@/services/proposal";
import { DeclineButton } from "./decline-button";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    <PublicShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-serif text-2xl">{proposal.businessName}</h1>
          <p className="text-sm text-muted-foreground">Prepared for {proposal.clientName}</p>
        </div>

        {proposal.coverNote && <p className="whitespace-pre-wrap text-sm">{proposal.coverNote}</p>}

        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit price</TableHead>
                  <TableHead>Currency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposal.lineItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{item.qty}</TableCell>
                    <TableCell className="font-mono">{item.unitPrice.toFixed(2)}</TableCell>
                    <TableCell>{item.currency}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 font-mono text-lg">
              {Object.entries(proposal.totals).map(([currency, minor]) => (
                <li key={currency}>{formatMinor(minor, currency)}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {proposal.validUntil && (
          <p className="text-sm text-muted-foreground">Valid until {new Date(proposal.validUntil).toLocaleDateString()}</p>
        )}

        {actionable ? (
          <div className="flex gap-2">
            <Button asChild>
              <a href={`/esign/${proposal.id}`}>Accept &amp; Sign</a>
            </Button>
            <DeclineButton proposalId={proposal.id} />
          </div>
        ) : proposal.status === "accepted" ? (
          <p className="text-sm text-success">
            <em>This proposal has been signed. Thank you!</em>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            <em>This proposal is {proposal.status} and can no longer be acted on.</em>
          </p>
        )}
      </div>
    </PublicShell>
  );
}
