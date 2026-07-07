/**
 * lib/csv — RFC 4180 quoting + formula-injection neutralization
 * (security hardening pass). The exports feed Excel/Sheets and carry
 * guest-controlled strings, so cells that would execute as formulas
 * (= + - @, tab/CR leaders) must be prefixed with an apostrophe.
 */

import { describe, expect, test } from "bun:test";
import { csv } from "../csv";

describe("csv", () => {
  test("plain rows serialize with trailing newline", () => {
    expect(csv([["a", "b"], ["c", 1]])).toBe("a,b\nc,1\n");
  });

  test("RFC 4180: commas, quotes, newlines get quoted with doubling", () => {
    expect(csv([['he said "hi"', "a,b", "l1\nl2"]])).toBe(
      '"he said ""hi""","a,b","l1\nl2"\n',
    );
  });

  test("null/undefined render empty; numbers pass through unprefixed", () => {
    expect(csv([[null, 0, -5]])).toBe(",0,-5\n");
  });

  test("formula triggers are neutralized with an apostrophe prefix", () => {
    const out = csv([
      ["=HYPERLINK(\"http://evil\",\"x\")"],
      ["+SUM(A1:A9)"],
      ["-2+3"],
      ["@cmd"],
      ["\tleading-tab"],
    ]);
    const lines = out.trimEnd().split("\n");
    expect(lines[0]!.startsWith("\"'=HYPERLINK")).toBe(true);
    expect(lines[1]).toBe("'+SUM(A1:A9)");
    expect(lines[2]).toBe("'-2+3");
    expect(lines[3]).toBe("'@cmd");
    expect(lines[4]!.startsWith("'\t")).toBe(true);
  });

  test("negative NUMBERS are not mangled — only strings get the prefix", () => {
    expect(csv([[-12, "-12"]])).toBe("-12,'-12\n");
  });

  test("interior formula characters are untouched", () => {
    expect(csv([["a=b", "x+y"]])).toBe("a=b,x+y\n");
  });
});
