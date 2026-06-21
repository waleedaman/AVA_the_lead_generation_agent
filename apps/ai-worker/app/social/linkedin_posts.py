import os
from datetime import datetime
from typing import Any

import httpx


LINKEDIN_POSTS_API_URL = "https://api.linkedin.com/rest/posts"


async def fetch_linkedin_company_posts(company: dict[str, Any]) -> list[dict[str, Any]]:
    access_token = os.getenv("LINKEDIN_ACCESS_TOKEN", "").strip()
    organization_id = str(company.get("linkedinOrganizationId") or "").strip()
    if not access_token or not organization_id:
        return []

    count = _bounded_count(os.getenv("LINKEDIN_POSTS_LIMIT", "5"))
    version = os.getenv("LINKEDIN_VERSION", "202604").strip() or "202604"
    organization_urn = f"urn:li:organization:{organization_id}"

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Linkedin-Version": version,
        "X-Restli-Protocol-Version": "2.0.0",
        "X-RestLi-Method": "FINDER",
    }
    params = {
        "q": "author",
        "author": organization_urn,
        "count": count,
        "sortBy": "LAST_MODIFIED",
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(LINKEDIN_POSTS_API_URL, headers=headers, params=params)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        print(f"LinkedIn posts API returned {exc.response.status_code}: {exc.response.text[:300]}")
        return []
    except httpx.HTTPError as exc:
        print(f"LinkedIn posts API request failed: {exc}")
        return []

    payload = response.json()
    posts = payload.get("elements", [])
    evidence = []
    for post in posts:
        text = _post_text(post)
        if not text:
            continue

        post_id = str(post.get("id") or "")
        evidence.append(
            {
                "url": _post_url(post_id, company.get("linkedinUrl")),
                "pageTitle": "LinkedIn company post",
                "rawText": text,
                "cleanedText": text,
                "summary": text[:500],
                "sourceType": "linkedin_company_post",
                "confidence": 0.7,
                "contentHash": post_id,
                "retrievedAt": datetime.utcnow(),
            }
        )

    return evidence


def _bounded_count(raw_count: str) -> int:
    try:
        count = int(raw_count)
    except ValueError:
        count = 5
    return min(max(count, 1), 25)


def _post_text(post: dict[str, Any]) -> str:
    parts = []
    commentary = post.get("commentary")
    if isinstance(commentary, str):
        parts.append(commentary.strip())

    content = post.get("content")
    if isinstance(content, dict):
        article = content.get("article")
        if isinstance(article, dict):
            for key in ("title", "description", "source"):
                value = article.get(key)
                if isinstance(value, str) and value.strip():
                    parts.append(value.strip())

        media = content.get("media")
        if isinstance(media, dict):
            title = media.get("title")
            if isinstance(title, str) and title.strip():
                parts.append(title.strip())

    published_at = post.get("publishedAt") or post.get("createdAt")
    if published_at:
        parts.append(f"LinkedIn timestamp: {published_at}")

    return "\n".join(part for part in parts if part)


def _post_url(post_id: str, fallback_url: str | None) -> str:
    if post_id:
        return f"https://www.linkedin.com/feed/update/{post_id}/"
    return fallback_url or "https://www.linkedin.com/"
