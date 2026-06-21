import os
import httpx

from ..services.service_logger import log_event


async def search_contacts(domain: str, target_roles: list[str]) -> list[dict]:
    """
    Search for contacts at the specified domain matching target roles using Apollo.io.
    """
    normalized_domain = _normalize_domain(domain)
    normalized_roles = _normalize_roles(target_roles)
    api_key = os.getenv("APOLLO_API_KEY")
    if not api_key:
        print("No Apollo API key set, mocking contact search.")
        return [
            {
                "name": "Jane Doe",
                "title": normalized_roles[0] if normalized_roles else "Executive",
                "email": f"jane.doe@{normalized_domain}",
                "linkedinUrl": f"https://linkedin.com/in/janedoe-{normalized_domain.split('.')[0]}",
            }
        ]
        
    url = "https://api.apollo.io/api/v1/mixed_people/api_search"
    headers = {
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
        "accept": "application/json",
        "X-Api-Key": api_key,
    }
    
    payloads = [
        {
            "q_organization_domains": normalized_domain,
            "person_titles": normalized_roles,
            "page": 1,
            "per_page": 10,
        },
        {
            "q_organization_domains": normalized_domain,
            "page": 1,
            "per_page": 10,
        },
    ]

    try:
        async with httpx.AsyncClient() as client:
            for attempt, payload in enumerate(payloads, start=1):
                try:
                    log_event(
                        "apollo_contact_search_start",
                        domain=normalized_domain,
                        roles=normalized_roles,
                        attempt=attempt,
                        payload=payload,
                    )
                    response = await client.post(url, headers=headers, json=payload, timeout=30.0)
                    response.raise_for_status()
                    data = response.json()
                    contacts = _contacts_from_response(data)
                    log_event(
                        "apollo_contact_search_success",
                        domain=normalized_domain,
                        attempt=attempt,
                        statusCode=response.status_code,
                        resultCount=len(contacts),
                    )
                    return contacts
                except httpx.HTTPStatusError as e:
                    response_text = e.response.text if e.response is not None else ""
                    log_event(
                        "apollo_contact_search_http_error",
                        domain=normalized_domain,
                        attempt=attempt,
                        statusCode=e.response.status_code if e.response is not None else None,
                        response=response_text,
                        payload=payload,
                    )
                    if e.response is None or e.response.status_code != 422 or attempt == len(payloads):
                        raise
            
    except Exception as e:
        print(f"Error fetching contacts from Apollo for {normalized_domain}: {e}")
        log_event(
            "apollo_contact_search_failed",
            domain=normalized_domain,
            roles=normalized_roles,
            error=f"{type(e).__name__}: {e}",
        )
        return []


def _contacts_from_response(data: dict) -> list[dict]:
    people = data.get("people", [])
    contacts = []
    for person in people:
        contacts.append({
            "name": person.get("name", f"{person.get('first_name', '')} {person.get('last_name', '')}".strip()),
            "title": person.get("title"),
            "email": person.get("email"),
            "linkedinUrl": person.get("linkedin_url"),
        })
    return contacts


def _normalize_domain(domain: str) -> str:
    value = (domain or "").strip().lower()
    value = value.removeprefix("https://").removeprefix("http://").split("/", 1)[0]
    return value[4:] if value.startswith("www.") else value


def _normalize_roles(target_roles: list[str]) -> list[str]:
    roles = []
    seen = set()
    for role in target_roles or []:
        normalized = str(role).replace("_", " ").replace("-", " ").strip()
        normalized = " ".join(normalized.split())
        if normalized and normalized.lower() not in seen:
            roles.append(normalized)
            seen.add(normalized.lower())
    return roles
