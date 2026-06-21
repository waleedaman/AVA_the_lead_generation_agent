import { appendFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const LOG_DIR = process.env.API_LOG_DIR || resolve(process.cwd(), 'logs');
const LOG_FILE = resolve(LOG_DIR, 'api-service.jsonl');

export function logApiEvent(event: string, data: Record<string, unknown> = {}) {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const safeData = sanitizeRecord(data);
    appendFileSync(
      LOG_FILE,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'api',
        event,
        ...safeData,
      })}\n`,
      'utf8',
    );
  } catch {
    // Logging must never break API behavior.
  }
}

function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  return sanitize(value) as Record<string, unknown>;
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      output[key] = '[redacted]';
    } else if (typeof raw === 'string' && raw.length > 4000) {
      output[key] = `${raw.slice(0, 4000)}\n[truncated]`;
    } else {
      output[key] = sanitize(raw);
    }
  }
  return output;
}

function isSensitiveKey(key: string): boolean {
  return /password|token|secret|authorization|cookie|api[_-]?key|access[_-]?key|private[_-]?key/i.test(key);
}
