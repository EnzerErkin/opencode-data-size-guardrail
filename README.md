# opencode-data-size-guardrail

## 🤯 Your Agent Ran `cat huge.json` And Your Tokens Died

Your agent runs this:

```sh
cat token_flow_analysis.json
```

Looks harmless.

But the file is this big:

```text
218.5 MB
~54,625,000 tokens
```

Now your LLM is slow, confused, and expensive.

`opencode-data-size-guardrail` stops that.

It is a tiny OpenCode plugin that warns or blocks when an agent tries to read, print, or create giant raw data files.

## Install

```sh
bun add -g opencode-data-size-guardrail
```

Open:

```text
~/.config/opencode/opencode.jsonc
```

Add:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-data-size-guardrail"
  ]
}
```

Restart:

```sh
opencode
```

That is it.

Use `opencode.jsonc` for your personal/global config. Use `opencode.json` for project/shared config.

## The One Rule

Big raw files can live on disk.

They should not go into the LLM.

Bad:

```text
raw data -> giant JSON -> LLM reads giant JSON -> token explosion
```

Good:

```text
raw data -> local script -> small summary -> LLM
```

The script does the heavy lifting. The LLM reads the tiny result.

## What It Does

Reads:

| Size | Behavior |
| ---: | --- |
| `> 5 MB` | warn |
| `> 20 MB` | soft-block |
| `> 100 MB` | hard-block |

Generated files:

| Size | Behavior |
| ---: | --- |
| `> 20 MB` | warn and record |
| `> 100 MB` | mark dangerous and block future reads |

Soft-block means: stop by default, but show the exact override command.

## Real Example

This plugin came from a real OpenCode mistake.

An agent analyzed Marvin/MCP sessions, fetched full token values, and wrote this file:

```text
token_flow_analysis.json    218.5 MB    ~54,625,000 tokens
```

The problem was not running a script.

The problem was creating a giant raw file that the LLM might read next.

The safe version should have been:

```text
MCP sessions -> local aggregation -> summary.md -> LLM
```

This plugin catches the same mistake for logs, JSON, JSONL, NDJSON, CSV, AWS exports, curl downloads, MCP data, custom scripts, and generated reports.

## What The Agent Sees

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

For soft blocks, it also shows how to continue:

```sh
OPENCODE_DSG_ALLOW_LARGE_FILES=true opencode
```

or:

```sh
OPENCODE_DSG_MAX_READ_BYTES=209715200 opencode
```

## Bad Commands

These are risky:

```sh
cat token_flow_analysis.json
cat *.jsonl
cat *.ndjson
cat app.log
jq . giant-file
grep ERROR huge.log
```

These are risky if they have no limit/sample/filter/summary:

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

## Good Commands

Do this instead:

```sh
cat token_flow_analysis.json | head -n 50
grep -m 20 ERROR app.log
grep --max-count=20 timeout app.log
jq '{count: length, sample: .[:20]}' data.json > summary.json
node scripts/summarize-events.js events.jsonl > summary.md
python scripts/profile_csv.py huge.csv > profile.md
node collect_token_flows.mjs --limit 10 --summary
```

Good files for agents:

- `summary.md`
- `sample.json`
- `stats.json`
- `top-errors.md`
- `schema-summary.md`

## Config

You probably do not need config.

| Variable | Default | Meaning |
| --- | ---: | --- |
| `OPENCODE_DSG_WARN_READ_BYTES` | `5242880` | warn over 5 MB |
| `OPENCODE_DSG_ASK_READ_BYTES` | `20971520` | soft-block over 20 MB |
| `OPENCODE_DSG_MAX_READ_BYTES` | `104857600` | hard-block over 100 MB |
| `OPENCODE_DSG_WARN_GENERATED_BYTES` | `20971520` | warn/record generated files over 20 MB |
| `OPENCODE_DSG_MAX_GENERATED_BYTES` | `104857600` | dangerous generated files over 100 MB |
| `OPENCODE_DSG_ALLOW_LARGE_FILES` | `false` | warn only, never block |

Examples:

```sh
OPENCODE_DSG_MAX_READ_BYTES=200mb opencode
OPENCODE_DSG_ALLOW_LARGE_FILES=true opencode
```

Generated large files are recorded in:

```text
.opencode-data-size-guardrail.json
```

## Limits

- It is heuristic, not a full shell parser.
- Weird commands can slip through.
- Safe commands can sometimes be blocked.
- No dashboard. No database. No external service.

The goal is simple: stop obvious token disasters.

## Development

```sh
bun install
bun test
bun run build
bun run typecheck
```
