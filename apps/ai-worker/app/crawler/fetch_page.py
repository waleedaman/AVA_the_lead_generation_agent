import os
import httpx
from bs4 import BeautifulSoup
import trafilatura
from typing import Optional, Dict

CRAWLER_TIMEOUT_SECONDS = int(os.getenv("CRAWLER_TIMEOUT_SECONDS", "15"))
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
        async with httpx.AsyncClient(
            verify=CRAWLER_VERIFY_TLS,
            follow_redirects=True,
            headers={"User-Agent": CRAWLER_USER_AGENT},
        ) as client:
            response = await client.get(url, timeout=timeout or CRAWLER_TIMEOUT_SECONDS)
            
            if response.status_code != 200:
                return None
                
            html_content = response.text
            
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
