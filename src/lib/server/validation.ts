import { z } from 'zod';

export const INTERESTS = ['Quan tâm hội viên', 'Hợp tác chuyên môn', 'Đề nghị cung cấp thông tin', 'Khác'] as const;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;

const email = z
  .string({ error: 'Vui lòng nhập email.' })
  .trim()
  .toLowerCase()
  .max(254, 'Email quá dài.')
  .pipe(z.email({ error: 'Email không hợp lệ.' }));

const common = {
  /** Honeypot: real visitors never see or fill this field. */
  website: z.string().max(200).optional().default(''),
  openedAt: z.number().int().optional(),
  turnstileToken: z.string().max(4096).optional().default(''),
  sourcePath: z.string().max(200).regex(/^\/[^\s]*$/).optional().default('/'),
  utm: z
    .record(z.string(), z.string().max(80))
    .optional()
    .default({})
    .transform((u) => Object.fromEntries(Object.entries(u).filter(([k]) => (UTM_KEYS as readonly string[]).includes(k)))),
};

export const joinSchema = z.object({
  ...common,
  kind: z.literal('membership'),
  name: z.string({ error: 'Vui lòng nhập họ và tên.' }).trim().min(1, 'Vui lòng nhập họ và tên.').max(120, 'Họ và tên quá dài.'),
  company: z.string({ error: 'Vui lòng nhập tổ chức / doanh nghiệp.' }).trim().min(1, 'Vui lòng nhập tổ chức / doanh nghiệp.').max(160, 'Tên tổ chức quá dài.'),
  email,
  phone: z.string().trim().max(30).regex(/^[0-9+().\-\s]*$/, 'Số điện thoại không hợp lệ.').optional().default(''),
  interest: z.enum(INTERESTS).optional().default('Quan tâm hội viên'),
  message: z.string().trim().max(1000, 'Nội dung tối đa 1000 ký tự.').optional().default(''),
  consent: z.literal(true, { error: 'Vui lòng đồng ý để VBFA liên hệ lại.' }),
  consentVersion: z.string().max(40).optional().default('join-v2'),
});

export const newsletterSchema = z.object({
  ...common,
  kind: z.literal('newsletter'),
  email,
});

export type JoinInput = z.infer<typeof joinSchema>;
export type NewsletterInput = z.infer<typeof newsletterSchema>;
export type LeadKind = 'membership' | 'newsletter';

/** First Vietnamese message per field, for the form to display. */
export function fieldErrors(error: z.ZodError): { fields: Record<string, string>; message: string } {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    fields[key] ??= issue.message;
  }
  const message = Object.values(fields)[0] ?? 'Dữ liệu chưa hợp lệ.';
  return { fields, message };
}
