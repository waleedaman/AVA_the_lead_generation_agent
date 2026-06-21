# AVA AI Worker

Python/FastAPI worker that consumes BullMQ jobs, crawls public sources, extracts evidence-backed facts, scores leads, discovers contacts, and drafts reviewable outreach.

Use the root [README](../../README.md) for full setup. This worker is local-development software and should not be exposed directly to the internet.

## Commands

```bash
npm run dev -w ai-worker
python -m unittest discover -s apps/ai-worker/tests
python -m compileall apps/ai-worker/app
```

## Environment

Copy `apps/ai-worker/.env.example` to `apps/ai-worker/.env`.

LLM prompt/response logging is disabled and/or redacted by default for public-release safety. Enable detailed logs only when debugging locally.

## Health

```text
http://localhost:8099/health
```
