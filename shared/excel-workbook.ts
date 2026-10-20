import { z } from 'zod';
import {
  formulaSchema,
  jsonBytes,
  MAX_SELECTION_BYTES,
  proposalSchema,
  selectionSchema,
  type ExcelProposal,
  type ExcelLimits,
} from './excel.js';

// Explicit, worksheet-local A1 rectangles only: no external workbooks, unions, or whole-sheet reads.
export function rangeBounds(address: string) {
  const match = /^\$?([A-Z]{1,3})\$?([1-9]\d{0,6})(?::\$?([A-Z]{1,3})\$?([1-9]\d{0,6}))?$/i.exec(
    address,
  );
  if (!match) throw new Error('Use a worksheet-local A1 rectangle, such as A1:D20.');
  const column = (letters: string) =>
    [...letters.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const row = Number(match[2]) - 1,
    col = column(match[1]!);
  const endRow = Number(match[4] || match[2]) - 1,
    endCol = column(match[3] || match[1]!);
  if (endRow < row || endCol < col || endRow >= 1048576 || endCol >= 16384)
    throw new Error('Range is outside worksheet bounds or reversed.');
  return { row, column: col, rows: endRow - row + 1, columns: endCol - col + 1 };
}
const address = z
  .string()
  .max(40)
  .refine((v) => {
    try {
      rangeBounds(v);
      return true;
    } catch {
      return false;
    }
  }, 'Use a valid A1 rectangle.');
const sheet = z.string().min(1).max(200);
const target = { sheet, range: address };
const name = z.string().min(1).max(100);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
export const cellFormatSchema = z
  .object({
    numberFormat: z.string().min(1).max(300).optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    fontSize: z.number().min(1).max(409).optional(),
    fontColor: color.optional(),
    fillColor: color.optional(),
    horizontalAlignment: z.enum(['Left', 'Center', 'Right', 'General']).optional(),
    wrapText: z.boolean().optional(),
    columnWidth: z.number().min(1).max(1000).optional(),
    rowHeight: z.number().min(1).max(409).optional(),
    autofitColumns: z.boolean().optional(),
    autofitRows: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Specify formatting to change.');
const formula = z
  .object({ row: z.number().int().min(0), column: z.number().int().min(0), formula: formulaSchema })
  .strict();
const values = proposalSchema.shape.values;
export const workbookActionSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('write'),
        ...target,
        values,
        formulas: z.array(formula).max(500000).default([]),
        sourceOperationId: z.uuid().optional(),
      })
      .strict(),
    z.object({ kind: z.literal('format'), ...target, format: cellFormatSchema }).strict(),
    z
      .object({
        kind: z.literal('table'),
        ...target,
        mode: z.enum(['create', 'update']),
        name,
        style: z
          .string()
          .regex(/^TableStyle(?:Light|Medium|Dark)\d{1,2}$/)
          .optional(),
        showTotals: z.boolean().optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('chart'),
        ...target,
        mode: z.enum(['create', 'update']),
        name,
        chartType: z.enum(['column', 'bar', 'line', 'pie']),
        title: z.string().max(200).optional(),
        position: address.optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('sort'),
        ...target,
        hasHeaders: z.boolean().default(true),
        fields: z
          .array(z.object({ column: z.number().int().min(0), ascending: z.boolean() }).strict())
          .min(1)
          .max(64),
      })
      .strict(),
    z
      .object({
        kind: z.literal('filter'),
        ...target,
        column: z.number().int().min(0),
        values: z.array(z.string().max(1000)).min(1).max(1000),
      })
      .strict(),
    z.object({ kind: z.literal('clear_filter'), ...target }).strict(),
    ...(['insert_rows', 'delete_rows', 'insert_columns', 'delete_columns'] as const).map((kind) =>
      z.object({ kind: z.literal(kind), ...target }).strict(),
    ),
  ])
  .superRefine((a, ctx) => {
    const b = rangeBounds(a.range),
      bad = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (a.kind === 'write') {
      if (a.sourceOperationId && (a.values || a.formulas.length))
        bad('Use saved SQL values without generated values or formulas.');
      if (!a.sourceOperationId && !a.values && !a.formulas.length)
        bad('Supply values, formulas, or a saved SQL operation.');
      if (a.values && (a.values.length !== b.rows || a.values[0]!.length !== b.columns))
        bad('Values must match the destination rectangle.');
      if (a.formulas.some((f) => f.row >= b.rows || f.column >= b.columns))
        bad('Formula falls outside the destination.');
      if (new Set(a.formulas.map((f) => `${f.row}:${f.column}`)).size !== a.formulas.length)
        bad('Duplicate formula destinations.');
    }
    if (a.kind === 'sort' && a.fields.some((f) => f.column >= b.columns))
      bad('Sort column is outside the range.');
    if (a.kind === 'filter' && a.column >= b.columns) bad('Filter column is outside the range.');
    if (
      a.kind === 'table' &&
      (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(a.name) || /^[A-Za-z]{1,3}[1-9]\d*$/.test(a.name))
    )
      bad(
        'Use an Excel table name starting with a letter or underscore, without spaces or a cell reference.',
      );
  });
