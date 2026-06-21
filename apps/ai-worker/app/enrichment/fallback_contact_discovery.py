import re
import os
from urllib.parse import urlparse

from ..crawler.discover_links import resolve_links, select_priority_pages
from ..crawler.fetch_page import fetch_page
from ..services.service_logger import log_event

EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
LINKEDIN_RE = re.compile(r"https?://(?:[\w]+\.)?linkedin\.com/(?:in|company)/[^\s\"'<>]+", re.IGNORECASE)

CONTACT_PATTERNS = [
    "contact",
    "kontakt",
    "impressum",
    "imprint",
    "about",
    "management",
    "leadership",
    "team",
    "sales",
]

GENERIC_EMAIL_PREFIXES = {
    "info",
    "sales",
    "contact",
    "hello",
    "support",
    "service",
    "office",
    "marketing",
    "press",
    "privacy",
}
MAX_CONTACT_FALLBACK_PAGES = int(os.getenv("CONTACT_FALLBACK_MAX_PAGES", "6"))
ROLE_LABEL_RE = re.compile(
    r"\b(?:executive directors?|managing directors?|management board|leadership|head of|director|chief|cto|ceo|manager)\b\s*:?\s*(.+)",
    re.IGNORECASE,
)
HONORIFIC_RE = re.compile(r"\b(?:Dr\.?|Prof\.?)\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ.-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ.-]+)+")
PERSON_NAME_RE = re.compile(r"\b[A-Z][A-Za-zÀ-ÖØ-öø-ÿ.-]{1,}\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ.-]{1,}\b")
HEADING_REJECT_TERMS = {
    "developing",
    "testing",
    "sustainable",
    "agriculture",
    "portfolio",
    "technologies",
    "experience",
    "advances",
    "efficiency",
    "solutions",
    "services",
    "products",
    "contact",
    "privacy",
    "imprint",
    "career",
    "careers",
}


async def discover_fallback_contacts(company: dict, target_roles: list[str]) -> list[dict]:
    website = company.get("website") or ""
    domain = company.get("domain") or _domain_from_url(website)
    contacts: list[dict] = []

    website_contacts = await discover_website_contacts(website, domain, target_roles)
    contacts.extend(website_contacts)

    linkedin_contacts = discover_linkedin_contacts(company, website_contacts)
    contacts.extend(linkedin_contacts)

    deduped = _dedupe_contacts(contacts)
    log_event(
        "fallback_contact_discovery_completed",
        companyId=str(company.get("_id", "")),
        domain=domain,
        websiteContactCount=len(website_contacts),
        linkedinContactCount=len(linkedin_contacts),
        totalCount=len(deduped),
    )
    return deduped


async def discover_website_contacts(website: str, domain: str, target_roles: list[str]) -> list[dict]:
    if not website:
        return []

    pages = []
    homepage = await fetch_page(website)
    if homepage:
        pages.append(homepage)
        links = resolve_links(homepage.get("url") or website, homepage.get("links") or [])
        same_domain_links = [link for link in links if _same_domain(link, domain)]
        for link in select_priority_pages(same_domain_links, max_pages=MAX_CONTACT_FALLBACK_PAGES, extra_patterns=CONTACT_PATTERNS):
            page = await fetch_page(link)
            if page:
                pages.append(page)

    contacts = []
    for page in pages:
        contacts.extend(_contacts_from_page(page, domain, target_roles))

    contacts = _backfill_general_inbox(contacts)

    log_event(
        "website_contact_fallback_completed",
        domain=domain,
        pageCount=len(pages),
        contactCount=len(contacts),
    )
    return _dedupe_contacts(contacts)


def discover_linkedin_contacts(company: dict, website_contacts: list[dict]) -> list[dict]:
    contacts = []
    company_linkedin = company.get("linkedinUrl") or ""
    if company_linkedin:
        contacts.append({
            "name": "LinkedIn company page",
            "title": "Company LinkedIn profile",
            "linkedinUrl": company_linkedin,
            "source": "linkedin_company_fallback",
            "emailConfidence": 0,
            "providerConfidence": 0.45,
        })

    for contact in website_contacts:
        linkedin_url = contact.get("linkedinUrl")
        if linkedin_url and "/in/" in linkedin_url:
            contacts.append({
                "name": contact.get("name") or "LinkedIn profile",
                "title": contact.get("title") or "Contact discovered from LinkedIn link",
                "linkedinUrl": linkedin_url,
                "email": contact.get("email"),
                "source": "linkedin_website_link_fallback",
                "emailConfidence": contact.get("emailConfidence", 0),
                "providerConfidence": contact.get("providerConfidence", 0.55),
            })
    return _dedupe_contacts(contacts)


