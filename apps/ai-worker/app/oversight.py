import json
from datetime import datetime

from .services.llm_client import generate_json


async def review_opportunity(
    company_profile: dict,
    signals: list[dict],
    score_data: dict,
    contacts: list[dict],
    campaign: dict,
) -> dict:
    prompt = f"""
Review this qualified B2B opportunity using only the structured facts below.

Campaign:
{json.dumps(_compact_campaign(campaign), ensure_ascii=False, indent=2)}

Company profile:
{json.dumps(company_profile, ensure_ascii=False, indent=2)}

Score:
{json.dumps(score_data, ensure_ascii=False, indent=2)}

Structured facts:
{json.dumps(signals[:12], ensure_ascii=False, indent=2)}

Contacts:
{json.dumps(contacts[:8], ensure_ascii=False, indent=2)}

Return a conservative recommendation. Reject weak evidence, mismatched companies, or facts that do not support outreach.
"""
    system_msg = """
Return valid JSON:
{
  "verdict": "approve | reject | needs_human_check",
  "fitConfidence": 0.0,
  "signalQuality": 0.0,
  "buyingLikelihood": 0.0,
  "recommendedAngle": "string",
  "risks": ["string"],
  "reasoning": "string"
}
"""
    result = await generate_json(prompt, system_message=system_msg, task="oversight", max_tokens=2500)
    verdict = result.get("verdict")
    if verdict not in {"approve", "reject", "needs_human_check"}:
        verdict = "needs_human_check"
    result["verdict"] = verdict
    result["model"] = result.get("_model", "")
    result["reviewedAt"] = datetime.utcnow()
    return result


def skipped_oversight(reason: str = "Score below oversight threshold") -> dict:
    return {
        "verdict": "skipped",
        "fitConfidence": 0,
        "signalQuality": 0,
        "buyingLikelihood": 0,
        "recommendedAngle": "",
        "risks": [],
        "reasoning": reason,
        "model": "not_run",
        "reviewedAt": datetime.utcnow(),
    }


def _compact_campaign(campaign: dict) -> dict:
    return {
        "target_industries": campaign.get("targetIndustries", []),
        "target_company_types": campaign.get("targetCompanyTypes", []),
        "buying_signals": campaign.get("buyingSignals", []),
        "negative_signals": campaign.get("negativeSignals", []),
        "target_roles": campaign.get("targetRoles", []),
        "offer": campaign.get("offer", ""),
    }
