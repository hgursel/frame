import { z } from 'zod';
export const browserUrl = z
  .string()
  .max(8192)
  .refine((s) => {
    try {
      const u = new URL(s);
      return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
    } catch {
      return false;
    }
  }, 'Use an HTTP(S) website address without credentials.');
export const browserActionSchema = z
  .object({
    kind: z.enum(['navigate', 'click', 'fill', 'select', 'press', 'scroll']),
    tab: z.string().min(1).max(80).optional(),
    ref: z.string().min(1).max(100).optional(),
    url: browserUrl.optional(),
    value: z.string().max(8000).optional(),
    key: z.enum(['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp']).optional(),
    direction: z.enum(['up', 'down']).optional(),
  })
  .strict()
  .superRefine((a, c) => {
    if (a.kind === 'navigate' ? !a.url : !a.tab)
      c.addIssue({
        code: 'custom',
        message: 'Provide a website URL for navigation, or an attached tab ID.',
      });
    if (['click', 'fill', 'select', 'press'].includes(a.kind) && !a.ref)
      c.addIssue({ code: 'custom', message: 'Use a current page element ref.' });
    if (['fill', 'select'].includes(a.kind) && a.value === undefined)
      c.addIssue({ code: 'custom', message: 'Provide the field value.' });
  });
export type BrowserAction = z.infer<typeof browserActionSchema>;
export const browserBatchSchema = z
  .object({
    summary: z.string().trim().min(1).max(1000),
    actions: z.array(browserActionSchema).min(1).max(20),
  })
  .strict();
export const browserTabSchema = z
  .object({ id: z.string().min(1).max(80), url: browserUrl, title: z.string().max(500) })
  .strict();
export type BrowserTab = z.infer<typeof browserTabSchema>;
export const preparedActionSchema = z
  .object({
    action: browserActionSchema,
    url: browserUrl,
    title: z.string().max(500),
    label: z.string().max(500),
    fingerprint: z.string().min(1).max(16000),
    review: z.boolean(),
    reason: z.string().max(500),
  })
  .strict();
export type PreparedBrowserAction = z.infer<typeof preparedActionSchema>;
export interface BrowserReview {
  id: string;
  runId: string;
  summary: string;
  actions: PreparedBrowserAction[];
  expiresAt: number;
  handoff?: boolean;
}
export interface BrowserState {
  enabled: boolean;
  connected: boolean;
  device?: { id: string; name: string };
  tabs: BrowserTab[];
  review?: BrowserReview;
}
export interface BrowserCommand {
  id: string;
  conversationId: string;
  runId: string;
  kind: 'snapshot' | 'screenshot' | 'prepare' | 'execute';
  payload: unknown;
  expiresAt: number;
}
