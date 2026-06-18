import { describe, expect, test } from "bun:test";
import { analyzeCommandRisk } from "../src/command-risk";

const sizes = new Map<string, number>([
  ["large.log", 9_000_000],
  ["large-file", 9_000_000],
  ["events.jsonl", 9_000_000],
]);

function getFileSize(filePath: string): number | undefined {
  return sizes.get(filePath);
}

describe("command risk detection", () => {
  test("blocks risky direct data reads", () => {
    expect(analyzeCommandRisk("cat token_flow_analysis.json").blocked).toBe(true);
    expect(analyzeCommandRisk("cat *.jsonl").blocked).toBe(true);
    expect(analyzeCommandRisk("cat app.log").blocked).toBe(true);
    expect(analyzeCommandRisk("jq . large-file", { maxReadBytes: 5_000_000, getFileSize }).blocked).toBe(true);
  });

  test("blocks grep on large files without limiting flags", () => {
    const risk = analyzeCommandRisk("grep ERROR large.log", {
      maxReadBytes: 5_000_000,
      getFileSize,
    });

    expect(risk.blocked).toBe(true);
    expect(risk.kind).toBe("large-grep");
    expect(risk.bytes).toBe(9_000_000);
  });

  test("blocks unbounded export-like commands", () => {
    expect(analyzeCommandRisk("aws s3 cp s3://bucket/events.jsonl ./events.jsonl").blocked).toBe(true);
    expect(analyzeCommandRisk("aws s3 sync s3://bucket ./data").blocked).toBe(true);
    expect(analyzeCommandRisk("curl https://example.com/events.jsonl > events.jsonl").blocked).toBe(true);
    expect(analyzeCommandRisk("wget https://example.com/events.jsonl -O events.jsonl").blocked).toBe(true);
    expect(analyzeCommandRisk("mcp export everything").blocked).toBe(true);
    expect(analyzeCommandRisk("./scripts/collect_events.sh").blocked).toBe(true);
    expect(analyzeCommandRisk("bun run dump_users").blocked).toBe(true);
  });

  test("allows safe bounded commands", () => {
    expect(analyzeCommandRisk("cat events.jsonl | head -n 20").blocked).toBe(false);
    expect(analyzeCommandRisk("grep -m 20 ERROR large.log", { maxReadBytes: 5_000_000, getFileSize }).blocked).toBe(false);
    expect(analyzeCommandRisk("grep --max-count=20 ERROR large.log", { maxReadBytes: 5_000_000, getFileSize }).blocked).toBe(false);
    expect(analyzeCommandRisk("aws s3 cp s3://bucket/events.jsonl ./sample.jsonl --filter '*2026-06-18*'").blocked).toBe(false);
    expect(analyzeCommandRisk("curl https://example.com/events.jsonl | head -n 100 > sample.jsonl").blocked).toBe(false);
    expect(analyzeCommandRisk("node summarize.js data/events.jsonl > summary.md").blocked).toBe(false);
  });
});
