# opencode-data-size-guardrail

## 🤯 Stop OpenCode Agents From Eating Giant Files

OpenCode agents can accidentally dump huge files into the LLM context:

```sh
cat token_flow_analysis.json
```

Example disaster:

```text
218.5 MB file
~54,625,000 tokens
```

That is slow, expensive, and usually useless.

This plugin blocks obvious token bombs before raw data enters the LLM context.

## Install

Install globally:

```sh
bun add -g opencode-data-size-guardrail
```

Open your global OpenCode config:

```text
~/.config/opencode/opencode.jsonc
```

Add the plugin:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-data-size-guardrail"
  ]
}
```

Restart OpenCode:

```sh
opencode
```

Notes:

- Use `opencode.jsonc` for personal/global config.
- Use `opencode.json` for project/shared config.
- Restart OpenCode after changing config.

## The Rule

Large raw data can exist on disk.

It should not enter the LLM context.

Good:

```text
raw data -> local script -> small summary/stats/sample -> LLM
```

Bad:

```text
raw data -> giant JSON -> LLM reads giant JSON -> token explosion
```

## Default Behavior

Reads:

| File size | Behavior |
| ---: | --- |
| over `5 MB` | warn/log only |
| over `20 MB` | soft-block with override instructions |
| over `100 MB` | hard-block |

Generated files:

| File size | Behavior |
| ---: | --- |
| over `20 MB` | warn and record |
| over `100 MB` | mark dangerous and block future direct reads |

The real failure file `token_flow_analysis.json` was `218.5 MB`, so it is blocked by default.

## Why This Exists

This came from a real AI-agent mistake while analyzing Marvin/MCP session data.

The agent processed `295` archive/debug sessions, fetched full token values, and wrote one raw file:

```text
token_flow_analysis.json    218.5 MB    ~54,625,000 tokens
```

The script was not the problem.

The problem was the risk of the LLM reading the giant raw output.

The safer workflow should have been:

```text
MCP sessions -> local aggregation -> small summary/stats/sample -> LLM
```

This plugin is not MCP-specific. It protects the same mistake for local files, logs, JSON, JSONL, NDJSON, CSV, AWS, curl, custom scripts, and generated reports.

## Example Block Message

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

Soft blocks tell you how to continue:

```sh
OPENCODE_DSG_ALLOW_LARGE_FILES=true opencode
```

or:

```sh
OPENCODE_DSG_MAX_READ_BYTES=209715200 opencode
```

## Commands It Catches

Risky reads:

```sh
cat token_flow_analysis.json
cat *.jsonl
cat *.ndjson
cat app.log
jq . giant-file
grep ERROR huge.log
```

Unbounded exports and collection scripts:

```sh
node collect_token_flows.mjs
python collect_token_flows.py
node dump_sessions.mjs
python export_events.py
aws s3 cp s3://bucket/events.jsonl ./events.jsonl
aws s3 sync s3://bucket ./data
curl https://example.com/events.jsonl > events.jsonl
wget https://example.com/events.jsonl -O events.jsonl
mcp export everything
```

## Safe Alternatives

Use limits, samples, summaries, date filters, or local aggregation:

```sh
cat token_flow_analysis.json | head -n 50
grep -m 20 ERROR app.log
grep --max-count=20 timeout app.log
jq '{count: length, sample: .[:20]}' data.json > summary.json
node scripts/summarize-events.js events.jsonl > summary.md
python scripts/profile_csv.py huge.csv > profile.md
node collect_token_flows.mjs --limit 10 --summary
```

Good files for agents to read:

- `summary.md`
- `sample.json`
- `stats.json`
- `top-errors.md`
- `schema-summary.md`

## Config

You probably do not need config.

| Variable | Default | What it does |
| --- | ---: | --- |
| `OPENCODE_DSG_WARN_READ_BYTES` | `5242880` | Warn when a direct read is over `5 MB`. |
| `OPENCODE_DSG_ASK_READ_BYTES` | `20971520` | Soft-block when a direct read is over `20 MB`. |
| `OPENCODE_DSG_MAX_READ_BYTES` | `104857600` | Hard-block when a direct read is over `100 MB`. |
| `OPENCODE_DSG_WARN_GENERATED_BYTES` | `20971520` | Warn and record when a generated file is over `20 MB`. |
| `OPENCODE_DSG_MAX_GENERATED_BYTES` | `104857600` | Mark dangerous when a generated file is over `100 MB`. |
| `OPENCODE_DSG_ALLOW_LARGE_FILES` | `false` | Warn only, never block. |

Human-friendly suffixes work too:

```sh
OPENCODE_DSG_MAX_READ_BYTES=200mb opencode
OPENCODE_DSG_MAX_GENERATED_BYTES=250mb opencode
OPENCODE_DSG_ALLOW_LARGE_FILES=true opencode
```

Generated large files are recorded in:

```text
.opencode-data-size-guardrail.json
```

## Limitations

- Shell detection is heuristic, not a full shell parser.
- Weird commands can slip through.
- Safe commands can occasionally be blocked.
- No dashboard, database, or external service.

The goal is simple: stop obvious token disasters.

## Development

```sh
bun install
bun test
bun run build
bun run typecheck
```
