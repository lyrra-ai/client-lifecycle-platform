import PgBoss from "pg-boss";

/**
 * The Job Queue is load-bearing (System Design §2). Every scheduled or
 * async action — a follow-up nudge, an AI draft generation, a WhatsApp
 * send, a Razorpay webhook retry — goes through this one Postgres-backed
 * queue. No Redis/separate infra for v1.
 */

let bossInstance: PgBoss | null = null;

export async function getQueue(): Promise<PgBoss> {
  if (bossInstance) return bossInstance;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL not set — the job queue shares the app's Postgres instance.");
  }

  const boss = new PgBoss(connectionString);
  boss.on("error", (error) => console.error("pg-boss error:", error));
  await boss.start();
  bossInstance = boss;
  return boss;
}

// Job names — one per queue-driven workflow (System Design §6 and §2).
export const JOBS = {
  FOLLOW_UP_NUDGE: "follow-up.nudge",
  RAZORPAY_WEBHOOK_RETRY: "razorpay.webhook-retry",
  RAZORPAY_RECONCILE: "razorpay.reconcile", // safety-net poll, System Design §7 / PRD §7
  AI_DRAFT_GENERATE: "ai.draft-generate",
  WHATSAPP_SEND: "notify.whatsapp-send",
  EMAIL_SEND: "notify.email-send",
} as const;
