import hashlib
import os
from datetime import datetime
from urllib.parse import urlparse

import httpx

from ..crawler.classify_page import classify_page
from ..crawler.fetch_page import fetch_page
from ..services.service_logger import log_event
from ..social.linkedin_posts import fetch_linkedin_company_posts
from ..social.linkedin_public_scraper import fetch_public_linkedin_company_profile


SOURCE_PROVIDER_PATTERNS = {
    "website": "website_provider",
    "directory": "directory_provider",
    "jobs": "job_search_provider",
    "search": "search_provider",
    "linkedin": "linkedin_official_provider",
}

JOB_SOURCE_HINTS = ("career", "jobs", "job", "stellen", "vacanc", "hiring")
CASE_STUDY_HINTS = ("case-study", "case_study", "customer-story", "success-story", "reference")
EVENT_HINTS = ("event", "conference", "webinar", "expo", "fair", "messe")
DIRECTORY_HINTS = ("member", "members", "directory", "association", "sponsor", "exhibitor")
MAX_SEARCH_QUERIES = int(os.getenv("ENRICHMENT_MAX_SEARCH_QUERIES", "6"))


async def enrich_company_sources(company: dict, campaign: dict, website_evidence: list[dict]) -> list[dict]:
    discovery_sources = parse_discovery_sources(campaign.get("discoverySources") or [])
    evidence: list[dict] = []

    evidence.extend(await _website_seed_evidence(discovery_sources))

    linkedin_evidence = await fetch_linkedin_company_posts(company)
    if not linkedin_evidence:
        linkedin_evidence = await fetch_public_linkedin_company_profile(company)
    evidence.extend(_with_provider(linkedin_evidence, "linkedin_official_provider", "completed"))

    linkedin_url = company.get("linkedinUrl") or _first_source_value(discovery_sources, "linkedin")
    if linkedin_url:
        evidence.append(_linkedin_profile_evidence(linkedin_url))

    evidence.extend(await _directory_evidence(discovery_sources))
    evidence.extend(await _search_evidence(company, campaign, discovery_sources))
    evidence.extend(await _job_search_evidence(company, campaign, discovery_sources))

    all_evidence = dedupe_evidence([
        *_with_provider(website_evidence, "website_provider", "completed"),
        *evidence,
    ])

    log_event(
        "source_enrichment_completed",
        companyId=str(company.get("_id", "")),
        providerCounts=_provider_counts(all_evidence),
        statusCounts=_status_counts(all_evidence),
        evidenceCount=len(all_evidence),
    )
    return all_evidence


def parse_discovery_sources(raw_sources: list[str]) -> list[dict]:
    parsed = []
    for index, raw in enumerate(raw_sources or []):
        value = str(raw).strip()
        if not value:
            continue
        if ":" in value:
            prefix, remainder = value.split(":", 1)
            source_type = prefix.strip().lower()
            if source_type in SOURCE_PROVIDER_PATTERNS and remainder.strip():
                parsed.append({"type": source_type, "value": remainder.strip(), "raw": value, "rank": index + 1})
                continue
        parsed.append({"type": "legacy", "value": value, "raw": value, "rank": index + 1})
    return parsed


def dedupe_evidence(evidence_list: list[dict]) -> list[dict]:
    seen = set()
    deduped = []
    for evidence in evidence_list:
        url = _normalize_url(evidence.get("url", ""))
        content_hash = evidence.get("contentHash") or _content_hash(evidence.get("cleanedText") or evidence.get("rawText") or "")
        key = (url, content_hash)
        if key in seen:
            continue
        seen.add(key)
        evidence["normalizedUrl"] = url
        evidence["contentHash"] = content_hash
        deduped.append(evidence)
    return deduped


async def _website_seed_evidence(sources: list[dict]) -> list[dict]:
    urls = [
        source["value"]
        for source in sources
        if source["type"] == "website" and _looks_like_url(source["value"])
    ]
    evidence = []
    for rank, url in enumerate(urls, start=1):
        log_event("source_provider_start", provider="website_provider", url=url, rank=rank)
        page = await fetch_page(url)
        if not page:
            evidence.append(_retrieval_marker(url, "website_provider", "unknown_page", "failed", rank, error="Could not fetch configured website source"))
            log_event("source_provider_failed", provider="website_provider", url=url, rank=rank)
            continue
        source_type = _classify_enriched_page(page.get("url") or url, page.get("title", ""), page.get("cleaned_text", ""), "unknown_page")
        evidence_item = _page_to_evidence(page.get("url") or url, page, source_type, "website_provider", "completed", rank=rank)
        if evidence_item:
            evidence.append(evidence_item)
        log_event("source_provider_end", provider="website_provider", url=url, rank=rank, evidenceCount=1 if evidence_item else 0)
    return evidence


