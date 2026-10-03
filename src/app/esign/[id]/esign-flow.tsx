"use client";

/**
 * E-sign (PRD §5) — signer details -> OTP -> immutable confirmation.
 * Mirrors the login OTP flow's step shape (src/app/login/page.tsx) since
 * it's the same underlying mechanism (System Design §4).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    return (
      <p className="text-sm text-muted-foreground">
        <em>This proposal can no longer be signed here.</em>
      </p>
    );
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
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-xl text-success">Signed</h2>
        <p className="text-sm">
          Signed by {signerName} ({signerPhone})
        </p>
        <p className="text-sm text-muted-foreground">
          Verified at {signedAt ? new Date(signedAt).toLocaleString() : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {step === "details" && (
        <form onSubmit={requestCode} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signerName">Your name</Label>
            <Input
              id="signerName"
              placeholder="Your name"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signerPhone">Your phone number</Label>
            <Input
              id="signerPhone"
              placeholder="Your phone number"
              value={signerPhone}
              onChange={(e) => setSignerPhone(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={submitting} className="self-start">
            Send code
          </Button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to {signerPhone}.</p>
          <Input
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            className="w-32"
          />
          <Button type="submit" disabled={submitting} className="self-start">
            Verify &amp; sign
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
