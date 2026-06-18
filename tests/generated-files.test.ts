import { describe, expect, test } from "bun:test";
import {
  createFileSnapshot,
  findLargeGeneratedFiles,
  findRecordedDangerousFile,
  recordDangerousFiles,
  STATE_FILE_NAME,
} from "../src/generated-files";
import { closeSync, mkdtempSync, openSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("generated file detection", () => {
  test("detects newly generated large files", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dsg-generated-"));
    try {
      const before = createFileSnapshot(dir);
      const largePath = path.join(dir, "export.jsonl");
      const fd = openSync(largePath, "w");
      closeSync(fd);
      truncateSync(largePath, 21_000_000);

      const after = createFileSnapshot(dir);
      const dangerous = findLargeGeneratedFiles(before, after, 20_000_000);

      expect(dangerous).toHaveLength(1);
      expect(dangerous[0].path).toBe("export.jsonl");
      expect(dangerous[0].estimatedTokens).toBe(5_250_000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("detects modified large files", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dsg-generated-"));
    try {
      const largePath = path.join(dir, "report.log");
      writeFileSync(largePath, "small");
      const before = createFileSnapshot(dir);
      truncateSync(largePath, 25_000_000);

      const after = createFileSnapshot(dir);
      const dangerous = findLargeGeneratedFiles(before, after, 20_000_000);

      expect(dangerous).toHaveLength(1);
      expect(dangerous[0].path).toBe("report.log");
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
      }]);

      const recorded = findRecordedDangerousFile(dir, "token_flow_analysis.json");

      expect(recorded?.size).toBe(218_500_000);
      expect(path.join(dir, STATE_FILE_NAME)).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
