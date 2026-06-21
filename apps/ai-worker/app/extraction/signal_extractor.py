from ..services.llm_client import generate_json
import json

SIGNAL_PROMPT_TEMPLATE = """
You are analyzing evidence for B2B lead qualification.

Campaign qualification context:
{campaign_context}

Contact Context (if applicable):
{contact_context}

Evidence:
{evidence_text}

Detected keywords:
{detected_keywords}

Create a list of atomic evidence-backed facts based ONLY on the evidence provided.
Classify each fact as buying_signal, negative_signal, company_fit, hiring_signal, contact_signal, or other.
Do not invent facts.
"""

async def extract_signals(evidence_text: str, detected_keywords: list[str], campaign: dict, evidence_meta: dict | None = None, contact_context: dict | None = None) -> dict:
    """
    Extracts structured facts from a specific piece of evidence.
    """
    compact_campaign = {
        "target_industries": campaign.get("targetIndustries", []),
        "target_company_types": campaign.get("targetCompanyTypes", []),
        "buying_signals": campaign.get("buyingSignals", []),
        "negative_signals": campaign.get("negativeSignals", []),
        "target_roles": campaign.get("targetRoles", []),
        "regions": campaign.get("regions", []),
        "source": evidence_meta or {},
    }
    
    contact_ctx_str = "None"
    if contact_context:
        contact_ctx_str = json.dumps(contact_context, ensure_ascii=False, indent=2)
        
    prompt = SIGNAL_PROMPT_TEMPLATE.format(
        evidence_text=evidence_text,
        detected_keywords=", ".join(detected_keywords),
        campaign_context=json.dumps(compact_campaign, ensure_ascii=False, indent=2),
        contact_context=contact_ctx_str,
    )
    
    system_msg = """
Return valid JSON:
{
  "signals": [
    {
      "signal_type": "string",
      "signal_key": "string matching the closest configured signal or term",
      "fact_type": "buying_signal | negative_signal | company_fit | hiring_signal | other",
      "fact": "string, one atomic source-backed fact",
      "description": "string",
      "evidence_snippet": "string",
      "relevance_score": "number between 0 and 1",
      "confidence": "number between 0 and 1"
    }
  ]
}
    """
    
    signal_data = await generate_json(
        prompt,
        system_message=system_msg,
        task="signal_extraction",
        max_tokens=1800,
    )
    return signal_data
