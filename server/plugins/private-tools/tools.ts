import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import type { PrivateToolDefinition } from '../../../shared/private-tools.js';
import { invoke } from '../../plugin-rpc.js';

export function privateTools(definitions: PrivateToolDefinition[]) {
  return definitions.map((tool) => {
    const fields: Record<string, any> = {};
    for (const p of tool.parameters) {
      const value =
        p.type === 'string'
          ? Type.String({ maxLength: 16000, description: p.description })
          : p.type === 'number'
            ? Type.Number({ description: p.description })
            : Type.Boolean({ description: p.description });
      fields[p.name] = p.required ? value : Type.Optional(value);
    }
    return defineTool({
      name: `private_${tool.id}`,
      label: tool.name,
      description: tool.description,
      parameters: Type.Object(fields, { additionalProperties: false }),
      async execute(_id, input, signal) {
        const result = await invoke('private_tool', { id: tool.id, input }, signal);
        return {
          content: [{ type: 'text' as const, text: result.output }],
          details: { privateTool: true },
        };
      },
    });
  });
}
