import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("escapes fields containing commas, quotes, or newlines per RFC 4180", () => {
    const rows = [{ name: "Acme, Inc.", note: 'Say "hi"', description: "Line one\nLine two" }];
    const csv = toCsv(rows, ["name", "note", "description"]);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe('"Acme, Inc.","Say ""hi""","Line one\nLine two"');
  });

  it("joins array values with '; ' instead of quoting each element", () => {
    const rows = [{ tags: ["ISO certificate", "Trade license"] }];
    const csv = toCsv(rows, ["tags"]);
    expect(csv.split("\r\n")[1]).toBe("ISO certificate; Trade license");
  });

  it("renders null/undefined as an empty field, not the literal string", () => {
    const rows = [{ value: null }, { value: undefined }];
    const csv = toCsv(rows, ["value"]);
    expect(csv.split("\r\n").slice(1)).toEqual(["", ""]);
  });

  it("does not quote plain fields with no special characters", () => {
    const rows = [{ name: "Acme" }];
    expect(toCsv(rows, ["name"]).split("\r\n")[1]).toBe("Acme");
  });
});
