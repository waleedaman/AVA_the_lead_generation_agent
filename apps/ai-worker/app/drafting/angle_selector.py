from ..services.llm_client import generate_json

ANGLE_PROMPT_TEMPLATE = """
Select the best outreach angle for a technical B2B first message.

Campaign Tone: {campaign_tone}
Campaign Offer: {campaign_offer}

Company Profile:
{company_profile}

Contact Profile:
{contact_profile}

Source-backed signals (Company & Contact):
{signals}

Rules:
- Choose an angle that connects the Campaign Offer with the Contact's specific background and the Company's needs ("Why You, Why Now").
- Use only source-backed signals.
- Prefer specific technical signals over generic ones.
- Avoid overclaiming or generic flattery.
- Return supporting evidence IDs when available.
"""

async def select_angle(company_profile: dict, signals: list, campaign: dict, contact_profile: dict | None = None) -> dict:
    """
    Selects the best outreach angle based on intelligence.
    """
    prompt = ANGLE_PROMPT_TEMPLATE.format(
        campaign_tone=campaign.get('tone', 'technical'),
        campaign_offer=campaign.get('offer', ''),
        company_profile=company_profile,
        contact_profile=contact_profile or "Not available",
        signals=signals
    )
    
    system_msg = """
Return valid JSON:
{
  "selected_angle_type": "string",
  "selected_angle": "string (brief summary of the angle)",
  "primary_signal_used": "string",
  "reasoning": "string",
  "supporting_evidence_ids": ["string"],
  "confidence": 0.0
}
    """
    
    angle_data = await generate_json(prompt, system_message=system_msg, task="angle_selection")
    return angle_data