def _contacts_from_page(page: dict, domain: str, target_roles: list[str]) -> list[dict]:
    text = page.get("cleaned_text") or ""
    raw_html = page.get("raw_html") or ""
    source_url = page.get("url") or ""
    emails = _safe_emails(EMAIL_RE.findall(f"{text}\n{raw_html}"), domain)
    linkedin_urls = sorted(set(LINKEDIN_RE.findall(raw_html)))
    contacts = []

    for person in _people_from_text(text, target_roles):
        email = _best_email_for_person(person.get("name", ""), emails)
        contacts.append({
            "name": person.get("name"),
            "title": person.get("title"),
            "email": email,
            "linkedinUrl": _best_linkedin_for_name(person.get("name", ""), linkedin_urls),
            "source": "website_people_fallback",
            "sourceUrl": source_url,
            "emailConfidence": 0.7 if email and not _is_generic_email(email) else 0.35 if email else 0,
            "emailRoutingType": "direct" if email and not _is_generic_email(email) else "general_inbox" if email else "",
            "providerConfidence": 0.65,
        })

    for email in emails:
        if any(contact.get("email", "").lower() == email.lower() for contact in contacts):
            continue
        prefix = email.split("@", 1)[0].lower()
        contacts.append({
            "name": _team_name_for_email(prefix),
            "title": _title_for_email(prefix),
            "email": email,
            "linkedinUrl": "",
            "source": "website_email_fallback",
            "sourceUrl": source_url,
            "emailConfidence": 0.95 if _is_generic_email(email) else 0.75,
            "emailRoutingType": "general_inbox" if _is_generic_email(email) else "direct",
            "providerConfidence": 0.75,
        })

    for url in linkedin_urls:
        if "/company/" in url:
            continue
        if any(contact.get("linkedinUrl") == url for contact in contacts):
            continue
        contacts.append({
            "name": _name_from_linkedin_url(url),
            "title": "LinkedIn profile linked from company website",
            "linkedinUrl": url,
            "source": "linkedin_website_link_fallback",
            "sourceUrl": source_url,
            "emailConfidence": 0,
            "providerConfidence": 0.55,
        })

    return contacts


def _people_from_text(text: str, target_roles: list[str]) -> list[dict]:
    people = []
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    role_terms = _role_terms(target_roles)
    for index, line in enumerate(lines):
        for labelled in _people_from_labelled_line(line):
            people.append(labelled)
        lower = line.lower()
        if not any(term in lower for term in role_terms):
            continue
        window = lines[max(0, index - 2): min(len(lines), index + 3)]
        name = _find_name(window)
        if name:
            people.append({"name": name, "title": line[:160]})
    return _dedupe_people(people)


def _role_terms(target_roles: list[str]) -> list[str]:
    base = [
        "chief",
        "cto",
        "director",
        "head of",
        "manager",
        "safety",
        "engineering",
        "sales",
        "business development",
        "management",
        "executive",
    ]
    for role in target_roles or []:
        base.extend(token for token in str(role).lower().replace("_", " ").split() if len(token) > 3)
    return sorted(set(base))


def _find_name(lines: list[str]) -> str:
    for line in lines:
        candidate = re.sub(r"\s+", " ", line.strip(" -|:"))
        if len(candidate) > 80 or _looks_like_marketing_heading(candidate):
            continue
        for name in _extract_person_names(candidate):
            return name
    return ""


def _people_from_labelled_line(line: str) -> list[dict]:
    match = ROLE_LABEL_RE.search(line)
    if not match:
        return []
    title = line[:160]
    names_text = match.group(1)
    names = _extract_person_names(names_text)
    return [{"name": name, "title": title} for name in names]


def _extract_person_names(text: str) -> list[str]:
    text = _strip_org_labels(text)
    chunks = re.split(r",|;|\band\b|&| und ", text)
    names = []
    for chunk in chunks:
        cleaned = re.sub(r"\s+", " ", chunk.strip(" .:-|()"))
        if not cleaned or _looks_like_marketing_heading(cleaned):
            continue
        honorific_match = HONORIFIC_RE.search(cleaned)
        candidate = honorific_match.group(0) if honorific_match else ""
        if not candidate:
            name_match = PERSON_NAME_RE.search(cleaned)
            candidate = name_match.group(0) if name_match else ""
        candidate = _clean_person_name(candidate)
        if candidate and _is_plausible_person_name(candidate):
            names.append(candidate)
    return names


def _strip_org_labels(text: str) -> str:
    return re.sub(
        r"\b(?:Persönlich haftende Gesellschafterin|General Partner|GmbH|AG|SE|Inc\.?|Ltd\.?|LLC)\b.*$",
        "",
        text,
        flags=re.IGNORECASE,
    )


def _clean_person_name(name: str) -> str:
    name = re.sub(r"\s+", " ", (name or "").strip(" .:-|,;()"))
    return name


def _is_plausible_person_name(name: str) -> bool:
    tokens = [token for token in re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ.-]+", name) if token.lower() not in {"dr", "prof"}]
    if len(tokens) < 2 or len(tokens) > 4:
        return False
    joined = " ".join(tokens).lower()
    if any(term in joined for term in HEADING_REJECT_TERMS):
        return False
    return all(len(token.strip(".-")) >= 2 for token in tokens)


