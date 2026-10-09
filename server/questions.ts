import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { QuestionRequest } from '../shared/questions.js';

const fail = (message: string) => Object.assign(new Error(message), { statusCode: 409 });
export const questionSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        header: z.string().trim().min(1).max(40),
        question: z.string().trim().min(1).max(2000),
        multiple: z.boolean().default(false),
        options: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(160),
              description: z.string().max(500).optional(),
            }),
          )
          .min(2)
          .max(4)
          .refine(
            (a) => new Set(a.map((o) => o.label)).size === a.length,
            'Use distinct option labels',
          ),
      }),
    )
    .min(1)
    .max(4)
    .refine((a) => new Set(a.map((q) => q.id)).size === a.length, 'Use distinct question IDs'),
});
const answerSchema = z.object({
  runId: z.uuid(),
  cancelled: z.boolean().default(false),
  answers: z
    .array(
      z.object({
        questionId: z.string().max(80),
        selected: z.array(z.string().max(160)).max(4).default([]),
        text: z.string().trim().max(4000).default(''),
      }),
    )
    .max(4)
    .default([]),
});
type Pending = {
  request: QuestionRequest;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};
export class Questions extends EventEmitter {
  private pending = new Map<string, Pending>();
  private answered = new Map<string, { conversationId: string; runId: string; body: string }>();
  get(id: string) {
    return this.pending.get(id)?.request;
  }
  ask(conversationId: string, runId: string, args: unknown, signal: AbortSignal) {
    const parsed = questionSchema.parse(args);
    if (signal.aborted) return Promise.reject(new Error('Task stopped.'));
    if (this.pending.has(conversationId)) throw fail('Answer the pending questions first.');
    const request = { id: randomUUID(), runId, questions: parsed.questions };
    return new Promise<unknown>((resolve, reject) => {
      const cleanup = () => {
        signal.removeEventListener('abort', abort);
        this.pending.delete(conversationId);
        this.emit('change', conversationId);
      };
      const abort = () => {
        cleanup();
        reject(new Error('Task stopped.'));
      };
      this.pending.set(conversationId, {
        request,
        resolve: (value) => {
          cleanup();
          resolve(value);
        },
        reject: abort,
      });
      signal.addEventListener('abort', abort, { once: true });
      this.emit('change', conversationId);
    });
  }
  answer(conversationId: string, id: string, input: unknown) {
    const value = answerSchema.parse(input);
    const body = JSON.stringify(value);
    const previous = this.answered.get(id);
    if (previous) {
      if (
        previous.conversationId === conversationId &&
        previous.runId === value.runId &&
        previous.body === body
      )
        return { ok: true };
      throw fail('These questions have already been answered.');
    }
    const pending = this.pending.get(conversationId);
    if (!pending || pending.request.id !== id || pending.request.runId !== value.runId)
      throw fail('These questions are no longer waiting for an answer.');
    if (!value.cancelled) {
      if (
        value.answers.length !== pending.request.questions.length ||
        new Set(value.answers.map((a) => a.questionId)).size !== value.answers.length
      )
        throw fail('Answer each question once.');
      for (const q of pending.request.questions) {
        const a = value.answers.find((a) => a.questionId === q.id);
        if (
          !a ||
          (!a.text && !a.selected.length) ||
          (!q.multiple && a.selected.length > 1) ||
          new Set(a.selected).size !== a.selected.length ||
          a.selected.some((label) => !q.options.some((o) => o.label === label))
        )
          throw fail(`Choose an available option or write an answer for ${q.header}.`);
      }
    }
    this.answered.set(id, { conversationId, runId: value.runId, body });
    pending.resolve({ cancelled: value.cancelled, answers: value.cancelled ? [] : value.answers });
    return { ok: true };
  }
  finish(runId: string) {
    for (const [id, answer] of this.answered) if (answer.runId === runId) this.answered.delete(id);
  }
}
