import {
  excelCellValue,
  MAX_SELECTION_CELLS,
  MAX_COLUMNS,
  MAX_SELECTION_BYTES,
  DEFAULT_EXCEL_LIMITS,
  jsonBytes,
  type ExcelLimits,
  sameSelection,
  selectionSchema,
  type ExcelSelection,
  type ExcelProposal,
} from '../../shared/excel.js';
import { isWorkbookProposal, type AnyExcelProposal } from '../../shared/excel-workbook.js';

export async function snapshot(
  context: Excel.RequestContext,
  range: Excel.Range,
  limits: ExcelLimits = { maxCells: MAX_SELECTION_CELLS, maxColumns: MAX_COLUMNS },
): Promise<ExcelSelection> {
  range.load('rowIndex,columnIndex,rowCount,columnCount,address');
  const sheet = range.worksheet;
  sheet.load('id,name');
  await context.sync();
  if (range.rowCount * range.columnCount > limits.maxCells || range.columnCount > limits.maxColumns)
    throw new Error(
      `Select one rectangle of up to ${limits.maxCells.toLocaleString()} cells and ${limits.maxColumns.toLocaleString()} columns. Configure limits in Frame settings.`,
    );
  const values: ExcelSelection['values'] = Array.from({ length: range.rowCount }, () => []);
  const formulas: ExcelSelection['formulas'] = Array.from({ length: range.rowCount }, () => []);
  const numberFormat: string[][] = Array.from({ length: range.rowCount }, () => []);
  let bytes = 0;
  const width = Math.min(range.columnCount, 256),
    height = Math.max(1, Math.floor(5000 / width));
  for (let row = 0; row < range.rowCount; row += height)
    for (let col = 0; col < range.columnCount; col += width) {
      const block = sheet.getRangeByIndexes(
        range.rowIndex + row,
        range.columnIndex + col,
        Math.min(height, range.rowCount - row),
        Math.min(width, range.columnCount - col),
      );
      block.load('values,formulas,numberFormat');
      await context.sync();
      bytes += jsonBytes([block.values, block.formulas, block.numberFormat]);
      if (bytes > MAX_SELECTION_BYTES)
        throw new Error('Selection exceeds the 12 MiB transfer ceiling. Select a smaller range.');
      for (let r = 0; r < block.values.length; r++) {
        values[row + r]!.push(...block.values[r]!);
        formulas[row + r]!.push(...block.formulas[r]!);
        numberFormat[row + r]!.push(...block.numberFormat[r]!);
      }
    }
  sheet.load('id,name');
  await context.sync();
  return selectionSchema.parse({
    sheetId: sheet.id,
    sheetName: sheet.name,
    address: range.address,
    row: range.rowIndex,
    column: range.columnIndex,
    values,
    formulas,
    numberFormat,
  });
}
export function captureSelection(limits = DEFAULT_EXCEL_LIMITS) {
  return Excel.run(async (context) =>
    snapshot(context, context.workbook.getSelectedRange(), limits),
  );
}
export async function watchSelection(update: (address: string) => void) {
  let alive = true;
  const refresh = async () => {
    try {
      const address = await Excel.run(async (context) => {
        const r = context.workbook.getSelectedRange();
        r.load('address');
        await context.sync();
        return r.address;
      });
      if (alive) update(address);
    } catch {
      if (alive) update('Multiple areas selected');
    }
  };
  const handlers = await Excel.run(async (context) => {
    const handlers = [
      context.workbook.onSelectionChanged.add(refresh),
      context.workbook.worksheets.onActivated.add(refresh),
    ];
    await context.sync();
    return handlers;
  });
  await refresh();
  return async () => {
    alive = false;
    for (const handler of handlers)
      await Excel.run(handler.context, async (context) => {
        handler.remove();
        await context.sync();
      }).catch(() => {});
  };
}
function sourceRange(context: Excel.RequestContext, s: ExcelSelection) {
  return context.workbook.worksheets
    .getItem(s.sheetId)
    .getRangeByIndexes(s.row, s.column, s.values.length, s.values[0]!.length);
}
export async function checkProposal(context: Excel.RequestContext, proposal: AnyExcelProposal) {
  if (isWorkbookProposal(proposal))
    return (await import('./operations.js')).checkWorkbookProposal(context, proposal);
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
    await context.sync();
    if (!merged.isNullObject || source.hasSpill !== false || source.worksheet.protection.protected)
      throw new Error(
        'The destination contains merged/spill cells or is protected. Choose the exact editable cells or adjust the worksheet in Excel.',
      );
  } else {
    const existing = context.workbook.worksheets.getItemOrNullObject(change.sheetName!);
    await context.sync();
    if (!existing.isNullObject)
      throw new Error('That worksheet name already exists. Ask Frame to use a new name.');
  }
  if (context.workbook.protection.protected) throw new Error('The workbook is protected.');
}
export function verifyProposal(proposal: AnyExcelProposal) {
  return Excel.run((context) => checkProposal(context, proposal));
}
/** Call only after a successful, one-time server claim. No automatic retries or rollback. */
export async function applyProposal(
  proposal: AnyExcelProposal,
  progress?: (message: string) => void,
) {
  if (isWorkbookProposal(proposal))
    return (await import('./operations.js')).applyWorkbookProposal(proposal, progress);
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
    let done = 0;
    const total = c.values.length * c.values[0]!.length;
    const formulasByRow = new Map<number, typeof c.formulas>();
    for (const formula of c.formulas) {
      const row = formulasByRow.get(formula.row) || [];
      row.push(formula);
      formulasByRow.set(formula.row, row);
    }
    const write = async (
      row: number,
      column: number,
      rows: number,
      columns: number,
    ): Promise<void> => {
      const cells = c.values
        .slice(row, row + rows)
        .map((r) => r.slice(column, column + columns).map(excelCellValue));
      if (jsonBytes(cells) > 512000 && rows * columns > 1) {
        if (rows > 1) {
          const half = Math.floor(rows / 2);
          await write(row, column, half, columns);
          await write(row + half, column, rows - half, columns);
        } else {
          const half = Math.floor(columns / 2);
          await write(row, column, rows, half);
          await write(row, column + half, rows, columns - half);
        }
        return;
      }
      const block = sheet.getRangeByIndexes(
        (c.target === 'selection' ? proposal.baseline.row : 0) + row,
        (c.target === 'selection' ? proposal.baseline.column : 0) + column,
        rows,
        columns,
      );
      block.valuesAsJson = cells;
      for (let r = row; r < row + rows; r++)
        for (const f of formulasByRow.get(r) || [])
          if (f.column >= column && f.column < column + columns)
            block.getCell(f.row - row, f.column - column).formulas = [[f.formula]];
      await context.sync();
      done += rows * columns;
      progress?.(`Applying ${done.toLocaleString()} of ${total.toLocaleString()} cells…`);
    };
    const width = Math.min(c.values[0]!.length, 256),
      height = Math.max(1, Math.floor(5000 / width));
    for (let row = 0; row < c.values.length; row += height)
      for (let col = 0; col < c.values[0]!.length; col += width)
        await write(
          row,
          col,
          Math.min(height, c.values.length - row),
          Math.min(width, c.values[0]!.length - col),
        );
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