def _looks_like_marketing_heading(value: str) -> bool:
    tokens = [token.lower() for token in re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ]+", value)]
    if len(tokens) > 6:
        return True
    if tokens and tokens[0].endswith("ing"):
        return True
    return sum(1 for token in tokens if token in HEADING_REJECT_TERMS) >= 2


def _safe_emails(emails: list[str], domain: str) -> list[str]:
    result = []
    for email in emails:
        clean = email.strip(".,;:()[]{}<>").lower()
        if not clean or clean.endswith((".png", ".jpg", ".gif")):
            continue
        if domain and clean.split("@", 1)[1].endswith(domain):
            result.append(clean)
        elif not domain:
            result.append(clean)
    return sorted(set(result))


def _best_email_for_person(name: str, emails: list[str]) -> str:
    tokens = [part.lower() for part in re.findall(r"[A-Za-z]+", name)]
    if len(tokens) >= 2:
        first, last = tokens[0], tokens[-1]
        patterns = [f"{first}.{last}", f"{first}{last}", f"{first[0]}{last}", f"{first}.{last[0]}"]
        for email in emails:
            prefix = email.split("@", 1)[0]
            if any(pattern == prefix for pattern in patterns):
                return email
    return ""


def _backfill_general_inbox(contacts: list[dict]) -> list[dict]:
    fallback_email = _best_general_email(contacts)
    if not fallback_email:
        return contacts

    enriched = []
    for contact in contacts:
        next_contact = dict(contact)
        if (
            not next_contact.get("email")
            and next_contact.get("source") in {"website_people_fallback", "linkedin_website_link_fallback"}
        ):
            next_contact["email"] = fallback_email
            next_contact["emailConfidence"] = 0.45
            next_contact["emailRoutingType"] = "general_inbox"
            next_contact["emailRoutingNote"] = "No personal email found; use general company inbox from website/contact page for routing."
        enriched.append(next_contact)
    return enriched


def _best_general_email(contacts: list[dict]) -> str:
    emails = [
        contact.get("email", "")
        for contact in contacts
        if contact.get("email") and _is_generic_email(contact.get("email", ""))
    ]
    if not emails:
        return ""
    priority = ["sales", "contact", "info", "hello", "office", "service", "support"]
    for prefix in priority:
        for email in emails:
            if email.split("@", 1)[0].lower() == prefix:
                return email
    return emails[0]


def _best_linkedin_for_name(name: str, urls: list[str]) -> str:
    tokens = [part.lower() for part in re.findall(r"[A-Za-z]+", name)]
    for url in urls:
        lower = url.lower()
        if tokens and all(token in lower for token in tokens[:2]):
            return url
    return ""


def _team_name_for_email(prefix: str) -> str:
    if prefix in {"sales", "business", "bd"}:
        return "Sales team"
    if prefix in {"info", "contact", "hello"}:
        return "Company contact inbox"
    if prefix in {"support", "service"}:
        return "Customer support team"
    return prefix.replace(".", " ").replace("_", " ").title()


def _title_for_email(prefix: str) -> str:
    if prefix in {"sales", "business", "bd"}:
        return "Sales / business development"
    if prefix in {"info", "contact", "hello"}:
        return "Official company contact"
    if prefix in {"support", "service"}:
        return "Support / service"
    return "Website-discovered contact"


def _is_generic_email(email: str) -> bool:
    return email.split("@", 1)[0].lower() in GENERIC_EMAIL_PREFIXES


def _name_from_linkedin_url(url: str) -> str:
    slug = url.rstrip("/").split("/")[-1]
    slug = re.sub(r"[-_]+", " ", slug)
    slug = re.sub(r"\d+", "", slug).strip()
    return slug.title() if slug else "LinkedIn profile"


def _dedupe_people(people: list[dict]) -> list[dict]:
    seen = set()
    result = []
    for person in people:
        key = (person.get("name", "").lower(), person.get("title", "").lower())
        if key in seen:
            continue
        seen.add(key)
        result.append(person)
    return result


def _dedupe_contacts(contacts: list[dict]) -> list[dict]:
    seen = set()
    result = []
    for contact in contacts:
        key = (
            (contact.get("email") or "").lower(),
            (contact.get("linkedinUrl") or "").lower(),
            (contact.get("name") or "").lower(),
            (contact.get("title") or "").lower(),
        )
        if key in seen:
            continue
        seen.add(key)
        if contact.get("name") or contact.get("email") or contact.get("linkedinUrl"):
            result.append(contact)
    return result


def _same_domain(url: str, domain: str) -> bool:
    if not domain:
        return True
    return _domain_from_url(url).endswith(domain)


def _domain_from_url(url: str) -> str:
    if not url:
        return ""
    parsed = urlparse(url if url.startswith(("http://", "https://")) else f"https://{url}")
    domain = parsed.netloc.lower()
    return domain[4:] if domain.startswith("www.") else domain
