# opencode-data-size-guardrail

OpenCode plugin that prevents agents from accidentally reading, printing, or generating huge data files that waste LLM tokens.

## Problem

Agents are good at exploring files, but raw data files can be enormous. A single `cat token_flow_analysis.json` or unbounded export can dump millions of tokens into the conversation, slow the session down, and make the model less useful.

This MVP blocks the most common footguns:

- reading files larger than `maxReadBytes`
- direct `cat` or `jq .` reads of JSON/JSONL/NDJSON/log files
- `grep` on large files without `-m`, `--max-count`, `head`, or `tail`
- export/download commands that have no obvious limit, date range, sample, filter, or aggregation
- generated files larger than `maxGeneratedFileBytes`

Token estimates use a simple rule:

```ts
estimatedTokens = Math.ceil(bytes / 4)
```

## Why Instructions Are Not Enough

OpenCode skills and instructions can tell agents to avoid huge files, but they are advisory. A plugin hook is a runtime guardrail: it can inspect tool calls before and after execution and block unsafe operations even when the agent forgets.

## Safe Workflow

Use local code for bulk data and send only small artifacts to the LLM:

```text
raw data -> local aggregation script -> small summary/sample/stats -> LLM
```

Good artifacts include small Markdown reports, summary JSON, sampled rows, counts, histograms, and extracted fields relevant to the task.

## Install

```sh
bun add -d opencode-data-size-guardrail
```

Then add the plugin to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-data-size-guardrail"
  ]
}
```

For local development from this repo:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "./src/index.ts"
  ]
}
```

Restart OpenCode after changing plugin config.

## Blocked Examples

```sh
cat token_flow_analysis.json
cat *.jsonl
cat app.log
jq . large-file
grep ERROR large.log
aws s3 cp s3://bucket/events.jsonl ./events.jsonl
aws s3 sync s3://bucket ./data
curl https://example.com/events.jsonl > events.jsonl
wget https://example.com/events.jsonl -O events.jsonl
mcp export everything
./scripts/collect_events.sh
./scripts/dump_users.sh
./scripts/export_orders.sh
./scripts/fetch_logs.sh
```

Example error:

```text
Blocked by opencode-data-size-guardrail.
This file is too large to read safely:
token_flow_analysis.json
Size: 218.5 MB
Estimated tokens: ~54,625,000
Use a safer workflow:
- sample the file
- aggregate locally
- extract only required fields
- generate a small summary JSON/Markdown file
```

## Safe Alternatives

```sh
cat token_flow_analysis.json | head -n 50
grep -m 20 ERROR large.log
grep --max-count=20 ERROR large.log
node scripts/summarize-events.js events.jsonl > summary.md
jq '{count: length, sample: .[:20]}' small-enough.json > summary.json
aws s3 cp s3://bucket/events.jsonl ./sample.jsonl --filter '*2026-06-18*'
```

## Config

Environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `OPENCODE_DSG_MAX_READ_BYTES` | `5000000` | Max file size allowed for direct reads. Supports raw bytes or `kb`, `mb`, `gb` suffixes. |
| `OPENCODE_DSG_MAX_GENERATED_BYTES` | `20000000` | Max size for files generated or modified by bash commands. Supports raw bytes or `kb`, `mb`, `gb` suffixes. |
| `OPENCODE_DSG_ALLOW_LARGE_FILES` | `false` | If `true`, the plugin warns instead of blocking. |

Generated dangerous files are recorded in `.opencode-data-size-guardrail.json`. Future reads of recorded files are blocked even if the file is later referenced by path instead of newly generated in the same command.

## Hook Assumptions

The plugin uses OpenCode plugin hooks:

- `tool.execute.before`
- `tool.execute.after`

The hook adapter is defensive and looks for common payload shapes such as `tool`, `toolID`, `name`, `args`, `parameters`, and `call.args`. The expected tool names are `read` and `bash`. If OpenCode changes hook payload names, the small adapter in `src/index.ts` may need adjustment.

## Limitations

- MVP heuristics can miss unusual shell syntax.
- It does not parse every command safely like a shell would.
- It snapshots relevant project files recursively, skipping common heavy folders such as `.git`, `node_modules`, and `dist`.
- It has no dashboard, database, or external service.
- It does not replace good data workflows; it only catches common accidental token explosions.

## Development

```sh
bun install
bun test
bun run build
bun run typecheck
```