export const isStructural = (a: { kind: string }) =>
  /^(insert|delete)_(rows|columns)$/.test(a.kind);
export const workbookPlanSchema = z
  .object({
    summary: z.string().trim().min(1).max(1000),
    actions: z.array(workbookActionSchema).min(1).max(20),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.actions.some(isStructural) && p.actions.length !== 1)
      ctx.addIssue({
        code: 'custom',
        message:
          'Preview a row/column insertion or deletion as its own batch; subsequent addresses can change.',
      });
    if (jsonBytes(p) > MAX_SELECTION_BYTES)
      ctx.addIssue({ code: 'custom', message: 'Workbook proposal exceeds the transfer ceiling.' });
  });
export type WorkbookAction = z.infer<typeof workbookActionSchema>;
export type WorkbookPlan = z.infer<typeof workbookPlanSchema>;
export const workbookReadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('list_sheets'), offset: z.number().int().min(0).default(0) }).strict(),
  z.object({ kind: z.literal('sheet_info'), sheet }).strict(),
  z.object({ kind: z.literal('read_range'), ...target }).strict(),
]);
export type WorkbookRead = z.infer<typeof workbookReadSchema>;
export interface WorkbookRequest {
  id: string;
  runId: string;
  limits: ExcelLimits;
  task:
    | { kind: 'read'; query: WorkbookRead; maxBytes: number }
    | { kind: 'inspect'; plan: WorkbookPlan };
}
export const workbookCheckSchema = z
  .object({
    selection: selectionSchema,
    // Range/table/chart metadata used to detect structural changes between preview and Apply.
    metadata: z.string().max(1000000),
    usedRange: z.string().max(200).optional(),
  })
  .strict();
export type WorkbookCheck = z.infer<typeof workbookCheckSchema>;
export interface WorkbookProposal extends Omit<ExcelProposal, 'change' | 'baseline'> {
  kind: 'workbook';
  plan: WorkbookPlan;
  checks: WorkbookCheck[];
}
export type AnyExcelProposal = ExcelProposal | WorkbookProposal;
export const isWorkbookProposal = (p: AnyExcelProposal): p is WorkbookProposal =>
  'kind' in p && p.kind === 'workbook';
export function checkPlanLimits(plan: WorkbookPlan, limits: ExcelLimits) {
  let cells = 0;
  for (const action of plan.actions) {
    const b = rangeBounds(action.range);
    cells += b.rows * b.columns;
    if (b.columns > limits.maxColumns || cells > limits.maxCells)
      throw new Error(
        'Workbook batch exceeds configured Excel cell/column limits. Split it into smaller batches.',
      );
  }
}
export function actionLabel(a: WorkbookAction) {
  const b = rangeBounds(a.range);
  if (isStructural(a))
    return `${a.kind.replaceAll('_', ' ')} · ${a.sheet}!${a.range} · entire ${a.kind.endsWith('rows') ? 'rows' : 'columns'} (${a.kind.endsWith('rows') ? b.rows : b.columns}); other cells and formula references may shift`;
  const labels = {
    write: 'Update cells',
    format: 'Format cells',
    table: 'Table',
    chart: 'Chart',
    sort: 'Sort rows',
    filter: 'Filter rows',
    clear_filter: 'Clear filters',
  };
  return `${labels[a.kind as keyof typeof labels] || a.kind.replaceAll('_', ' ')} · ${a.sheet}!${a.range}`;
}
