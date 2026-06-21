import asyncio
import json
import os
from urllib.parse import urlparse
from datetime import datetime
from uuid import uuid4
from dotenv import load_dotenv
from fastapi import FastAPI
from bullmq import Worker
from bson.objectid import ObjectId
from redis.asyncio import Redis

# Load environment variables from .env file
load_dotenv()

from .crawler.crawl_company import crawl_company_website
from .services.database import get_db
from .services.service_logger import log_event
from .campaign_context import crawl_priority_terms, matching_terms, normalize_campaign_context
from .enrichment.contact_enrichment import enrich_contact_sources
from .extraction.contact_profile_extractor import extract_contact_profile

app = FastAPI(title="AI Worker API")

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
MIN_WEBSITE_SELECTION_CONFIDENCE = float(os.getenv("WEBSITE_SELECTION_MIN_CONFIDENCE", "0.45"))
VERIFY_WEBSITE_SELECTION_WITH_CLOUD = os.getenv("WEBSITE_SELECTION_CLOUD_VERIFY", "true").lower() not in {
    "0",
    "false",
    "no",
}
MAX_EXTRACTION_EVIDENCE = int(os.getenv("EXTRACTION_MAX_EVIDENCE_ITEMS", "12"))
MAX_CHARS_PER_EVIDENCE = int(os.getenv("EXTRACTION_MAX_CHARS_PER_EVIDENCE", "4000"))
MIN_EXTRACTION_TEXT_LENGTH = int(os.getenv("EXTRACTION_MIN_TEXT_LENGTH", "80"))
MIN_EXTRACTION_CONFIDENCE = float(os.getenv("EXTRACTION_MIN_CONFIDENCE", "0.2"))

BLOCKED_WEBSITE_DOMAINS = (
    "linkedin.com",
    "facebook.com",
    "instagram.com",
    "x.com",
    "twitter.com",
    "wikipedia.org",
    "wikidata.org",
    "crunchbase.com",
    "zoominfo.com",
    "dnb.com",
    "glassdoor.com",
    "indeed.com",
    "kununu.com",
    "northdata.com",
    "owler.com",
    "apollo.io",
    "rocketreach.co",
    "theorg.com",
)

