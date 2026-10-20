import { z } from 'zod';

export const MAX_SELECTION_CELLS = 2000;
export const MAX_IMPORT_CELLS = 10000;
export const scalar = z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()]);
export type ExcelScalar = z.infer<typeof scalar>;
const matrix = z
  .array(z.array(scalar).min(1).max(100))
  .min(1)
  .max(2000)
  .refine((rows) => rows.every((r) => r.length === rows[0]!.length), 'Use a rectangular matrix.');
export const selectionSchema = z
  .object({
    sheetId: z.string().min(1).max(200),
    sheetName: z.string().min(1).max(31),
    address: z.string().min(1).max(200),
    row: z.number().int().min(0).max(1048575),
    column: z.number().int().min(0).max(16383),
    values: matrix,
    formulas: matrix,
    numberFormat: z
      .array(z.array(z.string().max(300)).min(1).max(100))
      .min(1)
      .max(2000),
  })
  .strict()
  .superRefine((s, ctx) => {
    const rows = s.values.length,
      cols = s.values[0]!.length;
    if (
      rows * cols > MAX_SELECTION_CELLS ||
      s.row + rows > 1048576 ||
      s.column + cols > 16384 ||
      [s.formulas, s.numberFormat].some(
        (m) => m.length !== rows || m.some((r) => r.length !== cols),
      ) ||
      JSON.stringify(s).length > 64000
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Select a smaller rectangular range (up to 2,000 cells and 64 KB).',
      });
  });
export type ExcelSelection = z.infer<typeof selectionSchema>;
export const sheetNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(31)
  .refine(
    (s) =>
      !/[\\/\[\]*?:\x00-\x1f]/.test(s) &&
      !s.startsWith("'") &&
      !s.endsWith("'") &&
      s.toLowerCase() !== 'history',
    'Invalid worksheet name.',
  );
export const formulaSchema = z
  .string()
  .min(2)
  .max(2000)
  .startsWith('=')
  .refine(
    (s) =>
      !/[\[\]{}|\x00-\x1f]/.test(s) &&
      [...s.replace(/"(?:[^"]|"")*"/g, '""').matchAll(/([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g)].every(
        (m) =>
          new Set(
            'SUM SUMIF SUMIFS SUMPRODUCT COUNT COUNTA COUNTBLANK COUNTIF COUNTIFS AVERAGE AVERAGEIF AVERAGEIFS MIN MAX MEDIAN ROUND ROUNDUP ROUNDDOWN ABS INT MOD IF IFS IFERROR IFNA AND OR NOT TRUE FALSE XLOOKUP VLOOKUP HLOOKUP INDEX MATCH XMATCH LEFT RIGHT MID LEN TRIM CLEAN UPPER LOWER PROPER CONCAT CONCATENATE TEXTJOIN SUBSTITUTE REPLACE FIND SEARCH EXACT VALUE TEXT DATE YEAR MONTH DAY TODAY NOW EDATE EOMONTH DATEDIF DAYS NETWORKDAYS WORKDAY WEEKDAY ISBLANK ISNUMBER ISTEXT ISERROR ROW COLUMN ROWS COLUMNS SUBTOTAL AGGREGATE'.split(
              ' ',
            ),
          ).has(m[1]!.toUpperCase()),
      ),
    'Use supported built-in formulas; external links, arrays, macros, and custom functions are not supported in this pilot.',
  );
export const proposalSchema = z
  .object({
    summary: z.string().trim().min(1).max(1000),
    target: z.enum(['selection', 'new_sheet']),
    sheetName: sheetNameSchema.optional(),
    values: matrix.optional(),
    formulas: z
      .array(
        z
          .object({
            row: z.number().int().min(0),
            column: z.number().int().min(0),
            formula: formulaSchema,
          })
          .strict(),
      )
      .max(2000)
      .default([]),
    sourceOperationId: z.uuid().optional(),
    table: z.boolean().default(false),
    chart: z.enum(['column', 'bar', 'line', 'pie']).optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (!!p.values === !!p.sourceOperationId)
      bad('Provide values or a saved SQL operation ID, not both.');
    if (p.target === 'new_sheet' && !p.sheetName) bad('Name the new worksheet.');
    if (p.target === 'selection' && (p.table || p.chart || p.sheetName || p.sourceOperationId))
      bad('Tables, charts and SQL imports require a new worksheet.');
    if (p.sourceOperationId && p.formulas.length)
      bad('SQL imports preserve source values; do not supply formulas.');
    if (p.values && p.values.length * p.values[0]!.length > MAX_SELECTION_CELLS)
      bad('Generated proposals are limited to 2,000 cells.');
    if (new Set(p.formulas.map((f) => `${f.row}:${f.column}`)).size !== p.formulas.length)
      bad('Duplicate formula destinations.');
    if (
      p.values &&
      p.formulas.some((f) => f.row >= p.values!.length || f.column >= p.values![0]!.length)
    )
      bad('Formula falls outside the proposed range.');
    if (JSON.stringify(p).length > 100000) bad('Proposal is too large.');
  });
export type ExcelChange = z.infer<typeof proposalSchema>;
export interface ExcelProposal {
  id: string;
  runId: string;
  summary: string;
  status: 'pending' | 'applying' | 'applied' | 'rejected' | 'failed' | 'unknown';
  change: ExcelChange & { values: ExcelScalar[][] };
  baseline: ExcelSelection;
  sourceNotice?: string;
  result?: string;
}
export interface ExcelTurn {
  selection: ExcelSelection;
  recent: { summary: string; status: string; result?: string }[];
}
// Literal data, including SQL text, must never become executable formulas.
export function excelCellValue(
  value: ExcelScalar,
):
  | { type: 'Empty' }
  | { type: 'String'; basicValue: string }
  | { type: 'Double'; basicValue: number }
  | { type: 'Boolean'; basicValue: boolean } {
  if (value === null) return { type: 'Empty' };
  if (typeof value === 'string') return { type: 'String', basicValue: value };
  if (typeof value === 'number') return { type: 'Double', basicValue: value };
  return { type: 'Boolean', basicValue: value };
}
export function sameSelection(a: ExcelSelection, b: ExcelSelection) {
  return (
    a.sheetId === b.sheetId &&
    a.sheetName === b.sheetName &&
    a.row === b.row &&
    a.column === b.column &&
    JSON.stringify([a.values, a.formulas, a.numberFormat]) ===
      JSON.stringify([b.values, b.formulas, b.numberFormat])
  );
}
