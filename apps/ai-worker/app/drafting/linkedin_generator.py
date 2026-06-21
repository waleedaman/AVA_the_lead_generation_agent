from ..services.llm_client import generate_json

LINKEDIN_PROMPT_TEMPLATE = """
Write a concise LinkedIn connection request and follow-up message.

Rules:
1. Connection message MUST be under 300 characters.
2. Follow-up message should be under 100 words.
3. Tone: {tone}
4. Focus on networking and mutual value, not a hard pitch.
5. Personalize the opening by referencing the Contact's specific background, recent activity, or role to prove this is not automated.

Target Contact: {contact_info}
Contact Profile (Background & Activity):
{contact_profile}

Company Name: {company_name}
Angle: {angle}
Sender Company/Product Profile:
{product_profile}
Offer: {offer}
"""

async def generate_linkedin_draft(company_name: str, angle: dict, campaign: dict, contact: dict | None = None, contact_profile: dict | None = None) -> dict:
    """
    Generates a LinkedIn message draft using the LLM.
    """
    contact_info = "Generic/Unknown"
    if contact:
        contact_info = f"Name: {contact.get('name', 'Unknown')}, Title: {contact.get('title', 'Unknown')}"
        
    prompt = LINKEDIN_PROMPT_TEMPLATE.format(
        tone=campaign.get('tone', 'conversational, peer-to-peer'),
        company_name=company_name,
        contact_info=contact_info,
        contact_profile=contact_profile or "Not available",
        angle=angle.get('selected_angle', ''),
        product_profile=_format_product_profile(campaign.get("productProfile") or {}),
        offer=campaign.get('offer', '')
    )
    
    system_msg = """
Return valid JSON:
{
  "connection_message": "string (under 300 chars)",
  "follow_up_message": "string"
}
    """
    
    draft_data = await generate_json(prompt, system_message=system_msg, task="drafting")
    return draft_data


def _format_product_profile(profile: dict) -> str:
    lines = [
        f"Company: {profile.get('companyName', '')}",
        f"Product: {profile.get('productName', '')}",
        f"Description: {profile.get('description', '')}",
        f"Value proposition: {profile.get('valueProposition', '')}",
        f"Claims to avoid: {', '.join(profile.get('complianceClaimsToAvoid') or [])}",
    ]
    return "\n".join(line for line in lines if not line.endswith(": "))
