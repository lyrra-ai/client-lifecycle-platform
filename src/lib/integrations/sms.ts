/**
 * OTP/SMS provider (System Design §4, §7) — carries the e-sign phone OTP.
 * No tenantId here: the OTP mechanism is pre-auth / public-facing by
 * nature (same reasoning as the login-email OTP in src/lib/otp.ts).
 */
export interface SendSmsParams {
  to: string;
  message: string;
}

export async function sendSms(params: SendSmsParams): Promise<void> {
  if (!process.env.OTP_SMS_PROVIDER_API_KEY) {
    throw new Error("OTP_SMS_PROVIDER_API_KEY not set — SMS sending not yet configured.");
  }
  throw new Error(`sendSms() not yet implemented (to: ${params.to}).`);
}
