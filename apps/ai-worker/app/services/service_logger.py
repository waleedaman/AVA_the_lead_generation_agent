import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

DEFAULT_LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
LOG_DIR = Path(os.getenv("AI_WORKER_LOG_DIR", str(DEFAULT_LOG_DIR)))
LOG_FILE = LOG_DIR / "ai-worker-service.jsonl"


def log_event(event: str, **data: Any) -> None:
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        payload = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "service": "ai-worker",
            "event": event,
            **_sanitize(data),
        }
        with LOG_FILE.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False, default=str) + "\n")
    except Exception:
        pass


def _sanitize(value: Any) -> Any:
    if isinstance(value, dict):
        result = {}
        for key, raw in value.items():
            if _is_sensitive_key(str(key)):
                result[key] = "[redacted]"
            else:
                result[key] = _sanitize(raw)
        return result
    if isinstance(value, list):
        return [_sanitize(item) for item in value]
    if isinstance(value, str) and len(value) > 4000:
        return value[:4000] + "\n[truncated]"
    return value


def _is_sensitive_key(key: str) -> bool:
    normalized = key.lower().replace("-", "_")
    if any(token in normalized for token in ("password", "token", "secret", "authorization", "cookie")):
        return True
    return normalized in {"key", "api_key", "access_key", "private_key"}
