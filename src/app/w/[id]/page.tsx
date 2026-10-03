/**
 * Public, no-login welcome doc view (PRD §8).
 */
import { getPublicWelcomeDoc } from "@/services/onboarding";
import { PublicShell } from "@/components/public-shell";
import { Card, CardContent } from "@/components/ui/card";

export default async function PublicWelcomeDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await getPublicWelcomeDoc(id);

  return (
    <PublicShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-serif text-2xl">{doc.businessName}</h1>
          <p className="text-sm text-muted-foreground">For {doc.clientName}</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{doc.content}</div>
          </CardContent>
        </Card>
      </div>
    </PublicShell>
  );
}
