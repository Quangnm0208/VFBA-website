/**
 * Technical logging for Vercel Functions.
 *
 * Boundary (docs/ARCHITECTURE.md §"Data boundaries"):
 *  - Technical monitoring (errors, latency, status codes, request ids) goes to stdout as structured JSON.
 *    Vercel Runtime Logs / Log Drains / Observability collect it.
 *  - Customer data (names, emails, messages, consent) is stored ONLY in Supabase `website_leads`.
 *  - Therefore logs must never contain customer data. The logger redacts known personal fields and the
 *    handlers only pass non-identifying facts (kind, status, duration, error code).
 */
const REDACT = /^(email|name|phone|company|message|ip|token|secret|key|authorization|cookie|turnstile.*|website)$/i;

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

const safe = (fields: LogFields = {}): LogFields =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, REDACT.test(k) ? '[redacted]' : v]));

export function createLogger(requestId: string, sink: (line: string) => void = (line) => console.log(line)): Logger {
  const write = (level: 'info' | 'warn' | 'error') => (event: string, fields?: LogFields) =>
    sink(JSON.stringify({ level, event, requestId, ts: new Date().toISOString(), ...safe(fields) }));
  return { info: write('info'), warn: write('warn'), error: write('error') };
}
