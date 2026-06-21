import urllib.parse

PRIORITY_PATTERNS = [
    "about",
    "company",
    "services",
    "solutions",
    "products",
    "industries",
    "safety",
    "security",
    "software",
    "engineering",
    "blog",
    "news",
    "career",
    "jobs",
    "contact",
    "impressum"
]

def resolve_links(base_url: str, links: list[str]) -> list[str]:
    """Resolves relative links to absolute URLs."""
    resolved = []
    for link in links:
        try:
            absolute_link = urllib.parse.urljoin(base_url, link)
            # Basic validation
            if absolute_link.startswith('http'):
                resolved.append(absolute_link)
        except Exception:
            pass
    return list(set(resolved))

def select_priority_pages(links: list[str], max_pages: int = 10, extra_patterns: list[str] | None = None) -> list[str]:
    """Selects the most relevant links based on priority patterns."""
    scored_links = []
    
    for link in links:
        score = 0
        link_lower = link.lower()
        
        # Avoid media files
        if any(link_lower.endswith(ext) for ext in ['.pdf', '.jpg', '.png', '.mp4', '.zip']):
            continue
            
        patterns = PRIORITY_PATTERNS + [p for p in (extra_patterns or []) if p]
        for index, pattern in enumerate(patterns):
            if pattern in link_lower:
                # Give higher score to patterns earlier in the list
                score += max(1, len(patterns) - index) * 10
                
        if score > 0:
            scored_links.append((score, link))
            
    # Sort by score descending
    scored_links.sort(key=lambda x: x[0], reverse=True)
    
    # Return top max_pages
    return [link for score, link in scored_links][:max_pages]