async def process_research_job(job, job_token):
    """
    BullMQ processor function for research jobs.
    """
    print(f"Processing job {job.id} for company: {job.data.get('companyId')}")
    log_event("research_job_start", jobId=job.id, data=job.data)
    
    company_id = job.data.get("companyId")
    campaign_id = job.data.get("campaignId")
    research_job_id = job.data.get("researchJobId")
    db = await get_db()

    job_filter = (
        {"_id": ObjectId(research_job_id)}
        if research_job_id and ObjectId.is_valid(research_job_id)
        else {"companyId": ObjectId(company_id)} if company_id and ObjectId.is_valid(company_id)
        else {"companyId": company_id}
    )

    try:
        if not company_id or not ObjectId.is_valid(company_id):
            raise ValueError("No valid companyId provided")

        company_oid = ObjectId(company_id)
        company = await db.companies.find_one({"_id": company_oid})
        if not company:
            raise ValueError(f"Company {company_id} not found")

        campaign_id = campaign_id or str(company.get("campaignId"))
        if not campaign_id or not ObjectId.is_valid(str(campaign_id)):
            raise ValueError("No valid campaignId provided")

        campaign_oid = ObjectId(str(campaign_id))
        campaign = await db.campaigns.find_one({"_id": campaign_oid}) or {}
        product_profile = await db.productprofiles.find_one({"key": "default"}) or {}
        campaign_context = normalize_campaign_context(campaign, product_profile)
        campaign_terms = matching_terms(campaign_context)
        crawl_terms = crawl_priority_terms(campaign_context)
        url = job.data.get("website") or company.get("website")
        if not url:
            raise ValueError("No website URL provided")
        research_run_id = research_job_id or uuid4().hex

        await _update_job(db, job_filter, "running", "crawl", started=True)
        await db.companies.update_one(
            {"_id": company_oid},
            {"$set": {"status": "researching"}}
        )

        # 1. Crawl base website evidence. Enrichment can still rescue a sparse or blocked website.
        try:
            website_evidence = await crawl_company_website(url, priority_terms=crawl_terms)
        except Exception as crawl_error:
            website_evidence = [_provider_attempt_marker(
                url,
                "website_provider",
                "unknown_page",
                "failed",
                f"{type(crawl_error).__name__}: {crawl_error}",
            )]
            log_event(
                "website_crawl_failed_continue_to_enrichment",
                jobId=job.id,
                companyId=company_id,
                campaignId=str(campaign_oid),
                researchRunId=research_run_id,
                error=f"{type(crawl_error).__name__}: {crawl_error}",
            )
        if not website_evidence:
            website_evidence = [_provider_attempt_marker(url, "website_provider", "unknown_page", "failed", "No evidence collected from company website")]

        # 2. Enrich with additional compliant/optional providers
        await _update_job(db, job_filter, "running", "enrich_sources")
        from .enrichment.source_enrichment import enrich_company_sources

        evidence_list = await enrich_company_sources(company, campaign_context, website_evidence)
        if not evidence_list:
            raise RuntimeError("No evidence collected from enrichment providers")

        from .extraction.keyword_matcher import detect_keyword_matches, detect_keywords

        # 3. Save Evidence
        if evidence_list:
            for evidence in evidence_list:
                matches = detect_keywords(evidence.get("cleanedText", ""), campaign_terms)
                evidence["companyId"] = company_oid
                evidence["campaignId"] = campaign_oid
                evidence["researchRunId"] = research_run_id
                evidence["detectedKeywords"] = matches
                evidence["detectedSignals"] = _infer_signal_types(matches, evidence.get("sourceType", "unknown_page"), campaign_context)
                evidence["confidence"] = evidence.get("confidence", 0.75)
                _log_keyword_matches(
                    detect_keyword_matches(evidence.get("cleanedText", ""), campaign_terms),
                    evidence,
                    campaign_context,
                    company_id,
                    str(campaign_oid),
                    research_run_id,
                )

            await db.evidence.delete_many({
                "$or": [{"companyId": company_oid}, {"companyId": company_id}],
                "researchRunId": {"$ne": research_run_id},
            })
            evidence_list = await _upsert_evidence_records(db, evidence_list)

        print(f"Saved {len(evidence_list)} evidence items for company {company_id}")
        usable_evidence = _usable_evidence(evidence_list)
        extraction_evidence = _extraction_evidence(usable_evidence)
        provider_attempts = [e for e in evidence_list if e not in usable_evidence]
        log_event(
            "evidence_partitioned",
            jobId=job.id,
            companyId=company_id,
            campaignId=str(campaign_oid),
            researchRunId=research_run_id,
            evidenceCount=len(evidence_list),
            usableEvidenceCount=len(usable_evidence),
            extractionEvidenceCount=len(extraction_evidence),
            providerAttemptCount=len(provider_attempts),
            statusCounts=_retrieval_status_counts(evidence_list),
            sourceTypeCounts=_source_type_counts(evidence_list),
        )
        if not usable_evidence:
            raise RuntimeError("No usable evidence collected from enrichment providers")

        # --- SPRINT 3: Intelligence Layer ---
        # 3. Detect Keywords
        await _update_job(db, job_filter, "running", "extract_facts")
        all_evidence_text = "\n".join([e.get("cleanedText", "") for e in usable_evidence])
        detected_keywords = detect_keywords(all_evidence_text, campaign_terms)

        # 4. Extract Company Profile
        await _update_job(db, job_filter, "running", "profile")
        from .extraction.company_profile_extractor import extract_company_profile
        evidence_texts_for_profile = [
            _format_evidence_for_prompt(e)
            for e in usable_evidence
            if "about" in e.get("sourceType", "") or "homepage" in e.get("sourceType", "")
        ]
        if not evidence_texts_for_profile:
            evidence_texts_for_profile = [_format_evidence_for_prompt(e) for e in usable_evidence]
        company_profile = await extract_company_profile(evidence_texts_for_profile, campaign_context)

        # 5. Extract Structured Facts / Signals
        await _update_job(db, job_filter, "running", "signals")
        from .extraction.signal_extractor import extract_signals

        await db.signals.delete_many({"$or": [{"companyId": company_oid}, {"companyId": company_id}]})
        signal_records = []
        for evidence in extraction_evidence:
            evidence_text = evidence.get("cleanedText", "")
            if not evidence_text:
                continue
            signals_data = await extract_signals(
                evidence_text[:MAX_CHARS_PER_EVIDENCE],
                evidence.get("detectedKeywords", []),
                campaign_context,
                {
                    "url": evidence.get("url", ""),
                    "sourceType": evidence.get("sourceType", "unknown_page"),
                    "pageTitle": evidence.get("pageTitle", ""),
                },
            )
            for signal in signals_data.get("signals", []):
                matched_evidence = evidence
                fact_type = signal.get("fact_type") or signal.get("factType") or "other"
                signal_key = signal.get("signal_key") or signal.get("signalKey") or signal.get("signal_type") or "other"
                fact = signal.get("fact") or signal.get("description", "")
                if _is_excluded_fact(fact, campaign_context):
                    fact_type = "negative_signal"
                source_url = matched_evidence.get("url", "") if matched_evidence else signal.get("sourceUrl", "")
                signal_record = {
                    "campaignId": campaign_oid,
                    "companyId": company_oid,
                    "signalType": signal.get("signal_type") or signal.get("signalType") or signal_key,
                    "signalKey": signal_key,
                    "factType": fact_type,
                    "fact": fact,
                    "description": signal.get("description", fact),
                    "relevanceScore": float(signal.get("relevance_score", signal.get("relevanceScore", 0.5)) or 0.5),
                    "confidence": float(signal.get("confidence", 0.5) or 0.5),
                    "evidenceSnippet": signal.get("evidence_snippet", signal.get("evidenceSnippet", "")),
                    "sourceUrl": source_url,
                    "sourceType": matched_evidence.get("sourceType", "unknown_page") if matched_evidence else "unknown_page",
                    "observedAt": matched_evidence.get("retrievedAt") if matched_evidence else datetime.utcnow(),
                    "researchRunId": research_run_id,
                    "extractionModel": signal.get("_model", signals_data.get("_model", "")),
                }
                if matched_evidence and matched_evidence.get("_id"):
                    signal_record["evidenceId"] = matched_evidence["_id"]
                signal_records.append(signal_record)

        if not signal_records and detected_keywords:
            for keyword in detected_keywords:
                matched_evidence = _match_evidence_for_keyword(keyword, usable_evidence)
                fact_type = _fallback_fact_type(keyword, campaign_context)
                if not fact_type:
                    log_event(
                        "keyword_fallback_skipped",
                        companyId=company_id,
                        campaignId=str(campaign_oid),
                        researchRunId=research_run_id,
                        keyword=keyword,
                        reason="non_qualification_term",
                    )
                    continue
                signal_record = {
                    "campaignId": campaign_oid,
                    "companyId": company_oid,
                    "signalType": keyword,
                    "signalKey": keyword,
                    "factType": fact_type,
                    "fact": f"Matched configured term: {keyword}",
                    "description": f"Matched configured term: {keyword}",
                    "relevanceScore": 0.6,
                    "confidence": 0.65,
                    "evidenceSnippet": _snippet_for_keyword(keyword, matched_evidence),
                    "sourceUrl": matched_evidence.get("url", "") if matched_evidence else "",
                    "sourceType": matched_evidence.get("sourceType", "unknown_page") if matched_evidence else "unknown_page",
                    "observedAt": matched_evidence.get("retrievedAt") if matched_evidence else datetime.utcnow(),
                    "researchRunId": research_run_id,
                    "extractionModel": "keyword_matcher",
                }
                if matched_evidence and matched_evidence.get("_id"):
                    signal_record["evidenceId"] = matched_evidence["_id"]
                signal_records.append(signal_record)

        if signal_records:
            await db.signals.insert_many(signal_records)

        # 6. Fit Scoring
        await _update_job(db, job_filter, "running", "score")
        from .scoring.fit_score import calculate_fit_score
        score_data = calculate_fit_score(
            company_profile,
            signal_records,
            campaign_context,
            evidence_count=len(evidence_list),
            detected_keywords=detected_keywords,
            evidence_source_counts=_source_type_counts(usable_evidence),
        )

        # Save updates to DB
        await db.companies.update_one(
            {"_id": company_oid},
            {
                "$set": {
                    "keywordMatches": detected_keywords,
                    "summary": company_profile.get("company_summary"),
                    "industryTags": company_profile.get("industry_tags", []),
                    "locationTags": company_profile.get("location_tags", []),
                    "productsServices": company_profile.get("products_services", []),
                    "painHypotheses": company_profile.get("possible_pain_points", []),
                    "fitScore": score_data.get("fitScore"),
                    "priority": score_data.get("priority"),
                    "scoreBreakdown": score_data.get("scoreBreakdown", {}),
                    "scoreReasoning": score_data.get("reasoning", []),
                    "scoreVersion": score_data.get("scoreVersion"),
                    "evidenceCount": len(usable_evidence),
                    "lastResearchedAt": datetime.utcnow(),
                    "status": "researched",
                },
                "$unset": {"lastResearchError": ""},
            },
        )

        # 7. Contact Discovery
        contact_records = []
        if score_data.get("fitScore", 0) >= campaign_context.get("minimumScoreForContacts", 50):
            await _update_job(db, job_filter, "running", "contact_discovery")
            from .enrichment.contact_discovery import discover_contacts_for_company

            contact_records = await discover_contacts_for_company(
                db,
                campaign_oid,
                company_oid,
                company,
                campaign_context,
            )

        # 7.5 Contact Intelligence
        contact_profiles = {}
        contact_research_limit = campaign_context.get("contactResearchLimit", 2)
        top_contacts = contact_records[:contact_research_limit] if contact_records else []
        for contact in top_contacts:
            contact_id_str = str(contact.get("_id", contact.get("email")))
            await _update_job(db, job_filter, "running", f"contact_research_{contact_id_str}")
            
            contact_evidence = await enrich_contact_sources(contact, company)
            
            if contact_evidence:
                contact_evidence_records = await _upsert_evidence_records(db, contact_evidence)
                contact_evidence_texts = [e.get("cleanedText", "") for e in contact_evidence_records]
                c_profile = await extract_contact_profile(contact, company, contact_evidence_texts)
                contact_profiles[contact_id_str] = c_profile
                
                for ev in contact_evidence_records:
                    ev_text = ev.get("cleanedText", "")
                    if not ev_text:
                        continue
                    signals_data = await extract_signals(
                        evidence_text=ev_text[:MAX_CHARS_PER_EVIDENCE],
                        detected_keywords=ev.get("detectedKeywords", []),
                        campaign=campaign_context,
                        evidence_meta={
                            "url": ev.get("url", ""),
                            "sourceType": ev.get("sourceType", "unknown_page"),
                            "pageTitle": ev.get("pageTitle", ""),
                        },
                        contact_context=c_profile
                    )
                    # We merge contact signals into signal_records
                    for signal in signals_data.get("signals", []):
                        fact_type = signal.get("fact_type") or signal.get("factType") or "contact_signal"
                        signal_key = signal.get("signal_key") or signal.get("signalKey") or signal.get("signal_type") or "other"
                        signal_record = {
                            "campaignId": campaign_oid,
                            "companyId": company_oid,
                            "contactId": contact.get("_id"),
                            "signalType": signal.get("signal_type") or signal.get("signalType") or signal_key,
                            "signalKey": signal_key,
                            "factType": fact_type,
                            "fact": signal.get("fact") or signal.get("description", ""),
                            "description": signal.get("description", ""),
                            "relevanceScore": float(signal.get("relevance_score", 0.5) or 0.5),
                            "confidence": float(signal.get("confidence", 0.5) or 0.5),
                            "evidenceSnippet": signal.get("evidence_snippet", ""),
                            "sourceUrl": ev.get("url", ""),
                            "sourceType": ev.get("sourceType", "unknown_page"),
                            "observedAt": datetime.utcnow(),
                            "researchRunId": research_run_id,
                            "extractionModel": signal.get("_model", signals_data.get("_model", "")),
                            "evidenceId": ev.get("_id")
                        }
                        signal_records.append(signal_record)
                        
                # Update contact record with profile
                if contact.get("_id"):
                    await db.contacts.update_one(
                        {"_id": contact["_id"]},
                        {"$set": {"profile": c_profile}}
                    )

        if signal_records:
            # We already inserted some signals earlier, so we only insert the new ones if needed, 
            # or we could upsert. Since we re-append to signal_records, we should insert the new ones.
            # To be safe and clean, we will insert all signals at the end or just the new contact ones.
            # Actually, the company signals were already inserted at line 286!
            # So we only insert the ones with contactId:
            contact_signal_records = [s for s in signal_records if s.get("contactId")]
            if contact_signal_records:
                await db.signals.insert_many(contact_signal_records)

        # 8. Cloud Oversight for high-value leads
        oversight = None
        if score_data.get("fitScore", 0) >= campaign_context.get("minimumScoreForOversight", 70):
            await _update_job(db, job_filter, "running", "oversight")
            from .oversight import review_opportunity

            oversight = await review_opportunity(
                company_profile,
                [_serialize_signal_for_prompt(s) for s in signal_records],
                score_data,
                _serialize_contacts(contact_records),
                campaign_context,
            )
        else:
            from .oversight import skipped_oversight

            oversight = skipped_oversight()

        await db.companies.update_one(
            {"_id": company_oid},
            {"$set": {"oversight": oversight}},
        )

        # 9. Drafting Layer, gated by score and oversight
        await _update_job(db, job_filter, "running", "draft")
        force_draft = job.data.get("forceDraft") is True
        negative_blocked = _has_blocking_negative_signal(signal_records)
        has_source_backed_fact = any(signal.get("evidenceId") for signal in signal_records)
        should_draft = (
            (
                score_data.get("fitScore", 0) >= campaign_context.get("minimumScoreForDraft", 75)
                or force_draft
            )
            and oversight.get("verdict") in {"approve", "needs_human_check", "skipped"}
            and (has_source_backed_fact or force_draft)
            and (not negative_blocked or force_draft)
        )
        draft_suppression_reason = _draft_suppression_reason(
            score_data,
            campaign_context,
            oversight,
            has_source_backed_fact,
            negative_blocked,
            force_draft,
        )
        log_event(
            "draft_gate_evaluated",
            jobId=job.id,
            companyId=company_id,
            campaignId=str(campaign_oid),
            researchRunId=research_run_id,
            shouldDraft=should_draft,
            reason=draft_suppression_reason,
            fitScore=score_data.get("fitScore"),
            oversightVerdict=oversight.get("verdict"),
            hasSourceBackedFact=has_source_backed_fact,
            negativeBlocked=negative_blocked,
            forceDraft=force_draft,
        )
        if should_draft:
            from .drafting.angle_selector import select_angle
            from .drafting.email_generator import generate_email_draft
            from .drafting.linkedin_generator import generate_linkedin_draft
            from .drafting.quality_checker import check_draft_quality

            serializable_signals = [_serialize_signal_for_prompt(s) for s in signal_records]
            contact = _recommended_contact(contact_records)
            c_profile = contact_profiles.get(str(contact.get("_id", contact.get("email")))) if contact else None

            angle = await select_angle(company_profile, serializable_signals, campaign_context, contact_profile=c_profile)
            
            # Fallback for angle
            if not angle.get("selected_angle"):
                fallback_angle = oversight.get("recommendedAngle") or angle.get("selected_angle_type") or angle.get("reasoning") or "General outreach based on company profile."
                angle["selected_angle"] = fallback_angle
            if oversight.get("recommendedAngle"):
                angle["selected_angle"] = oversight.get("recommendedAngle")

            source_ids = _source_ids_for_angle(angle, usable_evidence) # TODO: angle sources might include contact evidence now
            channel = campaign_context.get("channel") or "email"
            company_name = company.get("name") or url

            if channel == "linkedin":
                raw_draft = await generate_linkedin_draft(company_name, angle, campaign_context, contact=contact, contact_profile=c_profile)
                message = raw_draft.get("follow_up_message") or raw_draft.get("connection_message")
                subject = ""
                draft_reasoning = angle.get("reasoning", "")
                draft_sources = source_ids
                draft_risk_flags = []
            else:
                raw_draft = await generate_email_draft(company_name, angle, campaign_context, source_ids, contact=contact, contact_profile=c_profile)
                message = raw_draft.get("message") or raw_draft.get("body")
                subject = raw_draft.get("subject", "")
                draft_reasoning = raw_draft.get("reasoning") or angle.get("reasoning", "")
                draft_sources = raw_draft.get("sources_used") or source_ids
                draft_risk_flags = raw_draft.get("risk_flags", [])

            # Fallback for message
            if not message:
                message = raw_draft.get("message") or raw_draft.get("body") or raw_draft.get("reasoning") or str(raw_draft)
            if not message or len(str(message)) < 10:
                message = "The AI failed to generate a proper message (likely due to an LLM timeout or connection error). Please review the evidence and draft a message manually."

            quality = await check_draft_quality(message)
            quality_flags = quality.get("flags", [])
            if not quality:
                quality_flags = ["quality_check_failed"]
            
            await db.drafts.update_many(
                {
                    "companyId": company_oid,
                    "status": {"$in": ["needs_review", "pending_review"]},
                },
                {"$set": {"status": "rejected", "reviewerNotes": "Superseded by a new research run"}},
            )

            draft_record = {
                "campaignId": campaign_oid,
                "companyId": company_oid,
                "channel": channel,
                "angle": angle,
                "subject": subject,
                "message": message,
                "body": message,
                "selectedAngle": angle.get("selected_angle", ""),
                "reasoning": draft_reasoning,
                "sourcesUsed": draft_sources,
                "riskFlags": list(set((draft_risk_flags or []) + (quality_flags or []))),
                "qualityScore": quality.get("score"),
                "qualityPassed": quality.get("passed", False),
                "qualityFlags": quality_flags,
                "status": "needs_review"
            }
            await db.drafts.insert_one(draft_record)

            await db.companies.update_one(
                {"_id": company_oid},
                {"$set": {"status": "draft_ready"}},
            )

        await _update_job(db, job_filter, "completed", "completed", completed=True)
        log_event(
            "research_job_completed",
            jobId=job.id,
            companyId=company_id,
            campaignId=str(campaign_oid),
            evidenceCount=len(evidence_list),
            usableEvidenceCount=len(usable_evidence),
            signalCount=len(signal_records),
            fitScore=score_data.get("fitScore"),
            priority=score_data.get("priority"),
            oversight=oversight,
            contactCount=len(contact_records),
            drafted=should_draft,
            draftSuppressionReason=draft_suppression_reason,
        )
            
        return {"success": True, "evidence_count": len(evidence_list), "fitScore": score_data.get("fitScore")}

        
    except Exception as e:
        print(f"Error processing job {job.id}: {e}")
        log_event(
            "research_job_failed",
            jobId=job.id,
            companyId=company_id,
            campaignId=campaign_id,
            error=f"{type(e).__name__}: {e}",
        )
        await db.researchjobs.update_one(job_filter, {"$set": {"status": "failed", "error": str(e)}})
        await db.companies.update_one(
            {"_id": ObjectId(company_id)} if company_id and ObjectId.is_valid(company_id) else {"_id": company_id},
            {"$set": {"status": "failed", "lastResearchError": str(e)}}
        )
        raise


