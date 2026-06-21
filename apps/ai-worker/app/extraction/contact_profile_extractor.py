from ..services.llm_client import generate_json
import json

CONTACT_PROFILE_PROMPT_TEMPLATE = """
You are a B2B research assistant preparing an outreach profile for an individual contact.
Your task is to summarize the contact's professional background, recent activities, and apparent mandate using ONLY the provided evidence.

Contact Name: {contact_name}
Title: {contact_title}
Company: {company_name}

Evidence:
{evidence}

Do not invent facts. If information is not present, return empty lists or "unknown".
"""

async def extract_contact_profile(contact: dict, company: dict, evidence_texts: list[str]) -> dict:
    """
    Extracts a contact profile from aggregated contact evidence texts.
    """
    if not evidence_texts:
        return {}
        
    combined_evidence = "\n\n---\n\n".join(evidence_texts[:5]) # limit to top 5 evidence texts to save context
    
    prompt = CONTACT_PROFILE_PROMPT_TEMPLATE.format(
        contact_name=contact.get("name", "Unknown"),
        contact_title=contact.get("title", "Unknown"),
        company_name=company.get("name", "Unknown"),
        evidence=combined_evidence,
    )
    
    system_msg = """
Return valid JSON with this structure:
{
  "professional_summary": "string",
  "past_experience": ["string"],
  "recent_activities": ["string (e.g., wrote an article about X, spoke at event Y)"],
  "inferred_mandate": "string (what they are likely responsible for)",
  "personal_interests_or_skills": ["string"]
}
    """
    
    profile_data = await generate_json(
        prompt,
        system_message=system_msg,
        task="contact_profile_extraction",
        max_tokens=1500,
    )
    return profile_data
