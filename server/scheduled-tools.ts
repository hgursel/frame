import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { invoke } from './plugin-rpc.js';
export function scheduleTool() {
  return defineTool({
    name: 'schedule_task',
    label: 'Prepare scheduled task',
    description:
      'When the user asks to do work later or repeatedly, prepare a standalone task for review. It is NOT active until the user clicks Activate. Include all necessary instructions, using current project knowledge and tools at runtime; conversation attachments/history are not copied. Use the administrator timezone and current date supplied in context. Ask if timing is ambiguous. Supports read-only SQL, analysis, charts, reports, and automatic email after activation. Resolve registered recipients with email_recipients; never guess addresses. Recipients must be exact approved addresses. No database writes or executable skills. Do not create an ordinary email draft for future delivery.',
    parameters: Type.Object({
      title: Type.String(),
      instructions: Type.String(),
      timing: Type.Object({
        kind: Type.Union(
          ['once', 'daily', 'weekdays', 'weekly', 'monthly'].map((v) => Type.Literal(v)),
        ),
        time: Type.String({ description: '24-hour HH:mm in the administrator timezone' }),
        date: Type.Optional(Type.String({ description: 'YYYY-MM-DD, required for once' })),
        weekday: Type.Optional(
          Type.Number({ description: '0 Sunday through 6 Saturday, required for weekly' }),
        ),
        day: Type.Optional(
          Type.Number({ description: '1–31, required for monthly; missing days are skipped' }),
        ),
      }),
      recipients: Type.Array(Type.String()),
      attachments: Type.Union([Type.Literal('none'), Type.Literal('generated')]),
    }),
    async execute(_id, args, signal) {
      const task = await invoke('schedule_prepare', args, signal);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ...task,
              message: 'Review card created. Not active. The user must click Activate.',
            }),
          },
        ],
        details: {},
      };
    },
  });
}
export function scheduledEmailTool() {
  return defineTool({
    name: 'scheduled_email',
    label: 'Prepare scheduled delivery',
    description:
      'Prepare the one authorized email for this run. The server supplies the fixed recipients and sends after successful completion without further approval. Use only generated output filenames as attachments if authorized. Never claim delivery before SMTP accepts it. Call once, after completing analysis and generating requested outputs.',
    parameters: Type.Object({
      subject: Type.String(),
      body: Type.String(),
      attachments: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_id, args, signal) {
      const draft = await invoke('scheduled_email', args, signal);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              id: draft.id,
              message: 'Prepared for automatic delivery after this run completes.',
            }),
          },
        ],
        details: {},
      };
    },
  });
}
export function scheduledFailureTool() {
  return defineTool({
    name: 'scheduled_fail',
    label: 'Report scheduled task failure',
    description:
      'Mark this run failed when required data or capabilities are unavailable or the requested work cannot be completed. The owner will see the reason in Scheduled and receive a failure email when possible. Do not prepare a success email afterward.',
    parameters: Type.Object({ reason: Type.String() }),
    async execute(_id, args, signal) {
      await invoke('scheduled_fail', args, signal);
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Failure recorded. End this run with a brief explanation.',
          },
        ],
        details: {},
      };
    },
  });
}
