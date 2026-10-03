/**
 * Public, no-login handover packet view (PRD §14).
 */
import { getPublicHandoverPacket } from "@/services/feedback";
import { PublicShell } from "@/components/public-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default async function PublicHandoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const packet = await getPublicHandoverPacket(id);

  return (
    <PublicShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-serif text-2xl">{packet.businessName}</h1>
          <p className="text-sm text-muted-foreground">Project handover for {packet.clientName}</p>
        </div>

        <div className="whitespace-pre-wrap text-sm leading-relaxed">{packet.summary}</div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deliverables</CardTitle>
          </CardHeader>
          <CardContent>
            {packet.deliverables.length === 0 ? (
              <p className="text-sm text-muted-foreground">No files attached.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {packet.deliverables.map((d, i) => (
                  <li key={i}>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-sm text-accent-foreground hover:underline"
                    >
                      <FileText className="size-4" />
                      {d.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PublicShell>
  );
}
