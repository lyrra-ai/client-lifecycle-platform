"use client";

/** PRD §15/§12: "channel preference (WhatsApp-first vs. email-first)". */
import { useState } from "react";

export function NotificationChannelForm({ initial }: { initial: "whatsapp_first" | "email_first" }) {
  const [channel, setChannel] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(value: "whatsapp_first" | "email_first") {
    setChannel(value);
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationChannel: value }),
    });
    setBusy(false);
    setMessage(res.ok ? "Saved." : "Couldn't save.");
  }

  return (
    <div style={{ maxWidth: 400, marginBottom: 24 }}>
      <label style={{ display: "block", marginBottom: 4 }}>
        <input
          type="radio"
          name="channel"
          checked={channel === "whatsapp_first"}
          disabled={busy}
          onChange={() => save("whatsapp_first")}
        />{" "}
        WhatsApp first, fall back to email
      </label>
      <label style={{ display: "block" }}>
        <input
          type="radio"
          name="channel"
          checked={channel === "email_first"}
          disabled={busy}
          onChange={() => save("email_first")}
        />{" "}
        Email first, fall back to WhatsApp
      </label>
      {message && <span style={{ marginLeft: 8 }}>{message}</span>}
    </div>
  );
}
