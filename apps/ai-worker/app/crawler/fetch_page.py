import os
import httpx
from bs4 import BeautifulSoup
import trafilatura
from typing import Optional, Dict
from urllib.parse import urljoin

from .url_safety import UnsafeUrlError, validate_public_http_url

CRAWLER_TIMEOUT_SECONDS = int(os.getenv("CRAWLER_TIMEOUT_SECONDS", "15"))
CRAWLER_MAX_REDIRECTS = int(os.getenv("CRAWLER_MAX_REDIRECTS", "5"))
CRAWLER_MAX_RESPONSE_BYTES = int(os.getenv("CRAWLER_MAX_RESPONSE_BYTES", "2000000"))
CRAWLER_VERIFY_TLS = os.getenv("CRAWLER_VERIFY_TLS", "true").lower() not in {
    "0",
    "false",
    "no",
}
CRAWLER_USER_AGENT = os.getenv(
    "CRAWLER_USER_AGENT",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
)

async def fetch_page(url: str, timeout: int | None = None) -> Optional[Dict]:
    """
    Fetches a web page, parses links, and extracts main text using trafilatura.
    """
    try:
        current_url = validate_public_http_url(url)
        async with httpx.AsyncClient(
            verify=CRAWLER_VERIFY_TLS,
            follow_redirects=False,
            headers={"User-Agent": CRAWLER_USER_AGENT},
        ) as client:
            response = None
            for _redirect in range(CRAWLER_MAX_REDIRECTS + 1):
                response = await client.get(current_url, timeout=timeout or CRAWLER_TIMEOUT_SECONDS)
                if response.status_code not in {301, 302, 303, 307, 308}:
                    break
                location = response.headers.get("location")
                if not location:
                    return None
                current_url = validate_public_http_url(urljoin(str(response.url), location))
            else:
                print(f"Blocked {url}: too many redirects")
                return None
            
            if response is None or response.status_code != 200:
                return None

            body = response.content
            if len(body) > CRAWLER_MAX_RESPONSE_BYTES:
                print(f"Blocked {current_url}: response too large")
                return None

            html_content = body.decode(response.encoding or "utf-8", errors="replace")
            
            # Use BeautifulSoup for basic title and links
            soup = BeautifulSoup(html_content, 'lxml')
            title = soup.title.string if soup.title else ""
            
            links = []
            for a_tag in soup.find_all('a', href=True):
                href = a_tag['href']
                if href.startswith('http') or href.startswith('/'):
                    links.append(href)
                    
            # Use Trafilatura for clean text extraction
            cleaned_text = trafilatura.extract(html_content, include_links=False, include_images=False, include_tables=True)
            
            return {
                "url": str(response.url),
                "title": title.strip() if title else "",
                "status_code": response.status_code,
                "raw_html": html_content,
                "cleaned_text": cleaned_text or "",
                "links": list(set(links)) # deduplicate
            }
            
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None