async def _directory_evidence(sources: list[dict]) -> list[dict]:
    urls = [
        source["value"]
        for source in sources
        if source["type"] in {"directory", "legacy"} and _looks_like_url(source["value"])
    ]
    evidence = []
    for rank, url in enumerate(urls, start=1):
        log_event("source_provider_start", provider="directory_provider", url=url, rank=rank)
        page = await fetch_page(url)
        if not page:
            evidence.append(_retrieval_marker(url, "directory_provider", "website_directory", "failed", rank, error="Could not fetch directory source"))
            log_event("source_provider_failed", provider="directory_provider", url=url, rank=rank)
            continue
        source_type = _classify_enriched_page(page.get("url") or url, page.get("title", ""), page.get("cleaned_text", ""), "website_directory")
        evidence_item = _page_to_evidence(page.get("url") or url, page, source_type, "directory_provider", "completed", rank=rank)
        if evidence_item:
            evidence.append(evidence_item)
        log_event("source_provider_end", provider="directory_provider", url=url, rank=rank, evidenceCount=1 if evidence_item else 0)
    return evidence


async def _search_evidence(company: dict, campaign: dict, sources: list[dict]) -> list[dict]:
    queries = [source["value"] for source in sources if source["type"] == "search"]
    if not queries:
        return []
    return await _run_search_queries(queries, "search_provider", "search_result", company)


async def _job_search_evidence(company: dict, campaign: dict, sources: list[dict]) -> list[dict]:
    queries = [source["value"] for source in sources if source["type"] == "jobs"]
    if not queries:
        company_name = company.get("name", "")
        buying_signals = campaign.get("buyingSignals") or campaign.get("keywords") or []
        queries = [
            f"{company_name} {signal} jobs"
            for signal in buying_signals[:4]
            if company_name and signal
        ]
    return await _run_search_queries(queries[:MAX_SEARCH_QUERIES], "job_search_provider", "job_posting", company)


async def _run_search_queries(queries: list[str], provider: str, source_type: str, company: dict) -> list[dict]:
    if not queries:
        return []
    if not _search_enabled():
        limited_queries = queries[:MAX_SEARCH_QUERIES]
        log_event(
            "optional_search_provider_disabled",
            provider=provider,
            queryCount=len(limited_queries),
        )
        return [
            _provider_status_marker(
                provider,
                source_type,
                "disabled",
                "Search provider disabled; configure BRAVE_SEARCH_API_KEY, BING_SEARCH_API_KEY or GOOGLE_CSE_API_KEY/GOOGLE_CSE_ID.",
                limited_queries,
            )
        ]
    results = []
    for query in queries[:MAX_SEARCH_QUERIES]:
        log_event("source_provider_start", provider=provider, query=query)
        provider_results = await _brave_search(query, provider, source_type)
        if not provider_results:
            provider_results = await _bing_search(query, provider, source_type)
        if not provider_results:
            provider_results = await _google_cse_search(query, provider, source_type)
        results.extend(provider_results)
        log_event("source_provider_end", provider=provider, query=query, evidenceCount=len(provider_results))
    log_event(
        "optional_search_provider_completed",
        provider=provider,
        queryCount=len(queries),
        resultCount=len(results),
        enabled=bool(os.getenv("BRAVE_SEARCH_API_KEY") or os.getenv("BING_SEARCH_API_KEY") or (os.getenv("GOOGLE_CSE_API_KEY") and os.getenv("GOOGLE_CSE_ID"))),
    )
    return results


async def _brave_search(query: str, provider: str, source_type: str) -> list[dict]:
    api_key = os.getenv("BRAVE_SEARCH_API_KEY", "").strip()
    if not api_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                headers={"Accept": "application/json", "X-Subscription-Token": api_key},
                params={"q": query, "count": 5},
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:
        log_event("search_provider_failed", provider=provider, query=query, error=f"{type(exc).__name__}: {exc}")
        return []
    items = [
        {"name": item.get("title"), "url": item.get("url"), "snippet": item.get("description")}
        for item in payload.get("web", {}).get("results", [])
    ]
    return _search_payload_to_evidence(items, query, provider, source_type)