async def _update_job(db, job_filter: dict, status: str, step: str, started: bool = False, completed: bool = False):
    updates = {"status": status, "currentStep": step}
    if started:
        updates["startedAt"] = datetime.utcnow()
    if completed:
        updates["completedAt"] = datetime.utcnow()
    await db.researchjobs.update_one(job_filter, {"$set": updates})
    log_event("research_job_step", status=status, step=step, jobFilter=job_filter)


async def _upsert_evidence_records(db, evidence_list: list[dict]) -> list[dict]:
    persisted = []
    for evidence in evidence_list:
        normalized_url = evidence.get("normalizedUrl") or _normalize_evidence_url(evidence.get("url", ""))
        content_hash = evidence.get("contentHash") or _content_hash(evidence.get("cleanedText") or evidence.get("rawText") or "")
        evidence["normalizedUrl"] = normalized_url
        evidence["contentHash"] = content_hash
        key = {
            "companyId": evidence.get("companyId"),
            "normalizedUrl": normalized_url,
            "contentHash": content_hash,
            "researchRunId": evidence.get("researchRunId"),
        }
        result = await db.evidence.find_one_and_update(
            key,
            {"$set": evidence},
            upsert=True,
            return_document=True,
        )
        if result:
            evidence["_id"] = result.get("_id")
            persisted.append(evidence)
    return persisted


