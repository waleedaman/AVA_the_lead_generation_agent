import asyncio
import importlib.util
from pathlib import Path
import sys
import types
import unittest

WORKER_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER_ROOT))
if "app" in sys.modules and not hasattr(sys.modules["app"], "__path__"):
    del sys.modules["app"]


def _install_fetch_stub():
    trafilatura = types.ModuleType("trafilatura")
    trafilatura.extract = lambda *args, **kwargs: ""
    sys.modules["trafilatura"] = trafilatura

    module = types.ModuleType("app.crawler.fetch_page")

    async def fetch_page(url, timeout=None):
        if "missing" in url:
            return None
        return {
            "url": url,
            "title": "Configured website",
            "raw_html": "<html></html>",
            "cleaned_text": "Functional safety engineering services with ISO 26262 evidence and contact details.",
        }

    module.fetch_page = fetch_page
    sys.modules["app.crawler.fetch_page"] = module

    linkedin_posts = types.ModuleType("app.social.linkedin_posts")

    async def fetch_linkedin_company_posts(company):
        return []

    linkedin_posts.fetch_linkedin_company_posts = fetch_linkedin_company_posts
    sys.modules["app.social.linkedin_posts"] = linkedin_posts

    linkedin_public = types.ModuleType("app.social.linkedin_public_scraper")

    async def fetch_public_linkedin_company_profile(company):
        return []

    linkedin_public.fetch_public_linkedin_company_profile = fetch_public_linkedin_company_profile
    sys.modules["app.social.linkedin_public_scraper"] = linkedin_public

    if importlib.util.find_spec("httpx") is None:
        httpx = types.ModuleType("httpx")

        class AsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return None

            async def get(self, *args, **kwargs):
                raise RuntimeError("httpx stub should not be called in offline unit tests")

        httpx.AsyncClient = AsyncClient
        sys.modules["httpx"] = httpx

    llm_client = types.ModuleType("app.services.llm_client")

    async def generate_json(*args, **kwargs):
        return {}

    llm_client.generate_json = generate_json
    sys.modules["app.services.llm_client"] = llm_client

    bullmq = types.ModuleType("bullmq")
    bullmq.Worker = object
    sys.modules["bullmq"] = bullmq

    fastapi = types.ModuleType("fastapi")

    class FastAPI:
        def __init__(self, *args, **kwargs):
            self.state = types.SimpleNamespace()

        def on_event(self, *args, **kwargs):
            def decorator(func):
                return func

            return decorator

        def get(self, *args, **kwargs):
            def decorator(func):
                return func

            return decorator

    fastapi.FastAPI = FastAPI
    sys.modules["fastapi"] = fastapi

    dotenv = types.ModuleType("dotenv")
    dotenv.load_dotenv = lambda *args, **kwargs: None
    sys.modules["dotenv"] = dotenv

    redis_asyncio = types.ModuleType("redis.asyncio")

    class Redis:
        async def ping(self):
            return True

        async def aclose(self):
            return None

    redis_asyncio.Redis = Redis
    redis_module = types.ModuleType("redis")
    redis_module.asyncio = redis_asyncio
    sys.modules["redis"] = redis_module
    sys.modules["redis.asyncio"] = redis_asyncio

    database = types.ModuleType("app.services.database")

    async def get_db():
        return None

    database.get_db = get_db
    sys.modules["app.services.database"] = database

    bson = types.ModuleType("bson")
    bson_objectid = types.ModuleType("bson.objectid")

    class ObjectId(str):
        def __new__(cls, value="000000000000000000000000"):
            return str.__new__(cls, str(value))

    bson_objectid.ObjectId = ObjectId
    bson.objectid = bson_objectid
    sys.modules["bson"] = bson
    sys.modules["bson.objectid"] = bson_objectid


_install_fetch_stub()

