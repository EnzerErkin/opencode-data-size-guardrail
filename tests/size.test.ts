import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { buildHardReadBlockError } from "../src/errors";
import { checkRead } from "../src/index";
import { estimatedTokens, formatBytes, parseBytes } from "../src/size";
import { mkdtempSync, openSync, closeSync, truncateSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const mib = 1024 * 1024;

const tieredConfig = {
  warnReadBytes: 5 * mib,
  askReadBytes: 20 * mib,
  maxReadBytes: 100 * mib,
  warnGeneratedBytes: 20 * mib,
  maxGeneratedFileBytes: 100 * mib,
  allowLargeFiles: false,
};

afterEach(() => {
  process.env.OPENCODE_DSG_ALLOW_LARGE_FILES = undefined;
});

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
  test("warns but allows reads over warnReadBytes", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dsg-read-"));
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const filePath = path.join(dir, "medium.json");
      const fd = openSync(filePath, "w");
      closeSync(fd);
      truncateSync(filePath, 6 * mib);

      expect(() => checkRead("medium.json", dir, tieredConfig)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain("Warning from opencode-data-size-guardrail");
      expect(warnSpy.mock.calls[0][0]).toContain("Estimated tokens");
    } finally {
      warnSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("soft-blocks reads over askReadBytes with override instructions", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dsg-read-"));
    try {
      const filePath = path.join(dir, "large.json");
      const fd = openSync(filePath, "w");
      closeSync(fd);
      truncateSync(filePath, 25 * mib);

      expect(() => checkRead("large.json", dir, tieredConfig)).toThrow("Soft-blocked by opencode-data-size-guardrail");
      expect(() => checkRead("large.json", dir, tieredConfig)).toThrow("OPENCODE_DSG_ALLOW_LARGE_FILES=true opencode");
      expect(() => checkRead("large.json", dir, tieredConfig)).toThrow("OPENCODE_DSG_MAX_READ_BYTES=");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("hard-blocks direct reads over maxReadBytes", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dsg-read-"));
    try {
      const filePath = path.join(dir, "large.json");
      const fd = openSync(filePath, "w");
      closeSync(fd);
      truncateSync(filePath, 101 * mib);

      expect(() => checkRead("large.json", dir, tieredConfig)).toThrow("Blocked by opencode-data-size-guardrail");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("allowLargeFiles warns only and never blocks", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dsg-read-"));
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const filePath = path.join(dir, "huge.json");
      const fd = openSync(filePath, "w");
      closeSync(fd);
      truncateSync(filePath, 101 * mib);

      expect(() => checkRead("huge.json", dir, { ...tieredConfig, allowLargeFiles: true })).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("real failure example blocks token_flow_analysis.json", () => {
    const error = buildHardReadBlockError("token_flow_analysis.json", 218_500_000);

    expect(error.message).toContain("Blocked by opencode-data-size-guardrail");
    expect(error.message).toContain("token_flow_analysis.json");
    expect(error.message).toContain("Size: 218.5 MB");
    expect(error.message).toContain("Estimated tokens: ~54,625,000");
    expect(error.message).toContain("aggregate locally");
  });
});
