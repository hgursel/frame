import { z } from 'zod';

export const MAX_SELECTION_CELLS = 500000;
export const MAX_COLUMNS = 4096;
export const MAX_SELECTION_BYTES = 12 * 1024 * 1024;
export const MAX_IMPORT_CELLS = MAX_SELECTION_CELLS;
export const excelLimitsSchema = z
  .object({
    maxCells: z.number().int().min(2000).max(MAX_SELECTION_CELLS),
    maxColumns: z.number().int().min(100).max(MAX_COLUMNS),
  })
  .strict();
export type ExcelLimits = z.infer<typeof excelLimitsSchema>;
export const DEFAULT_EXCEL_LIMITS: ExcelLimits = { maxCells: 100000, maxColumns: 1024 };
export const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
export const scalar = z.union([z.string().max(32767), z.number().finite(), z.boolean(), z.null()]);
export type ExcelScalar = z.infer<typeof scalar>;
const matrix = z
  .array(z.array(scalar).min(1).max(MAX_COLUMNS))
  .min(1)
  .max(MAX_SELECTION_CELLS)
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
      .array(z.array(z.string().max(300)).min(1).max(MAX_COLUMNS))
      .min(1)
      .max(MAX_SELECTION_CELLS),
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
      jsonBytes(s) > MAX_SELECTION_BYTES
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Selection exceeds the 500,000-cell or 12 MiB transfer ceiling, or has inconsistent dimensions.',
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
      .max(MAX_SELECTION_CELLS)
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
      bad('Generated proposals exceed the 500,000-cell ceiling.');
    if (new Set(p.formulas.map((f) => `${f.row}:${f.column}`)).size !== p.formulas.length)
      bad('Duplicate formula destinations.');
    if (
      p.values &&
      p.formulas.some((f) => f.row >= p.values!.length || f.column >= p.values![0]!.length)
    )
      bad('Formula falls outside the proposed range.');
    if (jsonBytes(p) > MAX_SELECTION_BYTES) bad('Proposal exceeds the 12 MiB transfer ceiling.');
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
export type ExcelProposalSummary = Pick<
  ExcelProposal,
  'id' | 'runId' | 'summary' | 'status' | 'result' | 'sourceNotice'
> & {
  target: string;
  rows: number;
  columns: number;
};
export interface ExcelSection {
  row: number;
  column: number;
  rows: number;
  columns: number;
  values: ExcelScalar[][];
  formulas: { row: number; column: number; formula: string }[];
  completeSelection: boolean;
  truncated: boolean;
}
export interface ExcelInspection {
  runId: string;
  address: string;
  rows: number;
  columns: number;
  ranges: { row: number; column: number; rows: number; columns: number }[];
}
export interface ExcelModelContext {
  captureId: string;
  selection: Pick<ExcelSelection, 'sheetId' | 'sheetName' | 'address' | 'row' | 'column'> & {
    rows: number;
    columns: number;
  };
  initial?: ExcelSection;
  recent: ExcelTurn['recent'];
  limits: ExcelLimits;
}

/** Only actual formulas travel to the model; literal formula-like strings stay literal values. */
export function selectionSection(
  s: ExcelSelection,
  row: number,
  column: number,
  rows: number,
  columns: number,
  maxBytes: number,
): ExcelSection {
  if (maxBytes < 128)
    throw new Error(
      'Insufficient model context for another section. Start a fresh conversation or focus the selection.',
    );
  if (row >= s.values.length || column >= s.values[0]!.length)
    throw new Error('Requested section is outside the captured selection.');
  const requestedRows = Math.min(rows, s.values.length - row),
    requestedColumns = Math.min(columns, s.values[0]!.length - column);
  rows = requestedRows;
  columns = requestedColumns;
  for (;;) {
    const values = s.values.slice(row, row + rows).map((r) => r.slice(column, column + columns));
    const formulas: ExcelSection['formulas'] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < columns; c++) {
        const formula = s.formulas[row + r]![column + c];
        if (
          typeof formula === 'string' &&
          formula.startsWith('=') &&
          formula !== s.values[row + r]![column + c]
        )
          formulas.push({ row: row + r, column: column + c, formula });
      }
    const result = {
      row,
      column,
      rows,
      columns,
      values,
      formulas,
      completeSelection:
        row === 0 && column === 0 && rows === s.values.length && columns === s.values[0]!.length,
      truncated: rows < requestedRows || columns < requestedColumns,
    };
    if (jsonBytes(result) <= maxBytes && rows * columns <= 10000) return result;
    if (rows > 1) rows = Math.max(1, Math.floor(rows / 2));
    else if (columns > 1) columns = Math.max(1, Math.floor(columns / 2));
    else
      throw new Error(
        'This cell exceeds the remaining model context budget. Select less text or start a fresh conversation.',
      );
  }
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
