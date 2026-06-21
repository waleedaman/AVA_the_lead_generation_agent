from datetime import datetime
import os

from .apollo_client import search_contacts
from .fallback_contact_discovery import discover_fallback_contacts
from ..services.service_logger import log_event

MAX_CONTACTS_PER_COMPANY = int(os.getenv("CONTACT_DISCOVERY_MAX_CONTACTS", "10"))


async def discover_contacts_for_company(db, campaign_oid, company_oid, company: dict, campaign: dict) -> list[dict]:
    target_roles = campaign.get("targetRoles") or []
    if not target_roles:
        return []

    domain = company.get("domain") or _domain_from_url(company.get("website", ""))
    if not domain:
        return []

    contacts = await search_contacts(domain, target_roles)
    if not contacts:
        log_event(
            "contact_discovery_provider_fallback",
            companyId=str(company_oid),
            domain=domain,
            reason="apollo_returned_no_contacts",
        )
        contacts = await discover_fallback_contacts(company, target_roles)

    ranked = _rank_contacts(contacts, target_roles)
    contact_records = []
    now = datetime.utcnow()
    for index, contact in enumerate(ranked[:MAX_CONTACTS_PER_COMPANY]):
        contact_records.append({
            "campaignId": campaign_oid,
            "companyId": company_oid,
            "name": contact.get("name"),
            "title": contact.get("title"),
            "email": contact.get("email"),
            "linkedinUrl": contact.get("linkedinUrl"),
            "roleMatchScore": contact.get("roleMatchScore", 0),
            "emailConfidence": contact.get("emailConfidence", 0.8 if contact.get("email") else 0),
            "emailRoutingType": contact.get("emailRoutingType"),
            "emailRoutingNote": contact.get("emailRoutingNote"),
            "source": contact.get("source", "apollo"),
            "sourceUrl": contact.get("sourceUrl"),
            "providerConfidence": contact.get("providerConfidence", contact.get("sourceConfidence", 0.7)),
            "recommended": index == 0,
            "status": "discovered",
            "createdAt": now,
            "updatedAt": now,
        })

    await db.contacts.delete_many({"companyId": company_oid})
    if contact_records:
        await db.contacts.insert_many(contact_records)
    log_event(
        "contact_discovery_completed",
        companyId=str(company_oid),
        domain=domain,
        targetRoles=target_roles,
        contactCount=len(contact_records),
        sources=sorted(set(record.get("source", "") for record in contact_records)),
    )
    return contact_records


def _rank_contacts(contacts: list[dict], target_roles: list[str]) -> list[dict]:
    ranked = []
    for contact in contacts:
        score = _role_match_score(contact.get("title", ""), target_roles)
        next_contact = {**contact, "roleMatchScore": score, "source": contact.get("source", "apollo")}
        ranked.append(next_contact)
    ranked.sort(key=_contact_rank_key, reverse=True)
    return ranked


def _contact_rank_key(contact: dict) -> tuple[float, int, float, int, float]:
    role_score = float(contact.get("roleMatchScore", 0) or 0)
    has_person_name = 0 if _is_routing_or_company_contact(contact) else 1
    has_email = 1 if contact.get("email") else 0
    has_person_linkedin = 1 if "/in/" in (contact.get("linkedinUrl") or "") else 0
    provider_confidence = float(contact.get("providerConfidence", contact.get("sourceConfidence", 0)) or 0)
    if contact.get("emailRoutingType") == "general_inbox":
        has_email = 0.5
    return (role_score, has_person_name, has_email, has_person_linkedin, provider_confidence)


def _is_routing_or_company_contact(contact: dict) -> bool:
    name = (contact.get("name") or "").lower()
    source = contact.get("source") or ""
    return (
        contact.get("emailRoutingType") == "general_inbox"
        or source == "linkedin_company_fallback"
        or "inbox" in name
        or "team" in name
        or name == "linkedin company page"
    )


def _role_match_score(title: str | None, target_roles: list[str]) -> float:
    if not title or not target_roles:
        return 0
    title_lower = title.lower()
    scores = []
    for role in target_roles:
        role_lower = role.lower()
        if role_lower == title_lower:
            scores.append(1)
        elif role_lower in title_lower or title_lower in role_lower:
            scores.append(0.85)
        else:
            tokens = [token for token in role_lower.replace("/", " ").split() if len(token) > 2]
            overlap = sum(1 for token in tokens if token in title_lower)
            scores.append(overlap / len(tokens) if tokens else 0)
    return round(max(scores), 2) if scores else 0


def _domain_from_url(url: str) -> str:
    from urllib.parse import urlparse

    if not url:
        return ""
    parsed = urlparse(url if url.startswith(("http://", "https://")) else f"https://{url}")
    domain = parsed.netloc.lower()
    return domain[4:] if domain.startswith("www.") else domain