def _usable_evidence(evidence_list: list[dict]) -> list[dict]:
    usable = []
    for evidence in evidence_list:
        status = evidence.get("retrievalStatus") or "completed"
        confidence = float(evidence.get("confidence", evidence.get("sourceConfidence", 0)) or 0)
        text = _useful_text(evidence)
        source_type = evidence.get("sourceType", "")
        if status not in {"completed", "metadata_only"}:
            continue
        if confidence < MIN_EXTRACTION_CONFIDENCE:
            continue
        if len(text) < MIN_EXTRACTION_TEXT_LENGTH and source_type not in {"search_result", "linkedin_company_profile"}:
            continue
        usable.append(evidence)
    return usable


def _extraction_evidence(evidence_list: list[dict]) -> list[dict]:
    extractable = []
    for evidence in evidence_list:
        if evidence.get("retrievalStatus") == "metadata_only":
            continue
        text = _useful_text(evidence)
        source_type = evidence.get("sourceType", "")
        if len(text) < MIN_EXTRACTION_TEXT_LENGTH and source_type not in {"search_result"}:
            continue
        extractable.append(evidence)
    extractable.sort(key=_evidence_priority, reverse=True)
    return extractable[:MAX_EXTRACTION_EVIDENCE]


def _useful_text(evidence: dict) -> str:
    text = (evidence.get("cleanedText") or "").strip()
    if text.lower().startswith("provider ") and " could not retrieve " in text.lower():
        return ""
    return text


