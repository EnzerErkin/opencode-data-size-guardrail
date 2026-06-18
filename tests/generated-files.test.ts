import { describe, expect, test } from "bun:test";
import {
  createFileSnapshot,
  findGeneratedFilesOverThreshold,
  findLargeGeneratedFiles,
  findRecordedDangerousFile,
  recordDangerousFiles,
  STATE_FILE_NAME,
} from "../src/generated-files";
import { closeSync, mkdtempSync, openSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("generated file detection", () => {
  test("detects newly generated warning-level files", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dsg-generated-"));
    try {
      const before = createFileSnapshot(dir);
      const largePath = path.join(dir, "export.jsonl");
      const fd = openSync(largePath, "w");
      closeSync(fd);
      truncateSync(largePath, 21 * 1024 * 1024);

      const after = createFileSnapshot(dir);
      const generated = findGeneratedFilesOverThreshold(before, after, {
        warnGeneratedBytes: 20 * 1024 * 1024,
        maxGeneratedFileBytes: 100 * 1024 * 1024,
      });

      expect(generated).toHaveLength(1);
      expect(generated[0].path).toBe("export.jsonl");
      expect(generated[0].severity).toBe("warning");
      expect(generated[0].estimatedTokens).toBe(5_505_024);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("detects modified dangerous generated files", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dsg-generated-"));
    try {
      const largePath = path.join(dir, "report.log");
      writeFileSync(largePath, "small");
      const before = createFileSnapshot(dir);
      truncateSync(largePath, 101 * 1024 * 1024);

      const after = createFileSnapshot(dir);
      const dangerous = findLargeGeneratedFiles(before, after, 100 * 1024 * 1024);

      expect(dangerous).toHaveLength(1);
      expect(dangerous[0].path).toBe("report.log");
      expect(dangerous[0].severity).toBe("dangerous");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("records dangerous files and finds them later", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dsg-state-"));
    try {
      recordDangerousFiles(dir, [{
        path: "token_flow_analysis.json",
        absolutePath: path.join(dir, "token_flow_analysis.json"),
        size: 218_500_000,
        estimatedTokens: 54_625_000,
        detectedAt: "2026-06-18T00:00:00.000Z",
        severity: "dangerous",
      }]);

      const recorded = findRecordedDangerousFile(dir, "token_flow_analysis.json");

      expect(recorded?.size).toBe(218_500_000);
      expect(path.join(dir, STATE_FILE_NAME)).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("warning-level generated files are recorded but not treated as dangerous reads", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dsg-state-"));
    try {
      recordDangerousFiles(dir, [{
        path: "medium-export.json",
        absolutePath: path.join(dir, "medium-export.json"),
        size: 21 * 1024 * 1024,
        estimatedTokens: 5_505_024,
        detectedAt: "2026-06-18T00:00:00.000Z",
        severity: "warning",
      }]);

      expect(findRecordedDangerousFile(dir, "medium-export.json")).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
