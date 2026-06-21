def calculate_fit_score(
    company_profile: dict,
    signals: list,
    campaign: dict | None = None,
    evidence_count: int = 0,
    detected_keywords: list[str] | None = None,
    evidence_source_counts: dict | None = None,
) -> dict:
    """
    Deterministic campaign-driven opportunity scoring.
    """
    campaign = campaign or {}
    weights = campaign.get("scoringWeights") or {}
    breakdown = {
        "buyingSignals": 0,
        "negativeSignals": 0,
        "companyTypeFit": 0,
        "industryFit": 0,
        "geographyFit": 0,
        "evidenceQuality": 0,
        "sourceQuality": 0,
    }
    reasoning = []
    negative_penalties = []
    evidence_source_counts = evidence_source_counts or {}

    buying_weight = float(weights.get("buyingSignals", 30))
    negative_weight = float(weights.get("negativeSignals", 20))
    company_type_weight = float(weights.get("companyTypeFit", 15))
    industry_weight = float(weights.get("industryFit", 15))
    geography_weight = float(weights.get("geographyFit", 10))
    evidence_weight = float(weights.get("evidenceQuality", 5))
    source_weight = float(weights.get("sourceQuality", 5))

    buying_signals = [s for s in signals if s.get("factType", s.get("fact_type")) in {"buying_signal", "hiring_signal"}]
    company_fit_signals = [s for s in signals if s.get("factType", s.get("fact_type")) == "company_fit"]
    negative_signals = [s for s in signals if s.get("factType", s.get("fact_type")) == "negative_signal"]
    high_conf_buying = [
        s
        for s in buying_signals
        if float(s.get("confidence", 0) or 0) >= 0.55
        and float(s.get("relevanceScore", s.get("relevance_score", 0)) or 0) >= 0.5
    ]
    high_conf_fit = [
        s
        for s in company_fit_signals
        if float(s.get("confidence", 0) or 0) >= 0.65
        and float(s.get("relevanceScore", s.get("relevance_score", 0)) or 0) >= 0.75
    ]

    qualification_signals = high_conf_buying + high_conf_fit
    if qualification_signals:
        weighted_strength = sum(_signal_source_weight(s.get("sourceType", "")) for s in qualification_signals)
        avg_conf = sum(float(s.get("confidence", 0) or 0) for s in qualification_signals) / len(qualification_signals)
        breakdown["buyingSignals"] = min(buying_weight, weighted_strength * 8 + avg_conf * 8)
        if high_conf_buying:
            reasoning.append(f"Found {len(high_conf_buying)} source-backed buying signals.")
        if high_conf_fit:
            reasoning.append(f"Found {len(high_conf_fit)} strong company-fit facts.")

    if negative_signals:
        penalty = min(negative_weight, len(negative_signals) * 8)
        breakdown["negativeSignals"] = -penalty
        negative_penalties = [
            s.get("fact") or s.get("description") or s.get("evidenceSnippet", "")
            for s in negative_signals
        ]
        reasoning.append(f"Applied negative-signal penalty for {len(negative_signals)} facts.")
    
    industry_tags = [t.lower() for t in company_profile.get("industry_tags", [])]
    target_industries = [t.lower() for t in campaign.get("targetIndustries", [])]
    
    if any(ind in t for t in industry_tags for ind in target_industries):
        breakdown["industryFit"] = industry_weight
        reasoning.append("Industry matches campaign targeting.")

    target_company_types = [t.lower() for t in campaign.get("targetCompanyTypes", [])]
    profile_text = " ".join(
        company_profile.get("products_services", [])
        + company_profile.get("industry_tags", [])
        + company_profile.get("company_summary", "").split()
    ).lower()
    if target_company_types and any(company_type in profile_text for company_type in target_company_types):
        breakdown["companyTypeFit"] = company_type_weight
        reasoning.append("Company type matches campaign targeting.")
    elif high_conf_fit:
        breakdown["companyTypeFit"] = company_type_weight
        reasoning.append("Evidence shows company type fit even though the profile label was not exact.")
    elif not target_company_types and qualification_signals:
        breakdown["companyTypeFit"] = company_type_weight * 0.5
    
    campaign_regions = [r.lower() for r in campaign.get("regions", [])]
    location_tags = [r.lower() for r in company_profile.get("location_tags", [])]
    if not campaign_regions or any(region in loc or loc in region for region in campaign_regions for loc in location_tags):
        breakdown["geographyFit"] = geography_weight
        if campaign_regions:
            reasoning.append("Region matches campaign targeting.")
    
    source_type_count = len([key for key, count in evidence_source_counts.items() if count])
    if evidence_count >= 3 or len(qualification_signals) >= 3:
        breakdown["evidenceQuality"] = evidence_weight
        reasoning.append("Strong evidence coverage across pages or facts.")
    elif evidence_count > 0:
        breakdown["evidenceQuality"] = evidence_weight * 0.5

    source_urls = {s.get("sourceUrl", "") for s in signals if s.get("sourceUrl")}
    if source_type_count >= 3 or len(source_urls) >= 3:
        breakdown["sourceQuality"] = source_weight
        reasoning.append(_source_mix_reasoning(evidence_source_counts))
    elif len(source_urls) == 1 or source_type_count == 1:
        breakdown["sourceQuality"] = source_weight * 0.5
        reasoning.append("Single-source qualification; enrich before outreach.")
        reasoning.append(_missing_source_reasoning(evidence_source_counts))

    score = sum(breakdown.values())
    final_score = max(0, min(round(score), 100))
    
    priority = "LOW"
    if final_score >= float(campaign.get("minimumScoreForDraft", 75)):
        priority = "HIGH"
    elif final_score >= float(campaign.get("minimumScoreForContacts", 50)):
        priority = "MEDIUM"
        
    return {
        "fitScore": final_score,
        "priority": priority,
        "scoreBreakdown": breakdown,
        "reasoning": reasoning,
        "negativePenalties": negative_penalties,
        "sourceCoverage": evidence_source_counts,
        "scoreVersion": "industry_profile_v2_source_weighted",
    }


