import os
import asyncio
from openai import AsyncOpenAI
import json
from datetime import datetime
from pathlib import Path
from time import perf_counter
from uuid import uuid4
from .service_logger import log_event

raw_local_base_url = os.getenv("OLLAMA_LOCAL_BASE_URL", os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434"))
raw_cloud_base_url = os.getenv("OLLAMA_CLOUD_BASE_URL", os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434"))

OLLAMA_LOCAL_BASE_URL = raw_local_base_url if raw_local_base_url.endswith("/v1") else f"{raw_local_base_url.rstrip('/')}/v1"
OLLAMA_CLOUD_BASE_URL = raw_cloud_base_url if raw_cloud_base_url.endswith("/v1") else f"{raw_cloud_base_url.rstrip('/')}/v1"

OLLAMA_LOCAL_API_KEY = os.getenv("OLLAMA_LOCAL_API_KEY", os.getenv("OLLAMA_API_KEY", "ollama"))
OLLAMA_CLOUD_API_KEY = os.getenv("OLLAMA_CLOUD_API_KEY", os.getenv("OLLAMA_API_KEY", "ollama"))

LOCAL_MODEL_NAME = os.getenv("OLLAMA_LOCAL_MODEL", "gemma4:26b")
CLOUD_MODEL_NAME = os.getenv("OLLAMA_CLOUD_MODEL", os.getenv("OLLAMA_MODEL", "gemma4:31b-cloud"))

TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "800"))
LOCAL_TIMEOUT = int(os.getenv("OLLAMA_LOCAL_TIMEOUT_SECONDS", "90"))
MAX_TOKENS = int(os.getenv("OLLAMA_MAX_TOKENS", "15000"))

FALLBACK_LOCAL_TO_CLOUD = os.getenv("OLLAMA_LOCAL_FALLBACK_TO_CLOUD", "true").lower() not in {"0", "false", "no"}
LOCAL_TO_CLOUD_FALLBACK_TASKS = {
    task.strip()
    for task in os.getenv("OLLAMA_LOCAL_TO_CLOUD_FALLBACK_TASKS", "website_selection").split(",")
    if task.strip()
}

LOG_ENABLED = os.getenv("LLM_LOG_ENABLED", "true").lower() not in {"0", "false", "no"}
LOG_REDACT = os.getenv("LLM_LOG_REDACT", "false").lower() in {"1", "true", "yes"}
LOG_MAX_CHARS = int(os.getenv("LLM_LOG_MAX_CHARS", "20000"))
DEFAULT_LOG_DIR = Path(__file__).resolve().parents[2] / "logs" / "llm"
LOG_DIR = Path(os.getenv("LLM_LOG_DIR", str(DEFAULT_LOG_DIR)))

LOCAL_TASKS = {"website_selection", "angle_selection", "drafting", "quality_check", "profile_extraction", "signal_extraction"}
CLOUD_TASKS = {"website_selection_verification", "oversight", "important"}

local_client = AsyncOpenAI(base_url=OLLAMA_LOCAL_BASE_URL, api_key=OLLAMA_LOCAL_API_KEY, timeout=LOCAL_TIMEOUT)
cloud_client = AsyncOpenAI(base_url=OLLAMA_CLOUD_BASE_URL, api_key=OLLAMA_CLOUD_API_KEY, timeout=TIMEOUT)

def model_for_task(task: str | None = None, model: str | None = None) -> str:
    if model:
        return model
    if task in LOCAL_TASKS:
        return LOCAL_MODEL_NAME
    if task in CLOUD_TASKS:
        return CLOUD_MODEL_NAME
    return CLOUD_MODEL_NAME


def parse_json_content(content: str | None) -> dict:
    if not content:
        return {}
    try:
        return _sanitize_json_result(json.loads(content))
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start >= 0 and end > start:
            try:
                return _sanitize_json_result(json.loads(content[start : end + 1]))
            except json.JSONDecodeError:
                return {}
        return {}


