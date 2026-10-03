"use client";

/** PRD §15/§12: "channel preference (WhatsApp-first vs. email-first)". */
import { useState } from "react";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

export function NotificationChannelForm({ initial }: { initial: "whatsapp_first" | "email_first" }) {
  const [channel, setChannel] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function save(value: string) {
    setChannel(value as "whatsapp_first" | "email_first");
    setBusy(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationChannel: value }),
    });
    setBusy(false);
    toast(res.ok ? "Saved." : "Couldn't save.");
  }

  return (
    <RadioGroup value={channel} onValueChange={save} disabled={busy} className="gap-3">
      <Label className="flex items-center gap-2 font-normal">
        <RadioGroupItem value="whatsapp_first" />
        WhatsApp first, fall back to email
      </Label>
      <Label className="flex items-center gap-2 font-normal">
        <RadioGroupItem value="email_first" />
        Email first, fall back to WhatsApp
      </Label>
    </RadioGroup>
  );
}