def _evidence_priority(evidence: dict) -> tuple[float, float]:
    source_type = (evidence.get("sourceType") or "").lower()
    weight = {
        "job_posting": 1.0,
        "website_jobs": 0.95,
        "website_careers": 0.9,
        "linkedin_company_post": 0.85,
        "website_product": 0.8,
        "website_case_study": 0.75,
        "website_services": 0.7,
        "website_homepage": 0.65,
        "website_about": 0.6,
        "search_result": 0.5,
        "website_directory": 0.45,
    }.get(source_type, 0.4)
    confidence = float(evidence.get("confidence", evidence.get("sourceConfidence", 0)) or 0)
    return (weight, confidence)


def _provider_attempt_marker(url: str, provider: str, source_type: str, status: str, error: str) -> dict:
    text = f"Provider {provider} could not retrieve {url}"
    now = datetime.utcnow()
    return {
        "url": url,
        "pageTitle": url,
        "sourceType": source_type,
        "rawText": text,
        "cleanedText": text,
        "summary": text,
        "provider": provider,
        "providerStatus": {
            "provider": provider,
            "status": status,
            "evidenceCount": 0,
            "error": error,
            "attempted": [url],
            "retrievedAt": now.isoformat() + "Z",
        },
        "sourceConfidence": 0.1,
        "confidence": 0.1,
        "retrievalStatus": status,
        "retrievedAt": now,
        "contentHash": _content_hash(text),
    }


def _retrieval_status_counts(evidence_list: list[dict]) -> dict:
    counts = {}
    for evidence in evidence_list:
        status = evidence.get("retrievalStatus") or "unknown"
        counts[status] = counts.get(status, 0) + 1
    return counts


def _log_keyword_matches(matches: list[dict], evidence: dict, campaign: dict, company_id: str, campaign_id: str, research_run_id: str):
    for match in matches:
        term = match.get("term", "")
        category = _term_category(term, campaign)
        if category == "target_role":
            event = "keyword_role_match_skipped"
        else:
            event = "keyword_match_detected"
        log_event(
            event,
            companyId=company_id,
            campaignId=campaign_id,
            researchRunId=research_run_id,
            term=term,
            category=category,
            sourceType=evidence.get("sourceType", "unknown_page"),
            mode=match.get("mode", ""),
        )


def _term_category(term: str, campaign: dict) -> str:
    term_lower = (term or "").lower()
    categories = [
        ("buying_signal", campaign.get("buyingSignals", [])),
        ("negative_signal", campaign.get("negativeSignals", [])),
        ("target_industry", campaign.get("targetIndustries", [])),
        ("target_company_type", campaign.get("targetCompanyTypes", [])),
        ("target_role", campaign.get("targetRoles", [])),
    ]
    for category, values in categories:
        if any(term_lower == str(value).lower() for value in values):
            return category
    return "keyword"


def _format_evidence_for_prompt(evidence: dict) -> str:
    return (
        f"Source ID: {evidence.get('_id')}\n"
        f"Source URL: {evidence.get('url', '')}\n"
        f"Source Type: {evidence.get('sourceType', 'unknown_page')}\n"
        f"Text:\n{evidence.get('cleanedText', '')[:MAX_CHARS_PER_EVIDENCE]}"
    )


def _infer_signal_types(keywords: list[str], source_type: str, campaign: dict) -> list[str]:
    joined = " ".join(keywords).lower()
    signal_types = set()
    for term in campaign.get("buyingSignals", []):
        if term.lower() in joined:
            signal_types.add(_slug(term))
    for term in campaign.get("negativeSignals", []):
        if term.lower() in joined:
            signal_types.add(f"negative_{_slug(term)}")
    if source_type == "website_careers" or "hiring" in joined or "job" in joined:
        signal_types.add("hiring")
    return sorted(signal_types)


def _is_excluded_fact(fact: str, campaign: dict) -> bool:
    fact_lower = (fact or "").lower()
    return any(term.lower() in fact_lower for term in campaign.get("negativeSignals", []))


