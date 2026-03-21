export type AllocationSplitInput = {
    partyId: string;
    splitPercent: number;
  };
  
  export type AllocationLineResult = {
    partyId: string;
    splitPercent: number;
    allocatedAmount: number;
  };
  
  function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }
  
  export function calculateAllocationLines(params: {
    sourceAmount: number;
    splits: AllocationSplitInput[];
  }): AllocationLineResult[] {
    const { sourceAmount, splits } = params;
  
    if (!Number.isFinite(sourceAmount)) {
      throw new Error("sourceAmount must be finite");
    }
  
    if (splits.length === 0) {
      throw new Error("No splits provided");
    }
  
    const splitSum = splits.reduce((sum, split) => sum + split.splitPercent, 0);
  
    if (Math.abs(splitSum - 100) > 0.0001) {
      throw new Error(`Split sum must equal 100. Got ${splitSum}`);
    }
  
    const raw = splits.map((split) => ({
      partyId: split.partyId,
      splitPercent: split.splitPercent,
      allocatedAmount: roundMoney(sourceAmount * (split.splitPercent / 100)),
    }));
  
    const roundedSum = raw.reduce((sum, line) => sum + line.allocatedAmount, 0);
    const diff = roundMoney(sourceAmount - roundedSum);
  
    if (diff !== 0) {
      const last = raw[raw.length - 1];
      last.allocatedAmount = roundMoney(last.allocatedAmount + diff);
    }
  
    return raw;
  }