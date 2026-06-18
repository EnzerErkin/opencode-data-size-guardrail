import { describe, expect, test } from "bun:test";
import { buildLargeReadError } from "../src/errors";
import { checkRead } from "../src/index";
import { estimatedTokens, formatBytes, parseBytes } from "../src/size";
import { mkdtempSync, openSync, closeSync, truncateSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("size helpers", () => {
  test("formats bytes with decimal units", () => {
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1_500)).toBe("1.5 KB");
    expect(formatBytes(5_000_000)).toBe("5.0 MB");
    expect(formatBytes(218_500_000)).toBe("218.5 MB");
  });

  test("estimates tokens as bytes divided by four rounded up", () => {
    expect(estimatedTokens(0)).toBe(0);
    expect(estimatedTokens(1)).toBe(1);
    expect(estimatedTokens(8)).toBe(2);
    expect(estimatedTokens(218_500_000)).toBe(54_625_000);
  });

  test("parses byte env values", () => {
    expect(parseBytes("7", 1)).toBe(7);
    expect(parseBytes("1.5mb", 1)).toBe(1_500_000);
    expect(parseBytes("2 GB", 1)).toBe(2_000_000_000);
    expect(parseBytes("bad", 42)).toBe(42);
  });
});

describe("read blocking", () => {
  test("blocks direct reads of large files", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dsg-read-"));
    try {
      const filePath = path.join(dir, "large.json");
      const fd = openSync(filePath, "w");
      closeSync(fd);
      truncateSync(filePath, 6_000_000);

      expect(() => checkRead("large.json", dir, {
        maxReadBytes: 5_000_000,
        maxGeneratedFileBytes: 20_000_000,
        allowLargeFiles: false,
      })).toThrow("This file is too large to read safely");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("real failure example blocks token_flow_analysis.json", () => {
    const error = buildLargeReadError("token_flow_analysis.json", 218_500_000);

    expect(error.message).toContain("Blocked by opencode-data-size-guardrail");
    expect(error.message).toContain("token_flow_analysis.json");
    expect(error.message).toContain("Size: 218.5 MB");
    expect(error.message).toContain("Estimated tokens: ~54,625,000");
  });
});
