import { appendFile, mkdir } from 'fs/promises';
import { resolve } from 'path';
import { NextRequest, NextResponse } from 'next/server';

const LOG_DIR = process.env.WEB_LOG_DIR || resolve(process.cwd(), 'logs');
const LOG_FILE = resolve(LOG_DIR, 'web-client.jsonl');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const safeBody = sanitizeRecord(body);
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(
      LOG_FILE,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'web',
        event: 'client_event',
        userAgent: request.headers.get('user-agent'),
        ...safeBody,
      })}\n`,
      'utf8',
    );
  } catch {
    // Ignore logging failures from the client.
  }
  return NextResponse.json({ ok: true });
}

function sanitizeRecord(value: unknown): Record<string, unknown> {
  return sanitize(value) as Record<string, unknown>;
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (!value || typeof value !== 'object') return value;

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