def _signal_source_weight(source_type: str) -> float:
    source_type = (source_type or "").lower()
    if source_type in {"job_posting", "website_jobs", "website_careers"}:
        return 1.35
    if source_type == "linkedin_company_post":
        return 1.2
    if source_type in {"website_product", "website_case_study"}:
        return 1.15
    if source_type == "search_result":
        return 0.8
    if source_type in {"website_directory", "conference_page", "association_member_page"}:
        return 0.75
    return 1.0


def _source_mix_reasoning(source_counts: dict) -> str:
    parts = []
    label_map = {
        "job_posting": "job signals",
        "website_jobs": "jobs/careers pages",
        "website_careers": "careers pages",
        "linkedin_company_post": "LinkedIn posts",
        "website_product": "product pages",
        "website_case_study": "case studies",
        "search_result": "search results",
        "website_directory": "directory pages",
    }
    for source_type, count in sorted(source_counts.items()):
        if count:
            parts.append(f"{count} {label_map.get(source_type, source_type)}")
    return f"Source coverage includes {', '.join(parts[:5])}." if parts else "Source coverage is limited."


def _missing_source_reasoning(source_counts: dict) -> str:
    missing = []
    if not any(source_counts.get(key, 0) for key in ("job_posting", "website_jobs", "website_careers")):
        missing.append("jobs/careers")
    if not any(source_counts.get(key, 0) for key in ("website_product", "website_case_study")):
        missing.append("product or case-study")
    if not any(source_counts.get(key, 0) for key in ("search_result", "website_directory", "conference_page", "association_member_page")):
        missing.append("search/directory")
    return f"Missing stronger evidence sources: {', '.join(missing)}." if missing else "Source coverage is acceptable."
