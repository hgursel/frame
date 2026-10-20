import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { invoke } from '../plugin-rpc.js';
export function excelTools() {
  return [
    defineTool({
      name: 'excel_propose_changes',
      label: 'Prepare Excel changes',
      description:
        'Prepare ONE bounded batch for human preview in Excel. This does NOT apply changes. End your response after a successful proposal and wait. Replace the entire captured selection (same dimensions) or create a new worksheet. Supply literal values (null clears a cell), plus explicit formulas with zero-based row/column offsets. Preserve existing formulas explicitly when replacing cells. For SQL imports use sourceOperationId from mssql_query, never copy its truncated preview. SQL imports must create a new sheet. Table/chart require a header row. No macros, scripts, external formulas, deletes, or arbitrary workbook access.',
      parameters: Type.Object({
        summary: Type.String(),
        target: Type.Union([Type.Literal('selection'), Type.Literal('new_sheet')]),
        sheetName: Type.Optional(Type.String()),
        values: Type.Optional(
          Type.Array(
            Type.Array(Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()])),
          ),
        ),
        formulas: Type.Optional(
          Type.Array(
            Type.Object({ row: Type.Integer(), column: Type.Integer(), formula: Type.String() }),
          ),
        ),
        sourceOperationId: Type.Optional(Type.String()),
        table: Type.Optional(Type.Boolean()),
        chart: Type.Optional(
          Type.Union(['column', 'bar', 'line', 'pie'].map((v) => Type.Literal(v))),
        ),
      }),
      async execute(_id, args, signal) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(await invoke('excel_propose', args, signal)),
            },
          ],
          details: {},
        };
      },
    }),
  ];
}
