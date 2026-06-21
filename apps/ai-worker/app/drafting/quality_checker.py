from ..services.llm_client import generate_json

CHECK_PROMPT_TEMPLATE = """
Review this outreach draft for quality before it goes to a human reviewer.

Draft:
{draft_text}

Rules:
1. Is it too salesy? (buzzwords like 'synergy', 'revolutionary', 'unlock')
2. Is it too long? (Over 120 words for email)
3. Does it reference the evidence context logically?

Grade the draft strictly.
"""

async def check_draft_quality(draft_text: str) -> dict:
    """
    Evaluates the quality of a generated draft.
    """
    prompt = CHECK_PROMPT_TEMPLATE.format(draft_text=draft_text)
    
    system_msg = """
Return valid JSON:
{
  "passed": true/false,
  "score": "number 0-10",
  "critique": "string",
  "flags": ["string"],
  "unsupported_claims": ["string"],
  "forbidden_claims": ["string"]
}
    """
    
    check_data = await generate_json(prompt, system_message=system_msg, task="quality_check")
    flags = set(check_data.get("flags", []) if isinstance(check_data.get("flags"), list) else [])
    lowered = draft_text.lower()
    if not draft_text.strip():
        flags.add("empty_draft")
    if len(draft_text.split()) > 130:
        flags.add("too_long")
    if any(
        phrase in lowered
        for phrase in [
            "guaranteed compliance",
            "certified compliance",
            "ensure compliance",
            "guarantee certification",
        ]
    ):
        flags.add("forbidden_compliance_claim")
    if not check_data:
        check_data = {"passed": False, "score": 0, "critique": "Quality check failed"}
    check_data["flags"] = sorted(flags)
    if flags:
        check_data["passed"] = False
    return check_data