def _is_negative_term(term: str, campaign: dict) -> bool:
    term_lower = (term or "").lower()
    return any(term_lower == negative.lower() for negative in campaign.get("negativeSignals", []))


def _fallback_fact_type(term: str, campaign: dict) -> str | None:
    term_lower = (term or "").lower()
    if any(term_lower == negative.lower() for negative in campaign.get("negativeSignals", [])):
        return "negative_signal"
    if any(term_lower == signal.lower() for signal in campaign.get("buyingSignals", [])):
        return "buying_signal"
    if any(term_lower == value.lower() for value in (campaign.get("targetIndustries", []) + campaign.get("targetCompanyTypes", []))):
        return "company_fit"
    return None


def _match_evidence_for_keyword(keyword: str, evidence_list: list[dict]) -> dict | None:
    keyword_lower = keyword.lower()
    for evidence in evidence_list:
        if keyword_lower in evidence.get("cleanedText", "").lower():
            return evidence
    return evidence_list[0] if evidence_list else None


def _snippet_for_keyword(keyword: str, evidence: dict | None) -> str:
    if not evidence:
        return ""
    text = evidence.get("cleanedText", "")
    index = text.lower().find(keyword.lower())
    if index < 0:
        return text[:240]
    start = max(0, index - 80)
    end = min(len(text), index + len(keyword) + 160)
    return text[start:end].strip()


def _slug(value: str) -> str:
    return "_".join("".join(char.lower() if char.isalnum() else " " for char in value).split())


def _normalize_evidence_url(url: str) -> str:
    if not url:
        return ""
    parsed = urlparse(url if url.startswith(("http://", "https://")) else f"https://{url}")
    host = parsed.netloc.lower().removeprefix("www.")
    path = parsed.path.rstrip("/")
    return f"{host}{path}".lower()


def _content_hash(text: str) -> str:
    import hashlib

    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def _has_blocking_negative_signal(signals: list[dict]) -> bool:
    for signal in signals:
        if signal.get("factType") != "negative_signal":
            continue
        confidence = float(signal.get("confidence", 0) or 0)
        relevance = float(signal.get("relevanceScore", 0) or 0)
        if confidence >= 0.75 and relevance >= 0.75:
            return True
    return False


def _draft_suppression_reason(
    score_data: dict,
    campaign_context: dict,
    oversight: dict,
    has_source_backed_fact: bool,
    negative_blocked: bool,
    force_draft: bool,
) -> str:
    if force_draft:
        return "force_draft_requested"
    minimum = campaign_context.get("minimumScoreForDraft", 75)
    if score_data.get("fitScore", 0) < minimum:
        return f"score_below_draft_threshold_{minimum}"
    if oversight.get("verdict") not in {"approve", "needs_human_check", "skipped"}:
        return f"oversight_{oversight.get('verdict') or 'missing'}"
    if not has_source_backed_fact:
        return "no_source_backed_facts"
    if negative_blocked:
        return "blocking_negative_signal"
    return "draft_allowed"


def _match_evidence_for_signal(signal: dict, evidence_list: list[dict]) -> dict | None:
    if not evidence_list:
        return None
    snippet = (signal.get("evidence_snippet") or signal.get("evidenceSnippet") or "").strip().lower()
    if snippet:
        for evidence in evidence_list:
            if snippet[:120] and snippet[:120] in evidence.get("cleanedText", "").lower():
                return evidence

    signal_text = f"{signal.get('signal_type', '')} {signal.get('description', '')}".lower()
    for evidence in evidence_list:
        if any(keyword.lower() in signal_text for keyword in evidence.get("detectedKeywords", [])):
            return evidence
    return evidence_list[0]


def _serialize_signal_for_prompt(signal: dict) -> dict:
    return {
        "signal_type": signal.get("signalType", ""),
        "signal_key": signal.get("signalKey", ""),
        "fact_type": signal.get("factType", ""),
        "fact": signal.get("fact", ""),
        "description": signal.get("description", ""),
        "evidence_snippet": signal.get("evidenceSnippet", ""),
        "relevance_score": signal.get("relevanceScore", 0),
        "confidence": signal.get("confidence", 0),
        "source_url": signal.get("sourceUrl", ""),
        "source_type": signal.get("sourceType", ""),
        "evidence_id": str(signal.get("evidenceId", "")),
    }


def _source_type_counts(evidence_list: list[dict]) -> dict:
    counts = {}
    for evidence in evidence_list:
        source_type = evidence.get("sourceType") or "unknown_page"
        counts[source_type] = counts.get(source_type, 0) + 1
    return counts


def _serialize_contacts(contacts: list[dict]) -> list[dict]:
    return [
        {
            "name": contact.get("name"),
            "title": contact.get("title"),
            "email": contact.get("email"),
            "linkedinUrl": contact.get("linkedinUrl"),
            "roleMatchScore": contact.get("roleMatchScore", 0),
            "emailConfidence": contact.get("emailConfidence", 0),
            "recommended": contact.get("recommended", False),
        }
        for contact in contacts
    ]


def _recommended_contact(contacts: list[dict]) -> dict | None:
    for contact in contacts:
        if contact.get("recommended"):
            return contact
    return contacts[0] if contacts else None


def _source_ids_for_angle(angle: dict, evidence_list: list[dict]) -> list[str]:
    ids = [str(source_id) for source_id in angle.get("supporting_evidence_ids", []) if source_id]
    valid_ids = {str(e.get("_id")) for e in evidence_list if e.get("_id")}
    ids = [source_id for source_id in ids if source_id in valid_ids]
    if ids:
        return ids
    return [str(e.get("_id")) for e in evidence_list[:3] if e.get("_id")]

