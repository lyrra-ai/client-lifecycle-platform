import { getQueue, JOBS } from "./index";

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
    // TODO: load FollowUpTask, call AIGateway.generate(task: "followup_message"),
    // write the draft for owner review (System Design §6). Never auto-send.
    for (const job of jobs) console.log("follow-up nudge job received", job.id);
  });

  boss.work(JOBS.RAZORPAY_RECONCILE, async (jobs) => {
    // TODO: reconciliation poll against Razorpay's API — safety net for a
    // dropped webhook (PRD §7 edge cases).
    for (const job of jobs) console.log("razorpay reconcile job received", job.id);
  });

  console.log("Job queue worker started.");
}

main().catch((error) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});
