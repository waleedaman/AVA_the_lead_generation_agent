import os
import httpx
from datetime import datetime

from ..services.service_logger import log_event
from .source_enrichment import _run_search_queries, dedupe_evidence, _content_hash

async def enrich_contact_sources(contact: dict, company: dict) -> list[dict]:
    """
    Gather evidence specifically about an individual contact.
    Uses LinkedIn API if available, otherwise falls back to search providers.
    """
    evidence = []
    contact_name = contact.get("name", "")
    contact_title = contact.get("title", "")
    company_name = company.get("name", "")
    
    if not contact_name:
        return []

    # Try LinkedIn specific fetch if an API key or scraper is enabled
    linkedin_evidence = await _fetch_linkedin_contact(contact, company_name)
    if linkedin_evidence:
        evidence.extend(linkedin_evidence)
    else:
        # Fallback to search engine for contact's public footprint
        queries = [
            f"{contact_name} {company_name} {contact_title}",
            f"{contact_name} {company_name} linkedin",
            f"{contact_name} {company_name} interview OR blog OR article"
        ]
        search_results = await _run_search_queries(
            queries=queries,
            provider="contact_search_provider",
            source_type="contact_public_footprint",
            company=company
        )
        evidence.extend(search_results)

    # Process and dedupe evidence
    for e in evidence:
        e["contactId"] = contact.get("_id") or contact.get("email") or contact_name
        
    return dedupe_evidence(evidence)


async def _fetch_linkedin_contact(contact: dict, company_name: str) -> list[dict]:
    """
    Attempt to fetch from LinkedIn directly if an access token is provided.
    Since LinkedIn API restricts arbitrary profile lookups, this is a placeholder
    for a dedicated API or scraper endpoint. If no token, returns empty list.
    """
    access_token = os.getenv("LINKEDIN_ACCESS_TOKEN", "").strip()
    linkedin_url = contact.get("linkedinUrl", "")
    
    if not access_token or not linkedin_url:
        return []

    # Note: Official LinkedIn API doesn't easily support arbitrary profile scraping.
    # This simulates calling an enrichment API (like Proxycurl or a custom scraper)
    # if the user configures it in the future.
    try:
        # Pseudo-implementation for a potential endpoint
        enrichment_api = os.getenv("LINKEDIN_ENRICHMENT_API_URL")
        if not enrichment_api:
            return []
            
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                enrichment_api,
                headers={"Authorization": f"Bearer {access_token}"},
                params={"url": linkedin_url}
            )
            response.raise_for_status()
            data = response.json()
            
            text = f"Contact: {data.get('full_name')}\nHeadline: {data.get('headline')}\nSummary: {data.get('summary')}\nExperience: {data.get('experiences')}"
            
            return [{
                "url": linkedin_url,
                "pageTitle": f"LinkedIn Profile: {contact.get('name')}",
                "sourceType": "linkedin_contact_profile",
                "rawText": text,
                "cleanedText": text,
                "summary": text[:500],
                "provider": "linkedin_contact_api",
                "sourceConfidence": 0.8,
                "confidence": 0.8,
                "retrievalStatus": "completed",
                "retrievedAt": datetime.utcnow(),
                "contentHash": _content_hash(text),
            }]
    except Exception as exc:
        log_event("linkedin_contact_fetch_failed", error=str(exc), contactName=contact.get("name"))
        return []
