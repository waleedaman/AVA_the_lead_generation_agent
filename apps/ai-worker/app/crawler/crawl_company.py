import os
from typing import List, Dict
import hashlib
from datetime import datetime
from urllib.parse import urlparse

from .normalize import normalize_domain
from .fetch_page import fetch_page
from .discover_links import resolve_links, select_priority_pages
from .classify_page import classify_page

CRAWLER_MAX_PAGES = int(os.getenv("CRAWLER_MAX_PAGES", "10"))

async def crawl_company_website(company_url: str, priority_terms: list[str] | None = None) -> List[Dict]:
    """
    Orchestrates the crawling of a single company website.
    Returns a list of evidence dictionaries.
    """
    domain = normalize_domain(company_url)
    if not domain:
        return []
        
    base_url = f"https://{domain}"
    print(f"Starting crawl for {base_url}")
    
    # 1. Fetch homepage
    homepage_data = await fetch_page(base_url)
    if not homepage_data:
        # Fallback to http
        base_url = f"http://{domain}"
        homepage_data = await fetch_page(base_url)
        if not homepage_data:
            # Fallback to www
            base_url = f"https://www.{domain}"
            homepage_data = await fetch_page(base_url)
            if not homepage_data:
                print(f"Could not reach homepage for {domain}")
                return []
            
    evidence_list = []
    
    # Process homepage
    homepage_evidence = _create_evidence(base_url, homepage_data, "website_homepage")
    if homepage_evidence:
        evidence_list.append(homepage_evidence)
        
    # 2. Discover links from homepage
    all_links = resolve_links(base_url, homepage_data["links"])
    
    # Filter to only same-domain links
    internal_links = [link for link in all_links if _same_domain(link, domain)]
    
    # 3. Select priority pages
    priority_links = select_priority_pages(internal_links, max_pages=CRAWLER_MAX_PAGES, extra_patterns=priority_terms)
    
    # Make sure we don't fetch homepage again
    priority_links = [link for link in priority_links if link.rstrip('/') != base_url]
    
    # 4. Fetch pages
    for link in priority_links:
        print(f"Fetching priority page: {link}")
        page_data = await fetch_page(link)
        if page_data and page_data["cleaned_text"]:
            source_type = classify_page(link, page_data["title"], page_data["cleaned_text"])
            evidence = _create_evidence(link, page_data, source_type)
            if evidence:
                evidence_list.append(evidence)
                
    return evidence_list

def _same_domain(link: str, domain: str) -> bool:
    hostname = urlparse(link).hostname or ""
    hostname = hostname.lower().removeprefix("www.")
    return hostname == domain or hostname.endswith(f".{domain}")

def _create_evidence(url: str, page_data: Dict, source_type: str) -> Dict:
    text = page_data["cleaned_text"]
    if not text or len(text) < 50:
        return None
        
    content_hash = hashlib.sha256(text.encode('utf-8')).hexdigest()
    
    return {
        "url": url,
        "pageTitle": page_data["title"],
        "sourceType": source_type,
        "rawText": page_data["raw_html"],
        "cleanedText": text,
        "contentHash": content_hash,
        "detectedKeywords": [],
        "detectedSignals": [],
        "confidence": 0.75,
        "retrievedAt": datetime.utcnow()
    }
