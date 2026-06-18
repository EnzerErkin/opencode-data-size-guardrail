# Unsafe Command Examples

These commands are intentionally blocked or treated as risky by the MVP.

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

Safer alternatives keep the LLM away from raw bulk data:

```sh
cat token_flow_analysis.json | head -n 50
grep -m 20 ERROR large.log
node scripts/summarize-events.js events.jsonl > summary.md
jq '{count: length, sample: .[:20]}' small-enough.json > summary.json
```