async def _bing_search(query: str, provider: str, source_type: str) -> list[dict]:
    api_key = os.getenv("BING_SEARCH_API_KEY", "").strip()
    if not api_key:
        return []
    endpoint = os.getenv("BING_SEARCH_ENDPOINT", "https://api.bing.microsoft.com/v7.0/search")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                endpoint,
                headers={"Ocp-Apim-Subscription-Key": api_key},
                params={"q": query, "count": 5, "responseFilter": "Webpages"},
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:
        log_event("search_provider_failed", provider=provider, query=query, error=f"{type(exc).__name__}: {exc}")
        return []
    return _search_payload_to_evidence(payload.get("webPages", {}).get("value", []), query, provider, source_type)


async def _google_cse_search(query: str, provider: str, source_type: str) -> list[dict]:
    api_key = os.getenv("GOOGLE_CSE_API_KEY", "").strip()
    cse_id = os.getenv("GOOGLE_CSE_ID", "").strip()
    if not api_key or not cse_id:
        return []
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                "https://customsearch.googleapis.com/customsearch/v1",
                params={"key": api_key, "cx": cse_id, "q": query, "num": 5},
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:
        log_event("search_provider_failed", provider=provider, query=query, error=f"{type(exc).__name__}: {exc}")
        return []
    items = [
        {"name": item.get("title"), "url": item.get("link"), "snippet": item.get("snippet")}
        for item in payload.get("items", [])
    ]
    return _search_payload_to_evidence(items, query, provider, source_type)


def _search_payload_to_evidence(items: list[dict], query: str, provider: str, source_type: str) -> list[dict]:
    evidence = []
    for rank, item in enumerate(items, start=1):
        url = item.get("url") or item.get("link")
        title = item.get("name") or item.get("title") or url
        snippet = item.get("snippet") or ""
        if not url or not snippet:
            continue
        evidence.append({
            "url": url,
            "pageTitle": title,
            "sourceType": source_type,
            "rawText": snippet,
            "cleanedText": snippet,
            "summary": snippet[:500],
            "provider": provider,
            "providerStatus": _provider_status(provider, "completed", 1, None, [query]),
            "providerQuery": query,
            "sourceRank": rank,
            "sourceConfidence": max(0.35, 0.75 - (rank * 0.07)),
            "confidence": max(0.35, 0.75 - (rank * 0.07)),
            "retrievalStatus": "completed",
            "retrievedAt": datetime.utcnow(),
            "contentHash": _content_hash(snippet),
        })
    return evidence


def _with_provider(evidence_list: list[dict], provider: str, status: str) -> list[dict]:
    enriched = []
    for evidence in evidence_list or []:
        item = dict(evidence)
        item.setdefault("provider", provider)
        item.setdefault("retrievalStatus", status)
        item.setdefault("sourceConfidence", item.get("confidence", 0.75))
        item.setdefault("providerStatus", _provider_status(item.get("provider", provider), item.get("retrievalStatus", status), 1, None, [item.get("url", "")]))
        item["sourceType"] = _classify_enriched_page(
            item.get("url", ""),
            item.get("pageTitle", ""),
            item.get("cleanedText", ""),
            item.get("sourceType", "unknown_page"),
        )
        enriched.append(item)
    return enriched


def _page_to_evidence(url: str, page: dict, source_type: str, provider: str, status: str, rank: int | None = None) -> dict | None:
    text = page.get("cleaned_text") or ""
    if len(text) < 30:
        return None
    return {
        "url": url,
        "pageTitle": page.get("title", ""),
        "sourceType": source_type,
        "rawText": page.get("raw_html", ""),
        "cleanedText": text,
        "summary": text[:500],
        "provider": provider,
        "providerStatus": _provider_status(provider, status, 1, None, [url]),
        "sourceRank": rank,
        "sourceConfidence": 0.7,
        "confidence": 0.7,
        "retrievalStatus": status,
        "retrievedAt": datetime.utcnow(),
        "contentHash": _content_hash(text),
    }


