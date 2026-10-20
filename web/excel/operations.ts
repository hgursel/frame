import { snapshot } from './workbook.js';
import {
  excelCellValue,
  jsonBytes,
  MAX_SELECTION_BYTES,
  sameSelection,
  type ExcelLimits,
} from '../../shared/excel.js';
import {
  rangeBounds,
  isStructural,
  checkPlanLimits,
  workbookPlanSchema,
  workbookReadSchema,
  type WorkbookAction,
  type WorkbookCheck,
  type WorkbookPlan,
  type WorkbookProposal,
  type WorkbookRequest,
} from '../../shared/excel-workbook.js';

const rangeFor = (sheet: Excel.Worksheet, address: string) => {
  const b = rangeBounds(address);
  return sheet.getRangeByIndexes(b.row, b.column, b.rows, b.columns);
};
async function filterTarget(
  context: Excel.RequestContext,
  sheet: Excel.Worksheet,
  range: Excel.Range,
  address: string,
) {
  const tables = range.getTables(false);
  tables.load('items/name');
  await context.sync();
  if (!tables.items.length) return { filter: sheet.autoFilter, range, offset: 0 };
  if (tables.items.length !== 1) throw new Error('Filter one table at a time.');
  const table = tables.items[0]!,
    tableRange = table.getRange();
  tableRange.load('columnIndex,rowIndex,rowCount,columnCount');
  await context.sync();
  const b = rangeBounds(address);
  if (
    b.column < tableRange.columnIndex ||
    b.column + b.columns > tableRange.columnIndex + tableRange.columnCount ||
    b.row < tableRange.rowIndex ||
    b.row + b.rows > tableRange.rowIndex + tableRange.rowCount
  )
    throw new Error('Filter destination must be inside one table or outside all tables.');
  return { filter: table.autoFilter, range: tableRange, offset: b.column - tableRange.columnIndex };
}
async function sheetInfo(context: Excel.RequestContext, sheet: Excel.Worksheet) {
  sheet.load('id,name');
  const used = sheet.getUsedRangeOrNullObject(true);
  used.load('address,rowIndex,columnIndex,rowCount,columnCount');
  sheet.tables.load('items/id,items/name,items/style,items/showTotals');
  sheet.charts.load('items/id,items/name,items/chartType');
  await context.sync();
  const tables = sheet.tables.items.map((t) => ({ table: t, range: t.getRange() }));
  for (const t of tables) t.range.load('address');
  for (const chart of sheet.charts.items) chart.title.load('text');
  await context.sync();
  return {
    sheetId: sheet.id,
    sheetName: sheet.name,
    usedRange: used.isNullObject ? null : used.address,
    tables: tables.map((t) => ({
      id: t.table.id,
      name: t.table.name,
      range: t.range.address,
      style: t.table.style,
      showTotals: t.table.showTotals,
    })),
    charts: sheet.charts.items.map((c) => ({
      id: c.id,
      name: c.name,
      chartType: c.chartType,
      title: c.title.text,
    })),
  };
}
async function inspectAction(
  context: Excel.RequestContext,
  a: WorkbookAction,
  limits: ExcelLimits,
): Promise<WorkbookCheck> {
  const sheet = context.workbook.worksheets.getItem(a.sheet);
  const info = await sheetInfo(context, sheet);
  let range = rangeFor(sheet, a.range),
    usedRange: string | undefined;
  if (isStructural(a)) {
    const used = sheet.getUsedRangeOrNullObject(true);
    used.load('address');
    await context.sync();
    if (!used.isNullObject) {
      range = used;
      usedRange = used.address;
    } else usedRange = '';
  }
  // Table updates inspect both the old and new footprints, including cells excluded by a resize.
  if (a.kind === 'table' && a.mode === 'update') {
    const old = sheet.tables.getItem(a.name).getRange();
    old.load('rowIndex,columnIndex,rowCount,columnCount');
    await context.sync();
    const b = rangeBounds(a.range),
      row = Math.min(old.rowIndex, b.row),
      col = Math.min(old.columnIndex, b.column);
    range = sheet.getRangeByIndexes(
      row,
      col,
      Math.max(old.rowIndex + old.rowCount, b.row + b.rows) - row,
      Math.max(old.columnIndex + old.columnCount, b.column + b.columns) - col,
    );
  }
  const selection = await snapshot(context, range, limits);
  if (a.kind === 'filter' || a.kind === 'clear_filter')
    await filterTarget(context, sheet, range, a.range);
  sheet.protection.load('protected');
  context.workbook.protection.load('protected');
  if (a.kind === 'write' || a.kind === 'sort') range.load('hasSpill');
  const merged =
    a.kind === 'write' || a.kind === 'sort' ? range.getMergedAreasOrNullObject() : undefined;
  await context.sync();
  if (sheet.protection.protected || context.workbook.protection.protected)
    throw new Error(
      'This worksheet or workbook is protected. Unlock the destination in Excel to edit it.',
    );
  if (merged && (!merged.isNullObject || range.hasSpill !== false))
    throw new Error(
      'This destination includes merged or spilled cells. Target the editable source cells.',
    );
  if (a.kind === 'table') {
    if (
      a.mode === 'create' &&
      info.tables.some((t) => t.name.toLowerCase() === a.name.toLowerCase())
    )
      throw new Error('That table already exists; use update.');
    if (a.mode === 'update' && !info.tables.some((t) => t.name === a.name))
      throw new Error('Table not found on this worksheet.');
  }
  if (a.kind === 'chart') {
    if (a.mode === 'create' && info.charts.some((c) => c.name === a.name))
      throw new Error('That chart already exists; use update.');
    if (a.mode === 'update' && !info.charts.some((c) => c.name === a.name))
      throw new Error('Chart not found on this worksheet.');
  }
  return { selection, metadata: JSON.stringify(info), usedRange };
}
export async function handleWorkbookRequest(request: WorkbookRequest) {
  return Excel.run(async (context) => {
    if (request.task.kind === 'read') {
      const q = workbookReadSchema.parse(request.task.query);
      if (q.kind === 'list_sheets') {
        const sheets = context.workbook.worksheets;
        sheets.load('items/id,items/name');
        await context.sync();
        return {
          sheets: sheets.items
            .slice(q.offset, q.offset + 100)
            .map((s) => ({ id: s.id, name: s.name })),
          total: sheets.items.length,
          nextOffset: q.offset + 100 < sheets.items.length ? q.offset + 100 : null,
        };
      }
      const sheet = context.workbook.worksheets.getItem(q.sheet);
      if (q.kind === 'sheet_info') return sheetInfo(context, sheet);
      const b = rangeBounds(q.range);
      if (b.rows * b.columns > 10000)
        throw new Error('Read at most 10,000 cells per request; split the rectangle.');
      return snapshot(context, rangeFor(sheet, q.range), request.limits);
    }
    const plan = workbookPlanSchema.parse(request.task.plan);
    checkPlanLimits(plan, request.limits);
    const checks: WorkbookCheck[] = [];
    for (const a of plan.actions) {
      checks.push(await inspectAction(context, a, request.limits));
      if (jsonBytes(checks) > MAX_SELECTION_BYTES)
        throw new Error('Preview snapshots exceed the transfer ceiling. Split this batch.');
    }
    return checks;
  });
}
export async function checkWorkbookProposal(context: Excel.RequestContext, p: WorkbookProposal) {
  if (p.checks.length !== p.plan.actions.length) throw new Error('Incomplete worksheet preview.');
  for (let i = 0; i < p.plan.actions.length; i++) {
    const original = p.checks[i]!;
    const a = { ...p.plan.actions[i]!, sheet: original.selection.sheetId };
    const current = await inspectAction(context, a, { maxCells: 500000, maxColumns: 4096 });
    if (
      !sameSelection(original.selection, current.selection) ||
      original.metadata !== current.metadata ||
      original.usedRange !== current.usedRange
    )
      throw new Error(
        'The destination cells or worksheet structure changed since preview. Reject this batch and ask again.',
      );
  }
}
async function write(
  context: Excel.RequestContext,
  sheet: Excel.Worksheet,
  a: Extract<WorkbookAction, { kind: 'write' }>,
  progress?: (s: string) => void,
) {
  const b = rangeBounds(a.range),
    byRow = new Map<number, typeof a.formulas>();
  for (const f of a.formulas) {
    const row = byRow.get(f.row) || [];
    row.push(f);
    byRow.set(f.row, row);
  }
  let done = 0;
  const block = async (row: number, col: number, rows: number, cols: number): Promise<void> => {
    const values = a.values
      ?.slice(row, row + rows)
      .map((r) => r.slice(col, col + cols).map(excelCellValue));
    if (values && jsonBytes(values) > 512000 && rows * cols > 1) {
      if (rows > 1) {
        const half = Math.floor(rows / 2);
        await block(row, col, half, cols);
        await block(row + half, col, rows - half, cols);
      } else {
        const half = Math.floor(cols / 2);
        await block(row, col, rows, half);
        await block(row, col + half, rows, cols - half);
      }
      return;
    }
    const range = sheet.getRangeByIndexes(b.row + row, b.column + col, rows, cols);
    if (values) range.valuesAsJson = values;
    for (let r = row; r < row + rows; r++)
      for (const f of byRow.get(r) || [])
        if (f.column >= col && f.column < col + cols)
          range.getCell(r - row, f.column - col).formulas = [[f.formula]];
    await context.sync();
    done += rows * cols;
    progress?.(
      `Updating ${a.sheet}!${a.range}: ${done.toLocaleString()} of ${(b.rows * b.columns).toLocaleString()} cells…`,
    );
  };
  const width = Math.min(b.columns, 256),
    height = Math.max(1, Math.floor(5000 / width));
  for (let r = 0; r < b.rows; r += height)
    for (let c = 0; c < b.columns; c += width)
      await block(r, c, Math.min(height, b.rows - r), Math.min(width, b.columns - c));
}
export async function applyWorkbookProposal(p: WorkbookProposal, progress?: (s: string) => void) {
  return Excel.run(async (context) => {
    await checkWorkbookProposal(context, p);
    for (let i = 0; i < p.plan.actions.length; i++) {
      const a = p.plan.actions[i]!,
        sheet = context.workbook.worksheets.getItem(p.checks[i]!.selection.sheetId),
        range = rangeFor(sheet, a.range);
      progress?.(
        `Applying operation ${i + 1} of ${p.plan.actions.length}: ${a.kind.replaceAll('_', ' ')}…`,
      );
      switch (a.kind) {
        case 'write':
          await write(context, sheet, a, progress);
          break;
        case 'format': {
          const f = a.format,
            b = rangeBounds(a.range);
          if (f.numberFormat !== undefined) {
            const width = Math.min(b.columns, 256);
            const cellsPerBlock = Math.min(
              5000,
              Math.max(1, Math.floor(500000 / (jsonBytes(f.numberFormat) + 2))),
            );
            const height = Math.max(1, Math.floor(cellsPerBlock / width));
            let formatted = 0;
            for (let row = 0; row < b.rows; row += height)
              for (let column = 0; column < b.columns; column += width) {
                const rows = Math.min(height, b.rows - row),
                  columns = Math.min(width, b.columns - column);
                sheet.getRangeByIndexes(
                  b.row + row,
                  b.column + column,
                  rows,
                  columns,
                ).numberFormat = Array.from({ length: rows }, () =>
                  Array(columns).fill(f.numberFormat),
                );
                await context.sync();
                formatted += rows * columns;
                progress?.(
                  `Formatting ${a.sheet}!${a.range}: ${formatted.toLocaleString()} of ${(b.rows * b.columns).toLocaleString()} cells…`,
                );
              }
          }
          if (f.bold !== undefined) range.format.font.bold = f.bold;
          if (f.italic !== undefined) range.format.font.italic = f.italic;
          if (f.fontSize !== undefined) range.format.font.size = f.fontSize;
          if (f.fontColor !== undefined) range.format.font.color = f.fontColor;
          if (f.fillColor !== undefined) range.format.fill.color = f.fillColor;
          if (f.wrapText !== undefined) range.format.wrapText = f.wrapText;
          if (f.horizontalAlignment !== undefined)
            range.format.horizontalAlignment = f.horizontalAlignment;
          if (f.columnWidth !== undefined) range.format.columnWidth = f.columnWidth;
          if (f.rowHeight !== undefined) range.format.rowHeight = f.rowHeight;
          if (f.autofitColumns) range.format.autofitColumns();
          if (f.autofitRows) range.format.autofitRows();
          break;
        }
        case 'table': {
          const table =
            a.mode === 'create' ? sheet.tables.add(range, true) : sheet.tables.getItem(a.name);
          if (a.mode === 'create') table.name = a.name;
          else table.resize(range);
          if (a.style) table.style = a.style;
          if (a.showTotals !== undefined) table.showTotals = a.showTotals;
          break;
        }
        case 'chart': {
          const types = {
            column: Excel.ChartType.columnClustered,
            bar: Excel.ChartType.barClustered,
            line: Excel.ChartType.line,
            pie: Excel.ChartType.pie,
          };
          const chart =
            a.mode === 'create'
              ? sheet.charts.add(types[a.chartType], range, Excel.ChartSeriesBy.columns)
              : sheet.charts.getItem(a.name);
          if (a.mode === 'create') chart.name = a.name;
          else {
            chart.chartType = types[a.chartType];
            chart.setData(range, Excel.ChartSeriesBy.columns);
          }
          if (a.title !== undefined) chart.title.text = a.title;
          if (a.position) {
            const b = rangeBounds(a.position);
            chart.setPosition(
              sheet.getCell(b.row, b.column),
              b.rows * b.columns === 1
                ? undefined
                : sheet.getCell(b.row + b.rows - 1, b.column + b.columns - 1),
            );
          }
          break;
        }
        case 'sort':
          range.sort.apply(
            a.fields.map((f) => ({ key: f.column, ascending: f.ascending })),
            false,
            a.hasHeaders,
            Excel.SortOrientation.rows,
          );
          break;
        case 'filter':
        case 'clear_filter': {
          const target = await filterTarget(context, sheet, range, a.range);
          if (a.kind === 'clear_filter') target.filter.clearCriteria();
          else
            target.filter.apply(target.range, a.column + target.offset, {
              filterOn: Excel.FilterOn.values,
              values: a.values,
            });
          break;
        }
        case 'insert_rows':
          range.getEntireRow().insert(Excel.InsertShiftDirection.down);
          break;
        case 'delete_rows':
          range.getEntireRow().delete(Excel.DeleteShiftDirection.up);
          break;
        case 'insert_columns':
          range.getEntireColumn().insert(Excel.InsertShiftDirection.right);
          break;
        case 'delete_columns':
          range.getEntireColumn().delete(Excel.DeleteShiftDirection.left);
          break;
      }
      await context.sync();
    }
    return `Applied ${p.plan.actions.length} operation${p.plan.actions.length === 1 ? '' : 's'} on existing worksheets.`;
  });
}
