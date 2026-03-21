import { describe, expect, it } from "vitest";
import { canonicalizeImportRow } from "./canonicalize-import-row";

describe("canonicalizeImportRow", () => {
  it("parses a valid row", () => {
    const result = canonicalizeImportRow(
      {
        "ACCOUNT CURRENCY": "sek",
        "NET SHARE ACCOUNT CURRENCY": "123,45",
        "Track Title": "My Song",
        ISRC: "SEABC1234567",
      },
      "spotify",
    );

    expect(result.currency).toBe("SEK");
    expect(result.netAmount).toBe("123.45");
    expect(result.sourceWorkRef).toBe("SEABC1234567");
    expect(result.rowStatus).toBe("parsed");
    expect(result.errorCodes).toEqual([]);
  });

  it("marks row invalid when currency is missing", () => {
    const result = canonicalizeImportRow(
      {
        "NET SHARE ACCOUNT CURRENCY": "123,45",
        ISRC: "SEABC1234567",
      },
      "spotify",
    );

    expect(result.rowStatus).toBe("invalid");
    expect(result.errorCodes).toContain("missing_currency");
  });

  it("marks row invalid when amount is missing", () => {
    const result = canonicalizeImportRow(
      {
        Currency: "EUR",
        ISRC: "SEABC1234567",
      },
      "spotify",
    );

    expect(result.rowStatus).toBe("invalid");
    expect(result.errorCodes).toContain("missing_amount");
  });

  it("normalizes decimal comma to decimal point", () => {
    const result = canonicalizeImportRow(
      {
        Currency: "EUR",
        Amount: "1 234,56",
        ISRC: "SEABC1234567",
      },
      "spotify",
    );

    expect(result.netAmount).toBe("1234.56");
    expect(result.rowStatus).toBe("parsed");
  });
});