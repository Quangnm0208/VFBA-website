import { describe, expect, it } from 'vitest';
import { createLogger } from './log';

describe('createLogger', () => {
  it('writes one JSON line per event with the request id', () => {
    const lines: string[] = [];
    createLogger('abc', (l) => lines.push(l)).info('thing.happened', { status: 200, durationMs: 12 });
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: 'info', event: 'thing.happened', requestId: 'abc', status: 200, durationMs: 12 });
  });

  it('redacts personal and secret fields even if a caller passes them', () => {
    const lines: string[] = [];
    createLogger('abc', (l) => lines.push(l)).warn('oops', { email: 'a@b.vn', Name: 'An', phone: '0912', message: 'hi', ip: '1.2.3.4', turnstileToken: 'tok', kind: 'membership' });
    const out = JSON.parse(lines[0]!);
    for (const key of ['email', 'Name', 'phone', 'message', 'ip', 'turnstileToken']) expect(out[key]).toBe('[redacted]');
    expect(out.kind).toBe('membership');
    expect(lines[0]).not.toContain('a@b.vn');
  });
});
