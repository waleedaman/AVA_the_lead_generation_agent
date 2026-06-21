from ..services.llm_client import generate_json

EMAIL_PROMPT_TEMPLATE = """
Write a concise first-touch B2B outreach email.

Rules:
1. Maximum 130 words.
2. Tone: {tone}
3. Mention only facts supported by the supplied evidence.
4. Do not say "I noticed your company is struggling".
5. Use one soft CTA: {cta}
6. The message is from {sender_name}{sender_role_phrase}.
7. Use the sender company/product profile as the offer context.
8. Do not make unsupported guarantees or forbidden compliance claims.
9. Personalize the opening by referencing the Contact's specific background, recent activity, or role to prove this is not an automated mass-email.

Target Contact: {contact_info}
Contact Profile (Background & Activity):
{contact_profile}

Company Name: {company_name}
Angle: {angle}
Signal/Evidence to reference: {evidence}
Sender Company/Product Profile:
{product_profile}
Offer: {offer}
Sources: {sources}
"""

async def generate_email_draft(company_name: str, angle: dict, campaign: dict, sources: list[str] | None = None, contact: dict | None = None, contact_profile: dict | None = None) -> dict:
    """
    Generates an email draft using the LLM.
    """
    contact_info = "Generic/Unknown"
    if contact:
        contact_info = f"Name: {contact.get('name', 'Unknown')}, Title: {contact.get('title', 'Unknown')}"
    product_profile = campaign.get("productProfile") or {}
    sender_name = product_profile.get("senderName") or "Muhammad"
    sender_role = product_profile.get("senderRole") or ""

    prompt = EMAIL_PROMPT_TEMPLATE.format(
        tone=campaign.get('tone', 'technical, concise, direct'),
        cta=campaign.get('cta', 'Would it be useful to see a short demo?'),
        sender_name=sender_name,
        sender_role_phrase=f", {sender_role}" if sender_role else "",
        company_name=company_name,
        contact_info=contact_info,
        contact_profile=contact_profile or "Not available",
        angle=angle.get('selected_angle', ''),
        evidence=angle.get('primary_signal_used', ''),
        product_profile=_format_product_profile(product_profile),
        offer=campaign.get('offer', ''),
        sources=", ".join(sources or angle.get('supporting_evidence_ids', []))
    )
    
    system_msg = """
Return valid JSON:
{
  "subject": "string",
  "message": "string (use \\n for line breaks)",
  "reasoning": "string",
  "sources_used": ["string"],
  "risk_flags": ["string"]
}
    """
    
    draft_data = await generate_json(prompt, system_message=system_msg, task="drafting")
    return draft_data


def _format_product_profile(profile: dict) -> str:
    lines = [
        f"Company: {profile.get('companyName', '')}",
        f"Product: {profile.get('productName', '')}",
        f"Website: {profile.get('website', '')}",
        f"Product page: {profile.get('productPageUrl', '')}",
        f"Description: {profile.get('description', '')}",
        f"Value proposition: {profile.get('valueProposition', '')}",
        f"Pain points solved: {', '.join(profile.get('painPointsSolved') or [])}",
        f"Differentiators: {', '.join(profile.get('differentiators') or [])}",
        f"Proof points: {', '.join(profile.get('proofPoints') or [])}",
        f"Claims to avoid: {', '.join(profile.get('complianceClaimsToAvoid') or [])}",
    ]
    return "\n".join(line for line in lines if not line.endswith(": "))
