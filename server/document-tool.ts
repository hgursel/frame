import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { documentCommand } from './python.js';

export function documentTool(pythonPath: string, artifactDir: string) {
  return defineTool({
    name: 'create_document',
    label: 'Create Word document',
    description:
      'Create a finished downloadable Word document (DOCX only) from text. For every PDF request use the Reports plugin reports_create instead; this tool cannot generate PDFs. Supports headings and bullet lists; inline Markdown is treated as plain text. Choose a new filename for each revision. Does not run arbitrary Python code.',
    parameters: Type.Object({
      title: Type.String({ minLength: 1, maxLength: 200 }),
      markdown: Type.String({ minLength: 1, maxLength: 120000 }),
      format: Type.Literal('docx'),
      filename: Type.String({ pattern: '^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$' }),
    }),
    async execute(_id, parameters, signal) {
      if (parameters.format !== 'docx')
        throw new Error(
          'PDF generation is available only through the Reports plugin. Use reports_create.',
        );
      const result = await documentCommand(
        pythonPath,
        { command: 'generate', directory: artifactDir, ...parameters },
        signal,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: `Created ${result.name} (${result.bytes} bytes). The file is ready in this conversation’s downloads.`,
          },
        ],
        details: { name: result.name, bytes: result.bytes },
      };
    },
  });
}
