import re
from typing import Iterable, List


DEFAULT_DISCOVERY_TERMS = [
    "hiring",
    "career",
    "job",
    "jobs",
    "services",
    "solutions",
    "products",
    "engineering",
    "consulting",
    "software",
    "risk analysis",
]


def detect_keywords(evidence_text: str, terms: Iterable[str] | None = None) -> List[str]:
    """
    Detects configured campaign terms in text using deterministic matching.
    Returns a list of matched keyword phrases.
    """
    if not evidence_text:
        return []

    normalized_text = _normalize_text(evidence_text)
    matches = set()

    for kw in terms or DEFAULT_DISCOVERY_TERMS:
        normalized = str(kw).strip()
        if normalized and _term_matches(normalized_text, normalized):
            matches.add(normalized)

    return sorted(matches, key=str.lower)


def detect_keyword_matches(evidence_text: str, terms: Iterable[str] | None = None) -> list[dict]:
    """
    Returns keyword match details for logging and tests.
    """
    if not evidence_text:
        return []
    normalized_text = _normalize_text(evidence_text)
    results = []
    for kw in terms or DEFAULT_DISCOVERY_TERMS:
        normalized = str(kw).strip()
        if not normalized:
            continue
        matched, mode = _term_match_detail(normalized_text, normalized)
        if matched:
            results.append({"term": normalized, "mode": mode})
    return results


def _term_matches(normalized_text: str, term: str) -> bool:
    matched, _mode = _term_match_detail(normalized_text, term)
    return matched


def _term_match_detail(normalized_text: str, term: str) -> tuple[bool, str]:
    normalized_term = _normalize_text(term)
    if not normalized_term:
        return False, "empty"
    aliases = _term_aliases(normalized_term)
    for alias in aliases:
        pattern = rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])"
        if re.search(pattern, normalized_text):
            mode = "word_boundary" if len(alias) <= 4 else "phrase_boundary"
            return True, mode
    return False, "no_match"


def _term_aliases(normalized_term: str) -> list[str]:
    aliases = [normalized_term]
    if normalized_term == "cto":
        aliases.append("chief technology officer")
    return aliases


def _normalize_text(value: str) -> str:
    normalized = value.lower()
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()
