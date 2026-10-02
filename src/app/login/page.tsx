"use client";

/**
 * Email + OTP login (System Design §4). First-time email -> prompts for a
 * business name to bootstrap that email's Tenant (PRD §1 dogfooding step);
 * returning email -> straight to OTP entry and into the existing tenant.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

type Step = "email" | "otp" | "business-name";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function requestOtp() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("Couldn't send a code to that email.");
      return;
    }
    setStep("otp");
  }

  async function verifyOtp(withBusinessName?: string) {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, businessName: withBusinessName }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    if (data.needsBusinessName) {
      setStep("business-name");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main style={{ maxWidth: 360, margin: "4rem auto", fontFamily: "sans-serif" }}>
      <h1>Sign in</h1>

      {step === "email" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            requestOtp();
          }}
        >
          <input
            type="email"
            placeholder="you@business.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: 8, marginBottom: 8 }}
          />
          <button type="submit" disabled={submitting} style={{ width: "100%", padding: 8 }}>
            Send code
          </button>
        </form>
      )}

      {step === "otp" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            verifyOtp();
          }}
        >
          <p>Enter the 6-digit code sent to {email}.</p>
          <input
            inputMode="numeric"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            required
            style={{ width: "100%", padding: 8, marginBottom: 8 }}
          />
          <button type="submit" disabled={submitting} style={{ width: "100%", padding: 8 }}>
            Verify
          </button>
        </form>
      )}

      {step === "business-name" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            verifyOtp(businessName);
          }}
        >
          <p>First time here — what's your business called?</p>
          <input
            placeholder="Your business name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
            style={{ width: "100%", padding: 8, marginBottom: 8 }}
          />
          <button type="submit" disabled={submitting} style={{ width: "100%", padding: 8 }}>
            Create workspace
          </button>
        </form>
      )}

      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}