def _sanitize_json_result(value: object) -> dict:
    if not isinstance(value, dict):
        return {}
    result = dict(value)
    for key in ("confidence", "relevance_score", "relevanceScore", "qualityScore", "score"):
        if key not in result:
            continue
        try:
            number = float(result[key])
        except (TypeError, ValueError):
            result[key] = 0
            continue
        upper_bound = 10 if key in {"qualityScore", "score"} else 1
        result[key] = max(0, min(number, upper_bound))
    return result


async def generate_json(
    prompt: str,
    system_message: str = "You are a helpful assistant.",
    task: str | None = None,
    model: str | None = None,
    temperature: float = 0.1,
    max_tokens: int | None = None,
) -> dict:
    """
    Calls the LLM expecting a JSON response and parses it.
    """
    selected_model = model_for_task(task, model)
    fallback_model = (
        CLOUD_MODEL_NAME
        if selected_model == LOCAL_MODEL_NAME
        and FALLBACK_LOCAL_TO_CLOUD
        and task in LOCAL_TO_CLOUD_FALLBACK_TASKS
        else None
    )
    started_at = datetime.utcnow()
    started_timer = perf_counter()
    request_id = uuid4().hex
    content = None
    parsed: dict = {}
    log_event(
        "llm_request_start",
        requestId=request_id,
        task=task,
        model=selected_model,
        baseUrl=OLLAMA_LOCAL_BASE_URL if selected_model == LOCAL_MODEL_NAME else OLLAMA_CLOUD_BASE_URL,
        maxTokens=max_tokens or MAX_TOKENS,
        promptChars=len(prompt),
    )
    try:
        content = await _request_content(
            model=selected_model,
            system_message=system_message,
            prompt=prompt,
            temperature=temperature,
            max_tokens=max_tokens or MAX_TOKENS,
            timeout_seconds=LOCAL_TIMEOUT if selected_model == LOCAL_MODEL_NAME else TIMEOUT,
        )
        parsed = parse_json_content(content)
        if parsed:
            parsed["_model"] = selected_model
        log_path = _write_llm_log(
            request_id=request_id,
            started_at=started_at,
            duration_ms=int((perf_counter() - started_timer) * 1000),
            task=task,
            model=selected_model,
            system_message=system_message,
            prompt=prompt,
            raw_response=content,
            parsed_response=parsed,
        )
        log_event(
            "llm_request_success",
            requestId=request_id,
            task=task,
            model=selected_model,
            durationMs=int((perf_counter() - started_timer) * 1000),
            parsedKeys=list(parsed.keys()),
            logPath=log_path,
        )
        return parsed
    except Exception as e:
        error_message = _format_exception(e)
        print(f"LLM call failed model={selected_model} task={task}: {error_message}")
        log_path = _write_llm_log(
            request_id=request_id,
            started_at=started_at,
            duration_ms=int((perf_counter() - started_timer) * 1000),
            task=task,
            model=selected_model,
            system_message=system_message,
            prompt=prompt,
            raw_response=content,
            parsed_response=parsed,
            error=error_message,
        )
        log_event(
            "llm_request_failed",
            requestId=request_id,
            task=task,
            model=selected_model,
            durationMs=int((perf_counter() - started_timer) * 1000),
            error=error_message,
            fallbackModel=fallback_model,
            logPath=log_path,
        )
        if fallback_model:
            return await _generate_json_with_model(
                prompt=prompt,
                system_message=system_message,
                task=f"{task}_local_fallback",
                model=fallback_model,
                temperature=temperature,
                max_tokens=max_tokens,
                fallback_from=selected_model,
            )
        return {}