async def process_enrichment_job(job, job_token):
    print(f"Processing enrichment job {job.id} for company: {job.data.get('companyId')}")
    log_event("enrichment_job_start", jobId=job.id, data=job.data)
    
    company_id = job.data.get('companyId')
    company_name = job.data.get('companyName')
    
    if not company_name:
        return {"error": "No company name provided"}
        
    db = await get_db()
    
    try:
        from ddgs import DDGS
        
        queries = [
            f'"{company_name}" official website',
            f'{company_name} official website',
        ]
        print(f"Searching duckduckgo for: {queries[0]}")
        
        def do_search() -> list[dict]:
            results = []
            seen_urls = set()
            try:
                with DDGS() as ddgs:
                    for query in queries:
                        for result in ddgs.text(query, max_results=10):
                            url = result.get("href", "")
                            normalized_url = _normalize_url(url)
                            if not normalized_url or normalized_url in seen_urls:
                                continue
                            seen_urls.add(normalized_url)
                            results.append({
                                "rank": len(results) + 1,
                                "title": result.get("title", ""),
                                "url": normalized_url,
                                "domain": _domain_from_url(normalized_url),
                                "snippet": result.get("body", ""),
                            })
                            if len(results) >= 10:
                                return results
            except Exception as e:
                print(f"DDGS error: {e}")
            return results

        # Offload blocking search to a thread
        candidates = await asyncio.to_thread(do_search)
        
        # Enforce a mandatory cool-down between jobs to avoid IP ban
        await asyncio.sleep(5)

        if not candidates:
            await db.companies.update_one(
                {"_id": ObjectId(company_id)},
                {
                    "$set": {
                        "status": "missing_info",
                        "lastResearchError": "No website search results found",
                    }
                }
            )
            return {"error": "No search results found"}

        selection = await _select_official_website_with_llm(company_name, candidates)
        selected_candidate = selection.get("selected_candidate") or _resolve_selected_candidate(selection, candidates)
        selected_url = selected_candidate.get("url") if selected_candidate else selection.get("selected_url")
        confidence = float(selection.get("confidence", 0) or 0)

        if selected_url and selected_candidate and confidence >= MIN_WEBSITE_SELECTION_CONFIDENCE:
            print(f"Selected official URL: {selected_url} ({confidence})")
            await db.companies.update_one(
                {"_id": ObjectId(company_id)},
                {
                    "$set": {
                        "website": selected_url,
                        "normalizedWebsite": selected_url,
                        "domain": _domain_from_url(selected_url),
                        "status": "imported",
                        "websiteCandidates": candidates,
                        "websiteSelectionReasoning": selection.get("reasoning", ""),
                        "websiteSelectionConfidence": confidence,
                        "websiteSelectionModel": selection.get("_model", ""),
                    },
                    "$unset": {"error": "", "lastResearchError": ""}
                }
            )
            log_event(
                "enrichment_job_completed",
                jobId=job.id,
                companyId=company_id,
                companyName=company_name,
                selectedUrl=selected_url,
                confidence=confidence,
                candidateCount=len(candidates),
                model=selection.get("_model", ""),
            )
            return {
                "success": True,
                "website": selected_url,
                "confidence": confidence,
                "candidates": candidates,
            }
        else:
            print(f"No confident official URL found for {company_name}")
            await db.companies.update_one(
                {"_id": ObjectId(company_id)},
                {
                    "$set": {
                        "status": "missing_info",
                        "error": "Could not confidently select official website",
                        "lastResearchError": "Could not confidently select official website",
                        "websiteCandidates": candidates,
                        "websiteSelectionReasoning": selection.get("reasoning", ""),
                        "websiteSelectionConfidence": confidence,
                        "websiteSelectionModel": selection.get("_model", ""),
                    }
                }
            )
            log_event(
                "enrichment_job_unresolved",
                jobId=job.id,
                companyId=company_id,
                companyName=company_name,
                confidence=confidence,
                candidateCount=len(candidates),
                selection=selection,
            )
            return {"error": "No confident URL found", "candidates": candidates, "selection": selection}
            
    except Exception as e:
        print(f"Error enriching {company_name}: {e}")
        log_event(
            "enrichment_job_failed",
            jobId=job.id,
            companyId=company_id,
            companyName=company_name,
            error=f"{type(e).__name__}: {e}",
        )
        await db.companies.update_one(
            {"_id": ObjectId(company_id)},
            {
                "$set": {
                    "status": "missing_info",
                    "error": str(e),
                    "lastResearchError": str(e),
                }
            }
        )
        raise


async def _select_official_website_with_llm(company_name: str, candidates: list[dict]) -> dict:
    from .services.llm_client import generate_json

    prompt = _website_selection_prompt(company_name, candidates)
    system_msg = _website_selection_system_message()

    local_selection = await generate_json(prompt, system_message=system_msg, task="website_selection", max_tokens=2500)
    local_candidate = _resolve_selected_candidate(local_selection, candidates)
    local_confidence = float(local_selection.get("confidence", 0) or 0)
    if local_candidate:
        local_selection["selected_url"] = local_candidate["url"]
        local_selection["selected_domain"] = local_candidate["domain"]
        local_selection["selected_candidate"] = local_candidate

    if local_candidate and local_confidence >= 0.65:
        return local_selection

    if VERIFY_WEBSITE_SELECTION_WITH_CLOUD:
        verification_prompt = f"""
Review and, if needed, correct this local model website selection.

Local model selection:
{json.dumps(local_selection, ensure_ascii=False, indent=2)}

{prompt}
"""
        cloud_selection = await generate_json(
            verification_prompt,
            system_message=system_msg,
            task="website_selection_verification",
            max_tokens=2500,
        )
        cloud_candidate = _resolve_selected_candidate(cloud_selection, candidates)
        cloud_confidence = float(cloud_selection.get("confidence", 0) or 0)
        if cloud_candidate:
            cloud_selection["selected_url"] = cloud_candidate["url"]
            cloud_selection["selected_domain"] = cloud_candidate["domain"]
            cloud_selection["selected_candidate"] = cloud_candidate
            if cloud_confidence >= MIN_WEBSITE_SELECTION_CONFIDENCE:
                return cloud_selection

    if local_candidate and local_confidence >= MIN_WEBSITE_SELECTION_CONFIDENCE:
        return local_selection

    heuristic_candidate, heuristic_confidence, heuristic_reasoning = _best_heuristic_candidate(company_name, candidates)
    if heuristic_candidate:
        return {
            "selected_url": heuristic_candidate["url"],
            "selected_domain": heuristic_candidate["domain"],
            "selected_candidate": heuristic_candidate,
            "confidence": heuristic_confidence,
            "reasoning": heuristic_reasoning,
            "rejected_urls": [
                candidate["url"]
                for candidate in candidates
                if candidate.get("url") != heuristic_candidate.get("url")
            ],
            "_model": "heuristic_fallback",
        }

    return local_selection


