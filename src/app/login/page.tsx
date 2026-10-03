"use client";

/**
 * Email + OTP login (System Design §4). First-time email -> prompts for a
 * business name to bootstrap that email's Tenant (PRD §1 dogfooding step);
 * returning email -> straight to OTP entry and into the existing tenant.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Flowdesk</CardTitle>
          <CardDescription>
            {step === "email" && "Sign in to your workspace"}
            {step === "otp" && `Enter the 6-digit code sent to ${email}`}
            {step === "business-name" && "First time here — what's your business called?"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "email" && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                requestOtp();
              }}
            >
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@business.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button type="submit" disabled={submitting}>
                Send code
              </Button>
            </form>
          )}

          {step === "otp" && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                verifyOtp();
              }}
            >
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                inputMode="numeric"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                required
              />
              <Button type="submit" disabled={submitting}>
                Verify
              </Button>
            </form>
          )}

          {step === "business-name" && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                verifyOtp(businessName);
              }}
            >
              <Label htmlFor="businessName">Business name</Label>
              <Input
                id="businessName"
                placeholder="Your business name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
              />
              <Button type="submit" disabled={submitting}>
                Create workspace
              </Button>
            </form>
          )}

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
