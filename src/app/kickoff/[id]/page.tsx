/**
 * Public, no-login kickoff scheduling view (PRD §11).
 */
import { getPublicKickoffCall } from "@/services/kickoff";
import { SlotPicker } from "./slot-picker";
import { PublicShell } from "@/components/public-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PublicKickoffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await getPublicKickoffCall(id);

  return (
    <PublicShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-serif text-2xl">{call.businessName}</h1>
          <p className="text-sm text-muted-foreground">Kickoff call for {call.clientName}</p>
        </div>

        {call.scheduledAt ? (
          <p className="text-sm">Scheduled for {new Date(call.scheduledAt).toLocaleString()}.</p>
        ) : (
          <SlotPicker callId={call.id} slots={call.proposedSlots} />
        )}

        {call.agenda && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agenda</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {call.agenda.map((section, i) => (
                <div key={i}>
                  <p className="text-sm font-medium">
                    {section.title} <span className="text-muted-foreground">({section.durationMinutes} min)</span>
                  </p>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground">
                    {section.talkingPoints.map((tp, j) => (
                      <li key={j}>{tp}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </PublicShell>
  );
}
