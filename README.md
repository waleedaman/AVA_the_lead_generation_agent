# AegisSafeForge Lead Generation Agent

Internal MVP for lead research, fit scoring, source-backed outreach drafting, human review, and approved CSV export.

## Services and Ports

- Web app: `http://localhost:3100`
- API: `http://localhost:3101`
- AI worker health: `http://localhost:8099/health`
- MongoDB: `27017`
- Redis: `6379`

Start Mongo and Redis:

```bash
docker compose up -d
```

Start the apps in separate terminals:

```bash
npm run dev -w api
npm run dev -w web
npm run dev -w ai-worker
```

## Environment

Copy the examples and adjust model/provider values:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/ai-worker/.env.example apps/ai-worker/.env
```

LinkedIn enrichment is optional and uses the official LinkedIn API only. It requires `LINKEDIN_ACCESS_TOKEN` plus a numeric `linkedin_organization_id` on company rows.

## CSV Import

Recommended columns:

```csv
company_name,website,linkedin_url,linkedin_organization_id,notes
Example GmbH,https://example.com,https://www.linkedin.com/company/example,123456,Automotive supplier
```

`website` can be omitted. Use **Fill Missing Info** or the manual website override on a company detail page.

## Internal MVP Workflow

1. Create a campaign. The form is prefilled with AegisSafeForge targeting.
2. Import a CSV of companies.
3. Fill missing websites, then review/override website selections where needed.
4. Run research for the campaign or selected leads.
5. Review evidence, signals, score, and draft message.
6. Edit, approve, or reject drafts.
7. Export approved drafts as CSV from the draft review queue.

The MVP does not send email or LinkedIn messages automatically. Human approval and export are required.
