import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { invoke } from '../plugin-rpc.js';
import { z } from 'zod';
import { workbookPlanSchema, workbookReadSchema } from '../../shared/excel-workbook.js';
export function excelTools(readBudget: () => number) {
  return [
    defineTool({
      name: 'excel_read_workbook',
      label: 'Read workbook',
      description:
        'Read live data from any sheet in this workbook. list_sheets lists up to 100 sheet IDs/names (offset for pagination); sheet_info gives used range, tables and charts; read_range reads a worksheet-local A1 rectangle. Use exact sheet IDs/names. Read focused ranges (at most 10,000 cells) and check returned bounds/truncated. Old results are historical snapshots; reread for current values. This tool never edits.',
      parameters: Type.Unsafe<z.infer<typeof workbookReadSchema>>(
        z.toJSONSchema(workbookReadSchema, { io: 'input' }),
      ),
      async execute(_id, args, signal) {
        const maxBytes = readBudget();
        if (maxBytes < 512)
          throw new Error('Insufficient remaining model context for another workbook read.');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                await invoke('excel_read_workbook', { query: args, maxBytes }, signal),
              ),
            },
          ],
          details: {},
        };
      },
    }),
    defineTool({
      name: 'excel_edit_workbook',
      label: 'Prepare worksheet edits',
      description:
        'Prepare ONE batch on EXISTING worksheets for Preview → Apply. Each action has sheet ID/name and exact worksheet-local A1 range. write values replace only that rectangle; formulas use zero-based offsets within it; formulas-only preserves all other cells. null clears. sourceOperationId imports saved SQL rows into a matching destination rectangle. format changes only specified appearance/number format. table/chart create or update by name, using range for the table/source data; charts may specify position. sort/filter columns are zero-based within range. clear_filter removes criteria. insert_rows/delete_rows affect ENTIRE rows touched by range; insert_columns/delete_columns affect ENTIRE columns, shifting other cells and references. Structural actions must be a separate one-action batch; use new addresses afterwards. Prefer current sheet and selected top-left cell for new content; output may extend beyond selection. Read relevant destinations first. End your response after proposal; never say pending edits were applied.',
      parameters: Type.Unsafe<z.infer<typeof workbookPlanSchema>>(
        z.toJSONSchema(workbookPlanSchema, { io: 'input' }),
      ),
      async execute(_id, args, signal) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(await invoke('excel_edit_workbook', args, signal)),
            },
          ],
          details: {},
        };
      },
    }),
    defineTool({
      name: 'excel_read_selection',
      label: 'Read selected cells',
      description:
        'Read a rectangular section from the CURRENT captured selection. Offsets are zero-based relative to that selection. Values are literal; formulas are listed separately with selection-relative offsets. Only returned cells have been inspected. Check actual rows/columns and truncated before requesting another section; never infer omitted rows. This cannot access other ranges or workbooks.',
      parameters: Type.Object({
        row: Type.Integer({ minimum: 0 }),
        column: Type.Integer({ minimum: 0 }),
        rows: Type.Integer({ minimum: 1 }),
        columns: Type.Integer({ minimum: 1 }),
      }),
      async execute(_id, args, signal) {
        const maxBytes = readBudget();
        if (maxBytes < 512)
          throw new Error(
            'Insufficient remaining context for another section. Explain the inspected range and ask for a focused selection or fresh conversation.',
          );
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                await invoke('excel_read_selection', { ...args, maxBytes }, signal),
              ),
            },
          ],
          details: {},
        };
      },
    }),
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