def _website_selection_prompt(company_name: str, candidates: list[dict]) -> str:
    return f"""
You are selecting the official corporate website for a company.

Company name:
{company_name}

Search result candidates from the first results page:
{json.dumps(candidates, ensure_ascii=False, indent=2)}

Rules:
- Pick only the official company website.
- Do not pick LinkedIn, Facebook, Wikipedia, Crunchbase, directories, job boards, news articles, PDFs, or reseller pages.
- If multiple regional domains appear, choose the main corporate site that best matches the company name.
- Prefer a candidate whose domain or title closely matches the company name.
- If none is clearly official, return null for selected_url and a low confidence score.
- If you choose a website, selected_url must correspond to one of the candidate URLs. Prefer copying the candidate URL exactly.
"""


def _website_selection_system_message() -> str:
    return """
Return valid JSON:
{
  "selected_url": "string or null",
  "selected_domain": "string or null",
  "confidence": 0.0,
  "reasoning": "string",
  "rejected_urls": ["string"]
}
"""


def _domain_from_url(url: str) -> str:
    parsed = urlparse(url if url.startswith(("http://", "https://")) else f"https://{url}")
    domain = parsed.netloc.lower()
    if domain.startswith("www."):
        domain = domain[4:]
    return domain


def _normalize_url(url: str) -> str:
    if not url:
        return ""
    parsed = urlparse(url if url.startswith(("http://", "https://")) else f"https://{url}")
    if not parsed.netloc:
        return ""
    scheme = parsed.scheme or "https"
    netloc = parsed.netloc.lower()
    path = parsed.path.rstrip("/")
    return f"{scheme}://{netloc}{path}"


def _resolve_selected_candidate(selection: dict, candidates: list[dict]) -> dict | None:
    selected_url = _normalize_url(str(selection.get("selected_url") or ""))
    selected_domain = str(selection.get("selected_domain") or "")
    selected_domain = selected_domain.lower().replace("www.", "")
    if selected_url:
        for candidate in candidates:
            if _normalize_url(candidate.get("url", "")) == selected_url:
                return candidate
    if selected_domain:
        for candidate in candidates:
            if candidate.get("domain") == selected_domain:
                return candidate
    if selected_url:
        selected_url_domain = _domain_from_url(selected_url)
        for candidate in candidates:
            if candidate.get("domain") == selected_url_domain:
                return candidate
    return None


def _best_heuristic_candidate(company_name: str, candidates: list[dict]) -> tuple[dict | None, float, str]:
    scored_candidates = []
    for candidate in candidates:
        domain = candidate.get("domain", "")
        if _is_blocked_domain(domain):
            continue
        score = _company_candidate_score(company_name, candidate)
        if score > 0:
            scored_candidates.append((score, candidate))

    if not scored_candidates:
        return None, 0.0, ""

    scored_candidates.sort(key=lambda item: item[0], reverse=True)
    best_score, best_candidate = scored_candidates[0]
    confidence = min(0.75, max(MIN_WEBSITE_SELECTION_CONFIDENCE, best_score))
    return (
        best_candidate,
        confidence,
        "Selected by heuristic fallback after model selection was inconclusive: candidate domain/title best matched the company name and was not a directory or social result.",
    )


def _company_candidate_score(company_name: str, candidate: dict) -> float:
    company_tokens = _important_name_tokens(company_name)
    if not company_tokens:
        return 0.0

    domain = candidate.get("domain", "").lower()
    title = candidate.get("title", "").lower()
    snippet = candidate.get("snippet", "").lower()
    haystack = f"{domain} {title} {snippet}"

    matches = sum(1 for token in company_tokens if token in haystack)
    score = matches / len(company_tokens)
    if company_tokens[0] in domain:
        score += 0.25
    if any(word in title for word in ["official", "home", "homepage"]):
        score += 0.1
    if _is_blocked_domain(domain):
        score -= 1
    return score


def _important_name_tokens(company_name: str) -> list[str]:
    stop_words = {
        "gmbh",
        "ag",
        "inc",
        "llc",
        "ltd",
        "limited",
        "corp",
        "corporation",
        "company",
        "co",
        "group",
        "holding",
        "holdings",
        "technologies",
        "technology",
    }
    cleaned = "".join(char.lower() if char.isalnum() else " " for char in company_name)
    return [token for token in cleaned.split() if len(token) > 2 and token not in stop_words]


def _is_blocked_domain(domain: str) -> bool:
    return any(domain == blocked or domain.endswith(f".{blocked}") for blocked in BLOCKED_WEBSITE_DOMAINS)

async def setup_worker():
    print("Setting up BullMQ Workers...")
    worker = Worker(
        "ResearchQueue",
        process_research_job,
        {"connection": f"redis://{REDIS_HOST}:{REDIS_PORT}"}
    )
    enrich_worker = Worker(
        "EnrichmentQueue",
        process_enrichment_job,
        {"connection": f"redis://{REDIS_HOST}:{REDIS_PORT}"}
    )
    return worker, enrich_worker

@app.on_event("startup")
async def startup_event():
    # Keep worker references alive for the FastAPI process lifetime.
    app.state.workers = await setup_worker()

@app.get("/health")
async def health():
    db = await get_db()
    checks = {"mongo": "unknown", "redis": "unknown"}
    try:
        await db.command("ping")
        checks["mongo"] = "ok"
    except Exception as e:
        checks["mongo"] = f"error: {e}"

    redis = Redis(host=REDIS_HOST, port=REDIS_PORT)
    try:
        await redis.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e}"
    finally:
        await redis.aclose()

    status = "ok" if all(value == "ok" for value in checks.values()) else "degraded"
    return {"status": status, "service": "ai-worker", "checks": checks}