from app.enrichment.fallback_contact_discovery import _people_from_text
from app.enrichment.source_enrichment import (
    _directory_evidence,
    _run_search_queries,
    _website_seed_evidence,
    parse_discovery_sources,
)
from app.extraction.keyword_matcher import detect_keywords
from app.main import _extraction_evidence, _usable_evidence
from app.scoring.fit_score import calculate_fit_score
from app.main import _draft_suppression_reason, _fallback_fact_type
from app.campaign_context import matching_terms
from app.crawler.url_safety import UnsafeUrlError, validate_public_http_url


class HardeningHelperTests(unittest.TestCase):
    def test_release_files_and_sample_data_are_present(self):
        repo_root = WORKER_ROOT.parents[1]

        self.assertTrue((repo_root / "LICENSE").exists())
        self.assertIn("MIT License", (repo_root / "LICENSE").read_text(encoding="utf-8"))
        self.assertTrue((repo_root / "sample_companies.csv").exists())
        self.assertIn("clean_companies.csv", (repo_root / ".gitignore").read_text(encoding="utf-8"))
        self.assertIn("human-in-the-loop", (repo_root / "README.md").read_text(encoding="utf-8").lower())

    def test_url_safety_blocks_private_and_unsafe_targets(self):
        blocked = [
            "http://localhost",
            "http://127.0.0.1",
            "http://0.0.0.0",
            "http://10.0.0.1",
            "http://172.16.0.1",
            "http://192.168.1.1",
            "http://[::1]",
            "http://169.254.169.254/latest/meta-data",
            "file:///etc/passwd",
        ]

        for url in blocked:
            with self.subTest(url=url):
                with self.assertRaises(UnsafeUrlError):
                    validate_public_http_url(url)

    def test_url_safety_allows_public_ip_https(self):
        self.assertEqual(validate_public_http_url("https://93.184.216.34"), "https://93.184.216.34")

    def test_keyword_matching_uses_boundaries_and_aliases(self):
        self.assertNotIn("CTO", detect_keywords("They work in multiple sectors.", ["CTO"]))
        self.assertIn("CTO", detect_keywords("The CTO leads engineering.", ["CTO"]))
        self.assertIn("CTO", detect_keywords("The Chief Technology Officer leads engineering.", ["CTO"]))
        self.assertIn("HARA", detect_keywords("HARA-based safety analysis", ["HARA"]))
        self.assertIn("ISO 26262", detect_keywords("ISO-26262 compliance workflow", ["ISO 26262"]))
        self.assertIn("simulation and validation", detect_keywords("simulation\nand   validation tools", ["simulation and validation"]))

    def test_target_roles_are_not_qualification_terms_or_fallback_buying_facts(self):
        campaign = {
            "buyingSignals": ["ISO 26262"],
            "negativeSignals": [],
            "targetIndustries": ["automotive"],
            "targetCompanyTypes": ["simulation and validation"],
            "targetRoles": ["CTO"],
        }

        self.assertNotIn("CTO", matching_terms(campaign))
        self.assertIsNone(_fallback_fact_type("CTO", campaign))
        self.assertEqual(_fallback_fact_type("ISO 26262", campaign), "buying_signal")
        self.assertEqual(_fallback_fact_type("automotive", campaign), "company_fit")

    def test_typed_website_sources_use_website_provider(self):
        sources = parse_discovery_sources([
            "website:https://example.com/safety",
            "directory:https://example.com/member",
        ])

        website_evidence = asyncio.run(_website_seed_evidence(sources))
        directory_evidence = asyncio.run(_directory_evidence(sources))

        self.assertEqual(website_evidence[0]["provider"], "website_provider")
        self.assertEqual(directory_evidence[0]["provider"], "directory_provider")

    def test_disabled_search_provider_returns_status_marker(self):
        evidence = asyncio.run(_run_search_queries(["dSPACE ISO 26262"], "search_provider", "search_result", {}))

        self.assertEqual(evidence[0]["retrievalStatus"], "disabled")
        self.assertEqual(evidence[0]["providerStatus"]["status"], "disabled")

    def test_failed_evidence_is_not_usable_or_extractable(self):
        evidence = [
            {
                "retrievalStatus": "failed",
                "confidence": 0.1,
                "sourceType": "website_directory",
                "cleanedText": "Provider directory_provider could not retrieve https://missing.example",
            },
            {
                "retrievalStatus": "completed",
                "confidence": 0.8,
                "sourceType": "website_product",
                "cleanedText": "This product page contains more than eighty characters about safety engineering, ISO 26262, and validation workflows.",
            },
            {
                "retrievalStatus": "metadata_only",
                "confidence": 0.45,
                "sourceType": "linkedin_company_profile",
                "cleanedText": "LinkedIn company profile URL supplied: https://linkedin.com/company/example",
            },
        ]

        usable = _usable_evidence(evidence)
        extractable = _extraction_evidence(usable)

        self.assertEqual(len(usable), 2)
        self.assertEqual(len(extractable), 1)
        self.assertEqual(extractable[0]["sourceType"], "website_product")

    def test_contact_parser_rejects_marketing_headings_and_keeps_directors(self):
        text = """
        Developing and Testing for Sustainable Agriculture
        Executive Directors: Dr. Carsten Hoff, Jens Grösch
        Portfolio & Technologies from Idea to Market
        """

        people = _people_from_text(text, ["Engineering Director", "Head of Safety"])
        names = {person["name"] for person in people}

        self.assertIn("Dr. Carsten Hoff", names)
        self.assertIn("Jens Grösch", names)
        self.assertNotIn("Developing and Testing", names)

    def test_mocked_qualified_and_rejected_pipeline_paths(self):
        campaign = {
            "targetIndustries": ["automotive"],
            "targetCompanyTypes": ["simulation"],
            "regions": ["Germany"],
            "minimumScoreForContacts": 50,
            "minimumScoreForDraft": 75,
        }
        qualified_profile = {
            "company_summary": "German simulation and validation company for automotive safety engineering.",
            "industry_tags": ["automotive"],
            "location_tags": ["Germany"],
            "products_services": ["simulation", "validation", "safety engineering"],
        }
        qualified_signals = [
            {
                "factType": "buying_signal",
                "confidence": 0.92,
                "relevanceScore": 0.9,
                "sourceType": "website_jobs",
                "sourceUrl": "https://example.com/jobs",
                "evidenceId": "e1",
            },
            {
                "factType": "buying_signal",
                "confidence": 0.88,
                "relevanceScore": 0.86,
                "sourceType": "website_product",
                "sourceUrl": "https://example.com/product",
                "evidenceId": "e2",
            },
            {
                "factType": "company_fit",
                "confidence": 0.9,
                "relevanceScore": 0.88,
                "sourceType": "job_posting",
                "sourceUrl": "https://jobs.example.com",
                "evidenceId": "e3",
            },
        ]
        qualified_score = calculate_fit_score(
            qualified_profile,
            qualified_signals,
            campaign,
            evidence_count=3,
            evidence_source_counts={"website_jobs": 1, "website_product": 1, "job_posting": 1},
        )

        self.assertGreaterEqual(qualified_score["fitScore"], 75)
        self.assertEqual(
            _draft_suppression_reason(qualified_score, campaign, {"verdict": "approve"}, True, False, False),
            "draft_allowed",
        )

        rejected_score = calculate_fit_score(
            {"company_summary": "Food service restaurants.", "industry_tags": ["food service"], "location_tags": ["Germany"]},
            [],
            campaign,
            evidence_count=1,
            evidence_source_counts={"website_homepage": 1},
        )

        self.assertLess(rejected_score["fitScore"], 50)
        self.assertTrue(
            _draft_suppression_reason(rejected_score, campaign, {"verdict": "skipped"}, False, False, False).startswith(
                "score_below_draft_threshold"
            )
        )

    def test_dspace_like_homepage_does_not_create_cto_match(self):
        text = """
        dSPACE specializes in several sectors including e-mobility and sustainable agriculture.
        Simulation and Validation of your Innovations.
        """

        self.assertNotIn("CTO", detect_keywords(text, ["CTO", "simulation and validation"]))
        self.assertIn("simulation and validation", detect_keywords(text, ["CTO", "simulation and validation"]))


if __name__ == "__main__":
    unittest.main()
