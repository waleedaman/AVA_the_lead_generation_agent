DEFAULT_THRESHOLDS = {
    "minimumScoreForContacts": 50,
    "minimumScoreForOversight": 60,
    "minimumScoreForDraft": 75,
}

DEFAULT_SCORING_WEIGHTS = {
    "buyingSignals": 30,
    "negativeSignals": 20,
    "companyTypeFit": 15,
    "industryFit": 15,
    "geographyFit": 10,
    "evidenceQuality": 5,
    "sourceQuality": 5,
}


DEFAULT_PRODUCT_PROFILE = {
    "companyName": "Aegis SafeForge",
    "productName": "Aegis SafeForge",
    "website": "",
    "productPageUrl": "",
    "description": "AI-assisted workspace for safety-critical and compliance-oriented engineering workflows.",
    "valueProposition": "Helps engineering teams turn evidence, standards context, and review decisions into traceable working material faster.",
    "painPointsSolved": [
        "Manual preparation for safety and risk reviews",
        "Scattered evidence across websites, documents, and notes",
        "Slow handoff from research to outreach context",
    ],
    "differentiators": [
        "Evidence-backed qualification",
        "Human approval before outreach",
        "Traceable facts instead of generic LLM summaries",
    ],
    "proofPoints": [],
    "complianceClaimsToAvoid": [
        "guaranteed compliance",
        "certified compliance",
        "ensure compliance",
        "guaranteed certification",
    ],
    "senderName": "Muhammad",
    "senderRole": "",
    "defaultCta": "Would it be useful to compare notes on where this could fit?",
}


def normalize_campaign_context(campaign: dict | None, product_profile: dict | None = None) -> dict:
    campaign = campaign or {}
    profile = campaign.get("industryProfile") or {}
    product_profile = _normalize_product_profile(product_profile)

    keywords = _strings(campaign.get("keywords"))
    exclusions = _strings(campaign.get("exclusionKeywords"))
    target_roles = _strings(profile.get("targetRoles")) or _strings(campaign.get("targetRoles"))
    regions = _strings(profile.get("regions")) or _strings(campaign.get("regions"))
    buying_signals = _strings(profile.get("buyingSignals")) or keywords
    negative_signals = _strings(profile.get("negativeSignals")) or exclusions
    target_industries = _strings(campaign.get("targetIndustries"))

    return {
        "name": campaign.get("name", ""),
        "targetIndustries": target_industries,
        "targetCompanyTypes": _strings(profile.get("targetCompanyTypes")),
        "targetRoles": target_roles,
        "regions": regions,
        "keywords": keywords,
        "exclusionKeywords": exclusions,
        "buyingSignals": buying_signals,
        "negativeSignals": negative_signals,
        "scoringWeights": {
            **DEFAULT_SCORING_WEIGHTS,
            **(profile.get("scoringWeights") or {}),
        },
        "minimumScoreForContacts": _number(
            profile.get("minimumScoreForContacts"),
            DEFAULT_THRESHOLDS["minimumScoreForContacts"],
        ),
        "minimumScoreForOversight": _number(
            profile.get("minimumScoreForOversight"),
            DEFAULT_THRESHOLDS["minimumScoreForOversight"],
        ),
        "minimumScoreForDraft": _number(
            profile.get("minimumScoreForDraft"),
            DEFAULT_THRESHOLDS["minimumScoreForDraft"],
        ),
        "discoverySources": _strings(profile.get("discoverySources")),
        "productProfile": product_profile,
        "offer": campaign.get("offer", "") or product_profile.get("valueProposition", ""),
        "cta": campaign.get("cta", "") or product_profile.get("defaultCta") or "Would it be useful to see a short demo?",
        "tone": campaign.get("tone", "technical"),
        "channel": campaign.get("channel", "email"),
    }


def matching_terms(campaign: dict) -> list[str]:
    return qualification_terms(campaign)


def qualification_terms(campaign: dict) -> list[str]:
    terms = []
    for key in (
        "buyingSignals",
        "negativeSignals",
        "keywords",
        "exclusionKeywords",
        "targetIndustries",
        "targetCompanyTypes",
    ):
        terms.extend(campaign.get(key) or [])
    return _dedupe(terms)


def crawl_priority_terms(campaign: dict) -> list[str]:
    terms = qualification_terms(campaign)
    terms.extend(campaign.get("targetRoles") or [])
    terms.extend([
        "careers",
        "jobs",
        "products",
        "services",
        "automotive",
        "functional safety",
        "ISO 26262",
        "HIL",
        "SIL",
        "ADAS",
        "standards",
        "compliance",
        "contact",
        "impressum",
    ])
    return _dedupe(terms)


def _strings(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        value = [value]
    return _dedupe(str(item).strip() for item in value if str(item).strip())


def _dedupe(values) -> list[str]:
    seen = set()
    result = []
    for value in values:
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def _number(value, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _normalize_product_profile(product_profile: dict | None) -> dict:
    profile = {**DEFAULT_PRODUCT_PROFILE, **(product_profile or {})}
    for key in ("painPointsSolved", "differentiators", "proofPoints", "complianceClaimsToAvoid"):
        profile[key] = _strings(profile.get(key))
    return profile
