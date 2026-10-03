/**
 * Shared "preferred channel, with fallback" notifier (PRD §12 / "channel
 * preference (WhatsApp-first vs. email-first)" per-tenant setting). Every
 * client-facing "your X is ready" moment goes through here instead of
 * calling sendEmail directly, so a missing phone/email or a provider
 * failure on the preferred channel falls back to the other one rather than
 * the notification silently being lost.
 *
 * Mirrors the existing per-channel error philosophy (dev: log and continue;
 * production: rethrow) — in production a provider error on the preferred
 * channel still throws rather than silently falling back, same as every
 * sendEmail call site already did before this module existed.
 */
import { sendEmail } from "@/lib/integrations/email";
import { sendWhatsAppMessage } from "@/lib/integrations/whatsapp";
import type { NotificationChannel } from "@prisma/client";

export interface NotifyClientParams {
  tenantId: string;
  channelPreference: NotificationChannel;
  clientPhone: string | null | undefined;
  clientEmail: string | null | undefined;
  whatsapp: { templateName: string; templateParams: string[] };
  email: { subject: string; html: string };
  /** Label used in the dev-mode console.log fallback, e.g. "proposal link". */
  devLabel: string;
}

export interface NotifyResult {
  emailed: boolean;
  whatsapped: boolean;
}

async function tryWhatsApp(params: NotifyClientParams): Promise<boolean> {
  if (!params.clientPhone) return false;
  try {
    await sendWhatsAppMessage({
      tenantId: params.tenantId,
      toPhone: params.clientPhone,
      templateName: params.whatsapp.templateName,
      templateParams: params.whatsapp.templateParams,
    });
    return true;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[dev] WhatsApp send failed for ${params.devLabel} (${params.clientPhone}): ${(err as Error).message}`);
      return false;
    }
    throw err;
  }
}

async function tryEmail(params: NotifyClientParams): Promise<boolean> {
  if (!params.clientEmail) return false;
  try {
    await sendEmail({
      tenantId: params.tenantId,
      to: params.clientEmail,
      subject: params.email.subject,
      html: params.email.html,
    });
    return true;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[dev] email send failed for ${params.devLabel} (${params.clientEmail}): ${(err as Error).message}`);
      return false;
    }
    throw err;
  }
}

/** Tries the tenant's preferred channel first; falls back to the other only if the first one didn't send. */
export async function notifyClient(params: NotifyClientParams): Promise<NotifyResult> {
  if (params.channelPreference === "whatsapp_first") {
    const whatsapped = await tryWhatsApp(params);
    if (whatsapped) return { whatsapped: true, emailed: false };
    return { whatsapped: false, emailed: await tryEmail(params) };
  }

  const emailed = await tryEmail(params);
  if (emailed) return { whatsapped: false, emailed: true };
  return { whatsapped: await tryWhatsApp(params), emailed: false };
}
