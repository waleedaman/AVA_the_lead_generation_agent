# AVA API

NestJS API for campaigns, companies, evidence, signals, contacts, drafts, product profile, and research-job queueing.

Use the root [README](../../README.md) for full setup. This service is local-development software and has no authentication; do not expose it directly to the internet.

## Commands

```bash
npm run dev -w api
npm test -w api
npm run build -w api
```

## Environment

Copy `apps/api/.env.example` to `apps/api/.env`.

The API writes privacy-safe service logs to `apps/api/logs` by default. Logs avoid full request bodies and redact secrets.
