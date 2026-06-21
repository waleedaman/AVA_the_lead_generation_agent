# Security Policy

AVA is currently local-development software. It does not include authentication, authorization, tenant isolation, or production deployment hardening.

## Supported Versions

Only the current `main` branch is supported for security fixes during the early MVP phase.

## Reporting a Vulnerability

Please report security issues privately by opening a GitHub security advisory or contacting the maintainer directly. Do not publish exploit details in a public issue before the issue has been reviewed.

## Important Deployment Warning

Do not expose the web app, API, AI worker, MongoDB, or Redis directly to the public internet. Before hosted use, add authentication, authorization, HTTPS, deployment-specific secret management, rate limits, and a full privacy/compliance review.

## Sensitive Data

Do not commit:

- Real prospect datasets.
- API keys or provider tokens.
- LLM prompt/response logs.
- Exported contacts or outreach drafts.
- SMTP credentials.
