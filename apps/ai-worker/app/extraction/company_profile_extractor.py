from ..services.llm_client import generate_json
import json

PROFILE_PROMPT_TEMPLATE = """
You are a B2B research assistant for a technical outreach agent.
Your task is to create a concise company profile using only the provided website evidence.

Do not invent facts.
If information is not present, write "unknown".
Assess relevance against this campaign context:
{campaign_context}

Evidence:
{evidence}
"""

async def extract_company_profile(evidence_texts: list[str], campaign: dict | None = None) -> dict:
    """
    Extracts a company profile from aggregated evidence texts.
    """
    if not evidence_texts:
        return {}
        
    combined_evidence = "\n\n---\n\n".join(evidence_texts[:5]) # limit to top 5 evidence texts to save context
    
    compact_campaign = {
        "target_industries": (campaign or {}).get("targetIndustries", []),
        "target_company_types": (campaign or {}).get("targetCompanyTypes", []),
        "buying_signals": (campaign or {}).get("buyingSignals", []),
        "negative_signals": (campaign or {}).get("negativeSignals", []),
        "regions": (campaign or {}).get("regions", []),
    }
    prompt = PROFILE_PROMPT_TEMPLATE.format(
        evidence=combined_evidence,
        campaign_context=json.dumps(compact_campaign, ensure_ascii=False, indent=2),
    )
    
    system_msg = """
Return valid JSON with this structure:
{
  "company_summary": "string",
  "industry_tags": ["string"],
  "location_tags": ["string"],
  "products_services": ["string"],
  "relevant_keywords": ["string"],
  "possible_pain_points": ["string"],
  "evidence_notes": [
    {
      "claim": "string",
      "source_url": "string"
    }
  ]
}
    """
    
    profile_data = await generate_json(
        prompt,
        system_message=system_msg,
        task="profile_extraction",
        max_tokens=2500,
    )
    return profile_data
