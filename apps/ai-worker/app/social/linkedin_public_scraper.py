import hashlib
import os
from datetime import datetime

import httpx
from bs4 import BeautifulSoup
import trafilatura

from ..services.service_logger import log_event

LINKEDIN_PUBLIC_SCRAPER_ENABLED = os.getenv("LINKEDIN_PUBLIC_SCRAPER_ENABLED", "false").lower() in {
    "1",
    "true",
    "yes",
}
LINKEDIN_PUBLIC_SCRAPER_TIMEOUT_SECONDS = int(os.getenv("LINKEDIN_PUBLIC_SCRAPER_TIMEOUT_SECONDS", "15"))
LINKEDIN_PUBLIC_SCRAPER_USER_AGENT = os.getenv(
    "LINKEDIN_PUBLIC_SCRAPER_USER_AGENT",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
)


async def fetch_public_linkedin_company_profile(company: dict) -> list[dict]:
    linkedin_url = str(company.get("linkedinUrl") or "").strip()
    if not LINKEDIN_PUBLIC_SCRAPER_ENABLED or not linkedin_url:
        return []
    if "linkedin.com/company/" not in linkedin_url.lower():
        return []

    try:
        async with httpx.AsyncClient(
            timeout=LINKEDIN_PUBLIC_SCRAPER_TIMEOUT_SECONDS,
            follow_redirects=True,
            headers={
                "User-Agent": LINKEDIN_PUBLIC_SCRAPER_USER_AGENT,
                "Accept-Language": "en-US,en;q=0.9",
            },
        ) as client:
            response = await client.get(linkedin_url)
            if response.status_code != 200:
                log_event(
                    "linkedin_public_scraper_failed",
                    url=linkedin_url,
                    statusCode=response.status_code,
                    reason="non_200_response",
                )
                return []
    except Exception as exc:
        log_event(
            "linkedin_public_scraper_failed",
            url=linkedin_url,
            error=f"{type(exc).__name__}: {exc}",
        )
        return []

    html = response.text
    text = trafilatura.extract(html, include_links=False, include_images=False, include_tables=False) or ""
    if not text:
        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text("\n", strip=True)

    if len(text.strip()) < 80 or _looks_like_login_wall(text):
        log_event(
            "linkedin_public_scraper_failed",
            url=linkedin_url,
            reason="no_public_profile_text",
            textChars=len(text or ""),
        )
        return []

    evidence = {
        "url": str(response.url),
        "pageTitle": "LinkedIn public company profile",
        "rawText": text[:12000],
        "cleanedText": text[:12000],
        "summary": text[:500],
        "sourceType": "linkedin_company_profile",
        "provider": "linkedin_public_scraper",
        "sourceConfidence": 0.45,
        "confidence": 0.45,
        "retrievalStatus": "completed",
        "contentHash": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "retrievedAt": datetime.utcnow(),
    }
    log_event(
        "linkedin_public_scraper_completed",
        url=linkedin_url,
        textChars=len(text),
    )
    return [evidence]


def _looks_like_login_wall(text: str) -> bool:
    lowered = (text or "").lower()
    login_phrases = [
        "sign in to linkedin",
        "join linkedin",
        "authwall",
        "agreement and join linkedin",
    ]
    return any(phrase in lowered for phrase in login_phrases)
