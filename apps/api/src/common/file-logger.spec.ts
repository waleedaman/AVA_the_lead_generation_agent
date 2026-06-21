import { sanitizeForLog } from './file-logger';

describe('sanitizeForLog', () => {
  it('redacts secrets and common contact PII', () => {
    const result = sanitizeForLog({
      apiKey: 'secret',
      email: 'person@example.com',
      contactName: 'Jane Doe',
      nested: { linkedinUrl: 'https://linkedin.com/in/jane' },
      safe: 'ok',
    });

    expect(result).toEqual({
      apiKey: '[redacted]',
      email: '[redacted]',
      contactName: '[redacted]',
      nested: { linkedinUrl: '[redacted]' },
      safe: 'ok',
    });
  });

  it('truncates long strings', () => {
    const result = sanitizeForLog({ value: 'x'.repeat(4100) });

    expect(String(result.value)).toContain('[truncated]');
    expect(String(result.value).length).toBeLessThan(4100);
  });
});