async def _generate_json_with_model(
    prompt: str,
    system_message: str,
    task: str | None,
    model: str,
    temperature: float,
    max_tokens: int | None,
    fallback_from: str | None = None,
) -> dict:
    started_at = datetime.utcnow()
    started_timer = perf_counter()
    request_id = uuid4().hex
    content = None
    parsed: dict = {}
    log_event(
        "llm_fallback_start",
        requestId=request_id,
        task=task,
        model=model,
        fallbackFrom=fallback_from,
        maxTokens=max_tokens or MAX_TOKENS,
        promptChars=len(prompt),
    )
    try:
        content = await _request_content(
            model=model,
            system_message=system_message,
            prompt=prompt,
            temperature=temperature,
            max_tokens=max_tokens or MAX_TOKENS,
            timeout_seconds=TIMEOUT,
        )
        parsed = parse_json_content(content)
        if parsed:
            parsed["_model"] = model
            if fallback_from:
                parsed["_fallback_from"] = fallback_from
        log_path = _write_llm_log(
            request_id=request_id,
            started_at=started_at,
            duration_ms=int((perf_counter() - started_timer) * 1000),
            task=task,
            model=model,
            system_message=system_message,
            prompt=prompt,
            raw_response=content,
            parsed_response=parsed,
            fallback_from=fallback_from,
        )
        log_event(
            "llm_fallback_success",
            requestId=request_id,
            task=task,
            model=model,
            fallbackFrom=fallback_from,
            durationMs=int((perf_counter() - started_timer) * 1000),
            parsedKeys=list(parsed.keys()),
            logPath=log_path,
        )
        return parsed
    except Exception as e:
        error_message = _format_exception(e)
        print(f"Fallback LLM call failed model={model} task={task}: {error_message}")
        log_path = _write_llm_log(
            request_id=request_id,
            started_at=started_at,
            duration_ms=int((perf_counter() - started_timer) * 1000),
            task=task,
            model=model,
            system_message=system_message,
            prompt=prompt,
            raw_response=content,
            parsed_response=parsed,
            error=error_message,
            fallback_from=fallback_from,
        )
        log_event(
            "llm_fallback_failed",
            requestId=request_id,
            task=task,
            model=model,
            fallbackFrom=fallback_from,
            durationMs=int((perf_counter() - started_timer) * 1000),
            error=error_message,
            logPath=log_path,
        )
        return {}


async def _request_content(
    model: str,
    system_message: str,
    prompt: str,
    temperature: float,
    max_tokens: int,
    timeout_seconds: int,
) -> str | None:
    client_to_use = local_client if model == LOCAL_MODEL_NAME else cloud_client
    response = await asyncio.wait_for(
        client_to_use.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=temperature,
            max_tokens=max_tokens,
        ),
        timeout=timeout_seconds,
    )
    return response.choices[0].message.content


def _write_llm_log(
    request_id: str,
    started_at: datetime,
    duration_ms: int,
    task: str | None,
    model: str,
    system_message: str,
    prompt: str,
    raw_response: str | None,
    parsed_response: dict,
    error: str | None = None,
    fallback_from: str | None = None,
) -> str | None:
    if not LOG_ENABLED:
        return None

    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = started_at.strftime("%Y%m%dT%H%M%S%fZ")
        task_slug = (task or "default").replace("/", "_").replace("\\", "_")
        model_slug = model.replace("/", "_").replace(":", "_").replace("\\", "_")
        log_path = LOG_DIR / f"{timestamp}_{task_slug}_{model_slug}_{request_id}.json"
        payload = {
            "request_id": request_id,
            "started_at": started_at.isoformat() + "Z",
            "duration_ms": duration_ms,
            "task": task,
            "model": model,
            "base_url": OLLAMA_LOCAL_BASE_URL if model == LOCAL_MODEL_NAME else OLLAMA_CLOUD_BASE_URL,
            "system_message": _log_text(system_message),
            "prompt": _log_text(prompt),
            "raw_response": _log_text(raw_response),
            "parsed_response": parsed_response,
            "error": error,
            "fallback_from": fallback_from,
        }
        log_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return str(log_path)
    except Exception as log_error:
        print(f"Error writing LLM log: {log_error}")
        return None


def _log_text(value: str | None) -> str | None:
    if value is None:
        return None
    if LOG_REDACT:
        return "[redacted]"
    if len(value) > LOG_MAX_CHARS:
        return value[:LOG_MAX_CHARS] + "\n[truncated]"
    return value


def _format_exception(error: Exception) -> str:
    message = str(error)
    name = type(error).__name__
    return f"{name}: {message}" if message else name
