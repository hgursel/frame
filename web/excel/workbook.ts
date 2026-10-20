import {
  excelCellValue,
  MAX_SELECTION_CELLS,
  sameSelection,
  selectionSchema,
  type ExcelSelection,
  type ExcelProposal,
} from '../../shared/excel.js';

async function snapshot(
  context: Excel.RequestContext,
  range: Excel.Range,
): Promise<ExcelSelection> {
  range.load('rowIndex,columnIndex,rowCount,columnCount,address');
  const sheet = range.worksheet;
  sheet.load('id,name');
  await context.sync();
  if (range.rowCount * range.columnCount > MAX_SELECTION_CELLS || range.columnCount > 100)
    throw new Error('Select one rectangle of up to 2,000 cells and 100 columns.');
  range.load('values,formulas,numberFormat');
  await context.sync();
  return selectionSchema.parse({
    sheetId: sheet.id,
    sheetName: sheet.name,
    address: range.address,
    row: range.rowIndex,
    column: range.columnIndex,
    values: range.values,
    formulas: range.formulas,
    numberFormat: range.numberFormat,
  });
}
export function captureSelection() {
  return Excel.run(async (context) => snapshot(context, context.workbook.getSelectedRange()));
}
function sourceRange(context: Excel.RequestContext, s: ExcelSelection) {
  return context.workbook.worksheets
    .getItem(s.sheetId)
    .getRangeByIndexes(s.row, s.column, s.values.length, s.values[0]!.length);
}
export async function checkProposal(context: Excel.RequestContext, proposal: ExcelProposal) {
  const source = sourceRange(context, proposal.baseline);
  if (!sameSelection(proposal.baseline, await snapshot(context, source)))
    throw new Error(
      'The captured cells or worksheet name changed. Reject this proposal and ask again with a fresh selection.',
    );
  const change = proposal.change;
  context.workbook.protection.load('protected');
  if (change.target === 'selection') {
    const merged = source.getMergedAreasOrNullObject();
    source.load('hasSpill');
    source.worksheet.protection.load('protected');
    const tables = source.getTables(false);
    tables.load('items/name');
    await context.sync();
    if (
      !merged.isNullObject ||
      source.hasSpill !== false ||
      source.worksheet.protection.protected ||
      tables.items.length
    )
      throw new Error(
        'This pilot cannot replace merged/spill cells, protected sheets, or cells inside Excel tables. Ask for a new worksheet instead.',
      );
  } else {
    const existing = context.workbook.worksheets.getItemOrNullObject(change.sheetName!);
    await context.sync();
    if (!existing.isNullObject)
      throw new Error('That worksheet name already exists. Ask Frame to use a new name.');
  }
  if (context.workbook.protection.protected) throw new Error('The workbook is protected.');
}
export function verifyProposal(proposal: ExcelProposal) {
  return Excel.run((context) => checkProposal(context, proposal));
}
/** Call only after a successful, one-time server claim. No automatic retries or rollback. */
export function applyProposal(proposal: ExcelProposal) {
  return Excel.run(async (context) => {
    await checkProposal(context, proposal);
    const c = proposal.change;
    const sheet =
      c.target === 'new_sheet'
        ? context.workbook.worksheets.add(c.sheetName!)
        : context.workbook.worksheets.getItem(proposal.baseline.sheetId);
    const range =
      c.target === 'new_sheet'
        ? sheet.getRangeByIndexes(0, 0, c.values.length, c.values[0]!.length)
        : sourceRange(context, proposal.baseline);
    // Typed strings cannot be interpreted as formulas, including SQL values starting with '='.
    range.valuesAsJson = c.values.map((row) => row.map(excelCellValue));
    for (const f of c.formulas) range.getCell(f.row, f.column).formulas = [[f.formula]];
    if (c.table) sheet.tables.add(range, true);
    if (c.chart) {
      const types = {
        column: Excel.ChartType.columnClustered,
        bar: Excel.ChartType.barClustered,
        line: Excel.ChartType.line,
        pie: Excel.ChartType.pie,
      };
      const chart = sheet.charts.add(types[c.chart], range, Excel.ChartSeriesBy.columns);
      chart.title.text = c.sheetName!;
      chart.setPosition(
        sheet.getCell(0, c.values[0]!.length + 1),
        sheet.getCell(18, c.values[0]!.length + 9),
      );
    }
    if (c.target === 'new_sheet') {
      range.format.autofitColumns();
      sheet.activate();
    }
    await context.sync();
    return c.target === 'new_sheet'
      ? `Created worksheet ${c.sheetName}.`
      : `Updated ${proposal.baseline.address}.`;
  });
}
