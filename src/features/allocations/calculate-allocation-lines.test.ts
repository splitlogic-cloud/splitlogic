import { describe, expect, it } from "vitest";
import { calculateAllocationLines } from "./calculate-allocation-lines";

describe("calculateAllocationLines", () => {
  it("splits exact 100%", () => {
    const result = calculateAllocationLines({
      sourceAmount: 100,
      splits: [
        { partyId: "p1", splitPercent: 50 },
        { partyId: "p2", splitPercent: 50 },
      ],
    });

    expect(result).toEqual([
      { partyId: "p1", splitPercent: 50, allocatedAmount: 50 },
      { partyId: "p2", splitPercent: 50, allocatedAmount: 50 },
    ]);
  });

  it("handles rounding and fixes diff on last line", () => {
    const result = calculateAllocationLines({
      sourceAmount: 100,
      splits: [
        { partyId: "p1", splitPercent: 33.33 },
        { partyId: "p2", splitPercent: 33.33 },
        { partyId: "p3", splitPercent: 33.34 },
      ],
    });

    const total = result.reduce((sum, row) => sum + row.allocatedAmount, 0);
    expect(total).toBe(100);
  });

  it("throws when split sum is not 100", () => {
    expect(() =>
      calculateAllocationLines({
        sourceAmount: 100,
        splits: [
          { partyId: "p1", splitPercent: 60 },
          { partyId: "p2", splitPercent: 30 },
        ],
      }),
    ).toThrow();
  });
});