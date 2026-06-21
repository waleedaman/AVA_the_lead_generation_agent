# Contributing to AVA

Thanks for taking a look at AVA. This project is an early local-first MVP for human-reviewed lead research and outreach drafting.

## Local Setup

1. Read the root `README.md`.
2. Install dependencies with `npm install`.
3. Start MongoDB and Redis with `docker compose up -d`.
4. Copy the example environment files.
5. Run API, web, and worker services in separate terminals.

## Development Checks

Before opening a pull request, run the checks that match your changes:

```bash
python -m unittest discover -s apps/ai-worker/tests
python -m compileall apps/ai-worker/app
npm test -w api
npx tsc --noEmit -w apps/api
npm run lint -w web
npm run check-types -w web
npm run build -w api
npm run build -w web
```

## Privacy Expectations

- Do not commit real lead lists, emails, private prompts, logs, API keys, or provider exports.
- Use `sample_companies.csv` for examples and tests.
- Keep LLM/request logging redacted by default.
- Add tests for any change that touches crawler safety, logging, provider calls, draft generation, or scoring.

## Pull Requests

Keep PRs focused. Include:

- What changed.
- Why it changed.
- What you tested.
- Any privacy or provider-impact notes.
