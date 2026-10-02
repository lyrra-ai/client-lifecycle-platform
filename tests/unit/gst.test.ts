import { describe, it, expect } from "vitest";
import { computeGstBreakup } from "@/services/billing";

describe("computeGstBreakup", () => {
  it("splits into CGST+SGST (9% each) when tenant and client are in the same state", () => {
    const breakup = computeGstBreakup(1_000_000n, "Karnataka", "Karnataka");

    expect(breakup).toEqual({ cgst: "90000", sgst: "90000", hsnSac: "9983" });
  });

  it("charges IGST (18%) when tenant and client are in different states", () => {
    const breakup = computeGstBreakup(1_000_000n, "Karnataka", "Maharashtra");

    expect(breakup).toEqual({ igst: "180000", hsnSac: "9983" });
  });

  it("is case/whitespace-insensitive when comparing states", () => {
    const breakup = computeGstBreakup(1_000_000n, "  karnataka ", "KARNATAKA");

    expect(breakup).toHaveProperty("cgst");
    expect(breakup).not.toHaveProperty("igst");
  });

  it("returns null (never guesses) when either state is unknown", () => {
    expect(computeGstBreakup(1_000_000n, null, "Karnataka")).toBeNull();
    expect(computeGstBreakup(1_000_000n, "Karnataka", null)).toBeNull();
    expect(computeGstBreakup(1_000_000n, null, null)).toBeNull();
  });

  it("rounds to the nearest minor unit with no float drift", () => {
    const breakup = computeGstBreakup(999n, "Karnataka", "Karnataka");
    // 999 * 9% = 89.91 -> rounds to 90 each half
    expect(breakup).toEqual({ cgst: "90", sgst: "90", hsnSac: "9983" });
  });
});
