import { describe, expect, test } from "bun:test";
import { analyzeCommandRisk } from "../src/command-risk";

const sizes = new Map<string, number>([
  ["medium.log", 6 * 1024 * 1024],
  ["large.log", 25 * 1024 * 1024],
  ["huge.log", 101 * 1024 * 1024],
  ["large-file", 25 * 1024 * 1024],
  ["events.jsonl", 25 * 1024 * 1024],
  ["token_flow_analysis.json", 218_500_000],
]);

function getFileSize(filePath: string): number | undefined {
  return sizes.get(filePath);
}

describe("command risk detection", () => {
  test("blocks risky direct data reads", () => {
    expect(analyzeCommandRisk("cat token_flow_analysis.json", {
      askReadBytes: 20 * 1024 * 1024,
      maxReadBytes: 100 * 1024 * 1024,
      getFileSize,
    }).action).toBe("hard-block");
    expect(analyzeCommandRisk("cat *.jsonl").blocked).toBe(true);
    expect(analyzeCommandRisk("cat app.log").blocked).toBe(true);
    expect(analyzeCommandRisk("jq . large-file", {
      askReadBytes: 20 * 1024 * 1024,
      maxReadBytes: 100 * 1024 * 1024,
      getFileSize,
    }).action).toBe("soft-block");
  });

  test("warns but allows medium direct reads", () => {
    const risk = analyzeCommandRisk("cat medium.log", {
      warnReadBytes: 5 * 1024 * 1024,
      askReadBytes: 20 * 1024 * 1024,
      maxReadBytes: 100 * 1024 * 1024,
      getFileSize,
    });

    expect(risk.blocked).toBe(false);
    expect(risk.action).toBe("warn");
  });

  test("blocks grep on large files without limiting flags", () => {
    const risk = analyzeCommandRisk("grep ERROR large.log", {
      warnReadBytes: 5 * 1024 * 1024,
      askReadBytes: 20 * 1024 * 1024,
      maxReadBytes: 100 * 1024 * 1024,
      getFileSize,
    });

    expect(risk.blocked).toBe(true);
    expect(risk.kind).toBe("large-grep");
    expect(risk.action).toBe("soft-block");
    expect(risk.bytes).toBe(25 * 1024 * 1024);
  });

  test("hard-blocks grep on huge files without limiting flags", () => {
    const risk = analyzeCommandRisk("grep ERROR huge.log", {
      warnReadBytes: 5 * 1024 * 1024,
      askReadBytes: 20 * 1024 * 1024,
      maxReadBytes: 100 * 1024 * 1024,
      getFileSize,
    });

    expect(risk.blocked).toBe(true);
    expect(risk.action).toBe("hard-block");
  });

  test("blocks unbounded export-like commands", () => {
    expect(analyzeCommandRisk("aws s3 cp s3://bucket/events.jsonl ./events.jsonl").blocked).toBe(true);
    expect(analyzeCommandRisk("aws s3 sync s3://bucket ./data").blocked).toBe(true);
    expect(analyzeCommandRisk("curl https://example.com/events.jsonl > events.jsonl").blocked).toBe(true);
    expect(analyzeCommandRisk("wget https://example.com/events.jsonl -O events.jsonl").blocked).toBe(true);
    expect(analyzeCommandRisk("mcp export everything").blocked).toBe(true);
    expect(analyzeCommandRisk("./scripts/collect_events.sh").blocked).toBe(true);
    expect(analyzeCommandRisk("bun run dump_users").blocked).toBe(true);
    expect(analyzeCommandRisk("node /Users/enzer.erkin/Documents/search_api_failure_analysis/collect_token_flows.mjs").blocked).toBe(true);
    expect(analyzeCommandRisk("python collect_token_flows.py").blocked).toBe(true);
  });

  test("allows safe bounded commands", () => {
    expect(analyzeCommandRisk("cat events.jsonl | head -n 20").blocked).toBe(false);
    expect(analyzeCommandRisk("grep -m 20 ERROR large.log", { maxReadBytes: 5_000_000, getFileSize }).blocked).toBe(false);
    expect(analyzeCommandRisk("grep --max-count=20 ERROR large.log", { maxReadBytes: 5_000_000, getFileSize }).blocked).toBe(false);
    expect(analyzeCommandRisk("aws s3 cp s3://bucket/events.jsonl ./sample.jsonl --filter '*2026-06-18*'").blocked).toBe(false);
    expect(analyzeCommandRisk("curl https://example.com/events.jsonl | head -n 100 > sample.jsonl").blocked).toBe(false);
    expect(analyzeCommandRisk("node summarize.js data/events.jsonl > summary.md").blocked).toBe(false);
    expect(analyzeCommandRisk("node collect_token_flows.mjs --limit 10 --summary").blocked).toBe(false);
  });
});
