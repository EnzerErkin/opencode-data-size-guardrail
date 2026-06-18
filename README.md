# opencode-data-size-guardrail

## 🤯 Stop OpenCode Agents From Eating Giant Files

Your agent runs this:

```sh
cat token_flow_analysis.json
```

Then your LLM context gets flooded with this:

```text
218.5 MB file
~54,625,000 tokens
```

That is slow, expensive, noisy, and usually useless.

`opencode-data-size-guardrail` is a tiny OpenCode plugin that catches obvious token disasters before raw data enters the LLM context.

## 🚀 Install In 30 Seconds

```sh
bun add -d opencode-data-size-guardrail
```

Add this to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-data-size-guardrail"
  ]
}
```

Restart OpenCode. Done.

For local development from this repo:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "./src/index.ts"
  ]
}
```

## 🧠 The Rule

Large raw data may exist on disk.

It should not enter the LLM context.

Correct workflow:

```text
raw data -> local script -> small summary/stats/sample -> LLM
```

Wrong workflow:

```text
raw data -> giant JSON -> LLM reads/summarizes giant JSON -> token explosion
```

Local processing is driving correctly.

This plugin is the seatbelt.

## ⚖️ Default Policy

The defaults are intentionally not annoying.

For reads:

| File size | Default behavior |
| ---: | --- |
| over `5 MB` | warn/log only |
| over `20 MB` | soft-block with exact override instructions |
| over `100 MB` | hard-block |

For generated files:

| File size | Default behavior |
| ---: | --- |
| over `20 MB` | warn and record |
| over `100 MB` | mark dangerous and block future direct reads |

The real Marvin/MCP failure file was `218.5 MB`, so it is blocked by default.

## 🧨 Real Failure Story

This plugin exists because an AI-agent workflow accidentally created a token/cost bomb while analyzing Marvin/MCP session data.

The task looked reasonable:

- analyze Search/Marvin failure sessions
- inspect MCP events
- fetch token values like `CustomerInput`, `TextResponse`, and `QuickResponsesGenerated`
- understand what users asked and whether quick-response buttons were involved

The agent wrote and ran a script:

```sh
node /Users/enzer.erkin/Documents/search_api_failure_analysis/collect_token_flows.mjs
```

The script processed `295` archive/debug sessions and produced:

```text
token_flow_analysis.json    218.5 MB    ~54,625,000 tokens
```

The root mistake was not simply "reading a large file".

The agent created a huge raw evidence file first.

Bad flow:

```text
MCP sessions -> full token values for 295 sessions -> giant raw JSON -> possible LLM context explosion
```

Safe flow:

```text
MCP sessions -> local streaming aggregation -> small stats/sample/summary -> LLM
```

David's point from the team discussion was the key framing:

```text
Running the script is not the problem.
The LLM reading the giant raw output is the problem.
```

The question should always be:

```text
Does the LLM need the full file, or can a script do the job locally?
```

## 💸 Why This Matters

LLMs do not understand "file size" like humans do.

They see text tokens.

This plugin estimates tokens like this:

```ts
estimatedTokens = Math.ceil(bytes / 4)
```

Examples:

| File | Size | Estimated Tokens |
| --- | ---: | ---: |
| `app.log` | `20 MB` | `~5,000,000` |
| `events.jsonl` | `100 MB` | `~25,000,000` |
| `token_flow_analysis.json` | `218.5 MB` | `~54,625,000` |

Even when your model is cheap, millions of useless tokens make the agent slower and worse.

The best token is the one you never send.

## 🛑 Example Block Message

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

Soft blocks explain exactly how to continue:

```text
OPENCODE_DSG_ALLOW_LARGE_FILES=true opencode
```

or:

```text
OPENCODE_DSG_MAX_READ_BYTES=209715200 opencode
```

## 🚫 Commands It Catches

Direct raw-data reads:

```sh
cat token_flow_analysis.json
cat *.jsonl
cat *.ndjson
cat app.log
jq . giant-file
```

Unbounded grep on large files:

```sh
grep ERROR huge.log
```

Unbounded exports/downloads/collection scripts:

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

## ✅ Safe Alternatives

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

## ⚙️ Config

You probably do not need config.

Defaults:

| Variable | Default | What it does |
| --- | ---: | --- |
| `OPENCODE_DSG_WARN_READ_BYTES` | `5242880` | Warn when a direct read is over `5 MB`. |
| `OPENCODE_DSG_ASK_READ_BYTES` | `20971520` | Soft-block when a direct read is over `20 MB`. |
| `OPENCODE_DSG_MAX_READ_BYTES` | `104857600` | Hard-block when a direct read is over `100 MB`. |
| `OPENCODE_DSG_WARN_GENERATED_BYTES` | `20971520` | Warn and record when a generated file is over `20 MB`. |
| `OPENCODE_DSG_MAX_GENERATED_BYTES` | `104857600` | Mark dangerous when a generated file is over `100 MB`. |
| `OPENCODE_DSG_ALLOW_LARGE_FILES` | `false` | If `true`, warn only and never block. |

Human-friendly suffixes work too:

```sh
OPENCODE_DSG_MAX_READ_BYTES=200mb opencode
OPENCODE_DSG_MAX_GENERATED_BYTES=250mb opencode
OPENCODE_DSG_ALLOW_LARGE_FILES=true opencode
```

Strict mode example:

```sh
OPENCODE_DSG_MAX_READ_BYTES=5242880 OPENCODE_DSG_MAX_GENERATED_BYTES=20971520 opencode
```

Generated large files are recorded in:

```text
.opencode-data-size-guardrail.json
```

Future reads of dangerous generated files are blocked.

## 🧯 Why Not Just Tell The Agent?

Instructions are advice.

Hooks are enforcement.

You can tell an agent "do not read giant files", but it can still forget and run:

```sh
cat huge.jsonl
```

This plugin checks OpenCode tool calls before and after they run.

## 🔧 How It Works

The plugin uses OpenCode hooks:

- `tool.execute.before`
- `tool.execute.after`

Before `read`:

- checks file size
- warns over `5 MB`
- soft-blocks over `20 MB`
- hard-blocks over `100 MB`
- blocks files previously recorded as dangerous

Before `bash`:

- scans the command string
- blocks obvious risky reads and unbounded exports
- snapshots project files when possible

After `bash`:

- compares the snapshot
- records newly created or modified large files
- blocks future reads of dangerous generated files

## 🪝 Hook Assumptions

OpenCode plugin payloads may change over time. This MVP reads common fields defensively, including `tool`, `toolID`, `name`, `args`, `parameters`, and `call.args`.

Expected tool names:

- `read`
- `bash`

If OpenCode changes hook shapes, the small adapter in `src/index.ts` may need an update.

## ⚠️ Limitations

This is intentionally small.

- No dashboard.
- No database.
- No external service.
- No complex config file.
- Shell detection is heuristic, not a full shell parser.
- Weird commands can slip through.
- Safe commands can occasionally be blocked.

The goal is not perfect security.

The goal is to stop obvious token disasters.

## 🧪 Development

```sh
bun install
bun test
bun run build
bun run typecheck
```

## ⭐ Star This If

- you have watched an agent read a whole log file
- you have paid for tokens that taught the model nothing
- you want raw data summarized before it enters context

Tiny plugin. Big token savings.
