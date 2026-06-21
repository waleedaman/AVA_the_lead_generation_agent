import urllib.parse
import re

def normalize_domain(url: str) -> str:
    """
    Normalizes a domain by removing protocol, www, paths, and lowercasing.
    """
    if not url:
        return ""
    
    # Add scheme if missing so urlparse works correctly
    if not url.startswith('http://') and not url.startswith('https://'):
        url = 'http://' + url
        
    parsed = urllib.parse.urlparse(url)
    domain = parsed.netloc.lower()
    
    # Remove www.
    if domain.startswith('www.'):
        domain = domain[4:]
        
    # Remove port if present
    if ':' in domain:
        domain = domain.split(':')[0]
        
    return domain
