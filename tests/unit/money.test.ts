import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { toMinorUnits, lineTotalMinor, computeTotals } from "@/services/proposal";

describe("toMinorUnits", () => {
  it("converts whole rupees/dollars to paise/cents", () => {
    expect(toMinorUnits(500)).toBe(50000n);
  });

  it("handles fractional amounts without float drift", () => {
    // 19.99 * 100 must be exactly 1999, not 1998.9999999999998 (classic
    // float bug) — this is the whole reason PRD §4 mandates minor-unit storage.
    expect(toMinorUnits(19.99)).toBe(1999n);
  });

  it("rounds to the nearest minor unit", () => {
    expect(toMinorUnits(0.005)).toBe(1n); // 0.5 paise rounds up
  });
});

describe("lineTotalMinor", () => {
  it("multiplies qty by unit price in minor units", () => {
    expect(lineTotalMinor({ qty: new Prisma.Decimal(3), unitPriceMinor: 1000n })).toBe(3000n);
  });

  it("handles fractional qty (e.g. billed hours) without float drift", () => {
    expect(lineTotalMinor({ qty: new Prisma.Decimal("1.5"), unitPriceMinor: 10000n })).toBe(15000n);
  });
});

describe("computeTotals", () => {
  it("sums line items grouped by currency, keeping currencies separate", () => {
    const totals = computeTotals([
      { qty: new Prisma.Decimal(1), unitPriceMinor: 5_000_000n, currency: "INR" },
      { qty: new Prisma.Decimal(1), unitPriceMinor: 10_000n, currency: "USD" },
      { qty: new Prisma.Decimal(2), unitPriceMinor: 1_000_000n, currency: "INR" },
    ]);

    expect(totals).toEqual({ INR: "7000000", USD: "10000" });
  });

  it("returns an empty object for no line items", () => {
    expect(computeTotals([])).toEqual({});
  });
});
