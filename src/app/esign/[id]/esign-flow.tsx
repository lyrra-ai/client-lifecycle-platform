"use client";

/**
 * E-sign (PRD §5) — signer details -> OTP -> immutable confirmation.
 * Mirrors the login OTP flow's step shape (src/app/login/page.tsx) since
 * it's the same underlying mechanism (System Design §4).
 */
import { useState } from "react";

type Step = "details" | "otp" | "done";

export interface EsignContext {
  proposalId: string;
  signable: boolean;
  clientName: string;
  clientPhone: string | null;
}

export function EsignFlow({ context }: { context: EsignContext }) {
  const [step, setStep] = useState<Step>("details");
  const [signerName, setSignerName] = useState(context.clientName);
  const [signerPhone, setSignerPhone] = useState(context.clientPhone ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);

  if (!context.signable) {
    return <p><em>This proposal can no longer be signed here.</em></p>;
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/public-esign/${context.proposalId}/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signerPhone }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't send a code.");
      return;
    }
    setStep("otp");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/public-esign/${context.proposalId}/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signerName, signerPhone, code }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't verify that code.");
      return;
    }
    setSignedAt(data.esignEvent.signedAt);
    setStep("done");
  }

  if (step === "done") {
    return (
      <div>
        <h2>Signed</h2>
        <p>Signed by {signerName} ({signerPhone})</p>
        <p>Verified at {signedAt ? new Date(signedAt).toLocaleString() : ""}</p>
      </div>
    );
  }

  return (
    <div>
      {step === "details" && (
        <form onSubmit={requestCode}>
          <input
            placeholder="Your name"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginBottom: 8, padding: 8 }}
          />
          <input
            placeholder="Your phone number"
            value={signerPhone}
            onChange={(e) => setSignerPhone(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginBottom: 8, padding: 8 }}
          />
          <button type="submit" disabled={submitting}>Send code</button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={verify}>
          <p>Enter the 6-digit code sent to {signerPhone}.</p>
          <input
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginBottom: 8, padding: 8 }}
          />
          <button type="submit" disabled={submitting}>Verify &amp; sign</button>
        </form>
      )}

      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </div>
  );
}
