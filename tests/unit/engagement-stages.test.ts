import { describe, it, expect } from "vitest";
import { AUTOMATIC_NEXT_STAGE } from "@/services/engagement";

describe("AUTOMATIC_NEXT_STAGE", () => {
  it("matches the exact lifecycle order from PRD §2 / System Design §3.1", () => {
    const expectedOrder = [
      "lead",
      "proposal_sent",
      "proposal_accepted",
      "deposit_invoiced",
      "deposit_paid",
      "onboarding",
      "kickoff_scheduled",
      "kickoff_done",
      "in_delivery",
      "feedback_requested",
      "handed_over",
      "closed",
    ];

    // Walk the map from "lead" and confirm it visits every stage in order,
    // with no skips and no detours — this is the single most load-bearing
    // piece of state in the whole product (System Design §1 principle 2).
    let current = expectedOrder[0];
    for (const expectedNext of expectedOrder.slice(1)) {
      expect(AUTOMATIC_NEXT_STAGE[current as never]).toBe(expectedNext);
      current = expectedNext;
    }

    // "closed" is terminal — nothing automatically follows it.
    expect(AUTOMATIC_NEXT_STAGE["closed" as never]).toBeUndefined();
  });
});
