# AVA Web

Next.js web UI for the AVA campaign flow, company review page, product profile, draft review queue, and outreach export/send surfaces.

Use the root [README](../../README.md) for full setup. This UI assumes a trusted local environment and an unauthenticated local API.

## Commands

```bash
npm run dev -w web
npm run lint -w web
npm run check-types -w web
npm run build -w web
```

## Environment

Copy `apps/web/.env.example` to `apps/web/.env.local` and set `NEXT_PUBLIC_API_URL` if your API is not running on `http://localhost:3101`.
