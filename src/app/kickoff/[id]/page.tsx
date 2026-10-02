/**
 * Public, no-login kickoff scheduling view (PRD §11).
 */
import { getPublicKickoffCall } from "@/services/kickoff";
import { SlotPicker } from "./slot-picker";

export default async function PublicKickoffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await getPublicKickoffCall(id);

  return (
    <main style={{ maxWidth: 600, margin: "2rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <h1>{call.businessName}</h1>
      <p>Kickoff call for {call.clientName}</p>

      {call.scheduledAt ? (
        <p>Scheduled for {new Date(call.scheduledAt).toLocaleString()}.</p>
      ) : (
        <SlotPicker callId={call.id} slots={call.proposedSlots} />
      )}

      {call.agenda && (
        <div>
          <h3>Agenda</h3>
          {call.agenda.map((section, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <strong>{section.title}</strong> ({section.durationMinutes} min)
              <ul>
                {section.talkingPoints.map((tp, j) => <li key={j}>{tp}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
