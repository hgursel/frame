import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { invoke } from './plugin-rpc.js';
export function emailTools() {
  return [
    defineTool({
      name: 'email_recipients',
      label: 'Find email recipients',
      description:
        'Find registered recipients by display name or exact email, or use me for the signed-in user. Ask the user to choose if ambiguous. Never invent an address; unregistered recipients require an exact address supplied by the user.',
      parameters: Type.Object({ query: Type.String() }),
      async execute(_id, args, signal) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(await invoke('email_recipients', args, signal)),
            },
          ],
          details: {},
        };
      },
    }),
    defineTool({
      name: 'email_outputs',
      label: 'Find email attachments',
      description:
        'List generated outputs from this conversation available as email attachments. Uploaded files and project knowledge are not email attachments.',
      parameters: Type.Object({}),
      async execute(_id, args, signal) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(await invoke('email_outputs', args, signal)),
            },
          ],
          details: {},
        };
      },
    }),
    defineTool({
      name: 'email_prepare',
      label: 'Prepare email for review',
      description:
        'Prepare an email ONLY when the user asks for one. This does not send anything. The user must review the visible draft and click Send. Use exact allowed recipient addresses, plain text body, and optional generated filenames from email_outputs. No CC, BCC, Reply-To, links as attachments, or automatic sending. Never claim an email was sent from this tool result.',
      parameters: Type.Object({
        to: Type.Array(Type.String(), { minItems: 1, maxItems: 20 }),
        subject: Type.String(),
        body: Type.String(),
        attachments: Type.Optional(Type.Array(Type.String(), { maxItems: 10 })),
      }),
      async execute(_id, args, signal) {
        const draft = await invoke('email_prepare', args, signal);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                id: draft.id,
                status: draft.status,
                message:
                  'Draft prepared for human review. Not sent. The user must click Send in Frame.',
              }),
            },
          ],
          details: {},
        };
      },
    }),
  ];
}
