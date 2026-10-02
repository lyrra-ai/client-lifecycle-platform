import { getQueue, JOBS } from "./index";
import { reconcilePendingInvoices } from "@/services/billing";
import { processDueFollowUps } from "@/services/followup";

/**
 * Standalone worker entry point (`npm run worker`).
 *
 * v1 runs this in the same deployable as the Next.js app (System Design
 * §2's "why one database, one deployable") — this file is still separate
 * so the Follow-up Engine / webhook-retry work can later be split into its
 * own process without a rewrite, per that section's explicit intent.
 */
async function main() {
  const boss = await getQueue();

  boss.work(JOBS.FOLLOW_UP_NUDGE, async (jobs) => {
    for (const job of jobs) {
      const result = await processDueFollowUps();
      console.log(`follow-up nudge job ${job.id}: checked ${result.checked}, drafted ${result.drafted}`);
    }
  });

  boss.work(JOBS.RAZORPAY_RECONCILE, async (jobs) => {
    for (const job of jobs) {
      const result = await reconcilePendingInvoices();
      console.log(`razorpay reconcile job ${job.id}: checked ${result.checked}, recorded ${result.recorded}`);
    }
  });

  // Safety-net poll every 15 minutes — a dropped webhook is the one
  // failure mode System Design §7 calls non-negotiable to catch.
  await boss.schedule(JOBS.RAZORPAY_RECONCILE, "*/15 * * * *", {});

  // Hourly is enough granularity for a day-2/5/9 cadence (System Design §6)
  // — drafts sit ready well before the owner would realistically check.
  await boss.schedule(JOBS.FOLLOW_UP_NUDGE, "0 * * * *", {});

  console.log("Job queue worker started.");
}

main().catch((error) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});