def _retrieval_marker(url: str, provider: str, source_type: str, status: str, rank: int | None = None, error: str | None = None) -> dict:
    text = f"Provider {provider} could not retrieve {url}"
    return {
        "url": url,
        "pageTitle": url,
        "sourceType": source_type,
        "rawText": text,
        "cleanedText": text,
        "summary": text,
        "provider": provider,
        "providerStatus": _provider_status(provider, status, 0, error or text, [url]),
        "sourceRank": rank,
        "sourceConfidence": 0.1,
        "confidence": 0.1,
        "retrievalStatus": status,
        "retrievedAt": datetime.utcnow(),
        "contentHash": _content_hash(text),
    }


def _provider_status_marker(provider: str, source_type: str, status: str, error: str, attempted: list[str]) -> dict:
    text = f"Provider {provider} status: {status}. {error}"
    return {
        "url": f"provider://{provider}/{status}",
        "pageTitle": f"{provider} {status}",
        "sourceType": source_type,
        "rawText": text,
        "cleanedText": text,
        "summary": text,
        "provider": provider,
        "providerStatus": _provider_status(provider, status, 0, error, attempted),
        "sourceConfidence": 0.1,
        "confidence": 0.1,
        "retrievalStatus": status,
        "retrievedAt": datetime.utcnow(),
        "contentHash": _content_hash(text),
    }


def _linkedin_profile_evidence(linkedin_url: str) -> dict:
    text = f"LinkedIn company profile URL supplied: {linkedin_url}"
    return {
        "url": linkedin_url,
        "pageTitle": "LinkedIn company profile",
        "sourceType": "linkedin_company_profile",
        "rawText": text,
        "cleanedText": text,
        "summary": text,
        "provider": "linkedin_official_provider",
        "providerStatus": _provider_status("linkedin_official_provider", "completed", 1, None, [linkedin_url]),
        "sourceConfidence": 0.45,
        "confidence": 0.45,
        "retrievalStatus": "metadata_only",
        "retrievedAt": datetime.utcnow(),
        "contentHash": _content_hash(text),
    }


def _classify_enriched_page(url: str, title: str, text: str, fallback: str) -> str:
    value = f"{url} {title}".lower()
    if any(hint in value for hint in JOB_SOURCE_HINTS):
        return "website_jobs"
    if any(hint in value for hint in CASE_STUDY_HINTS):
        return "website_case_study"
    if any(hint in value for hint in EVENT_HINTS):
        return "website_event"
    if any(hint in value for hint in DIRECTORY_HINTS):
        return "website_directory"
    classified = classify_page(url, title, text)
    return classified if classified != "unknown_page" else fallback


def _first_source_value(sources: list[dict], source_type: str) -> str:
    for source in sources:
        if source.get("type") == source_type:
            return source.get("value", "")
    return ""


def _provider_counts(evidence_list: list[dict]) -> dict:
    counts: dict[str, int] = {}
    for evidence in evidence_list:
        provider = evidence.get("provider", "unknown_provider")
        counts[provider] = counts.get(provider, 0) + 1
    return counts


def _status_counts(evidence_list: list[dict]) -> dict:
    counts: dict[str, int] = {}
    for evidence in evidence_list:
        status = evidence.get("retrievalStatus", "unknown")
        counts[status] = counts.get(status, 0) + 1
    return counts


def _provider_status(provider: str, status: str, evidence_count: int, error: str | None, attempted: list[str]) -> dict:
    return {
        "provider": provider,
        "status": status,
        "evidenceCount": evidence_count,
        "error": error,
        "attempted": attempted,
        "retrievedAt": datetime.utcnow().isoformat() + "Z",
    }


def _looks_like_url(value: str) -> bool:
    return value.startswith(("http://", "https://")) or "." in value.split("/", 1)[0]


def _search_enabled() -> bool:
    return bool(os.getenv("BRAVE_SEARCH_API_KEY") or os.getenv("BING_SEARCH_API_KEY") or (os.getenv("GOOGLE_CSE_API_KEY") and os.getenv("GOOGLE_CSE_ID")))


def _normalize_url(url: str) -> str:
    if not url:
        return ""
    parsed = urlparse(url if url.startswith(("http://", "https://")) else f"https://{url}")
    host = parsed.netloc.lower().removeprefix("www.")
    path = parsed.path.rstrip("/")
    return f"{host}{path}".lower()


def _content_hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()
