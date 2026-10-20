// Serializable, deterministic Office test host. This does not establish real Excel acceptance.
export function installExcelMock() {
  const w = globalThis as any;
  const fake: any = {
    writes: [],
    protected: false,
    merged: false,
    spill: false,
    table: false,
    failWrite: false,
    writesUntilFailure: null,
    sheets: [],
    selection: null,
  };
  const letters = (n: number): string => {
    let s = '';
    for (n++; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  };
  const events = () => ({
    add(fn: any) {
      fake.selectionHandlers.push(fn);
      return {
        context: { workbook, sync: async () => {} },
        remove() {
          fake.selectionHandlers = fake.selectionHandlers.filter((f: any) => f !== fn);
        },
      };
    },
  });
  fake.selectionHandlers = [];
  const sheet = (id: string, name: string, values: any[][]) => {
    const s: any = {
      id,
      name,
      values,
      formulas: structuredClone(values),
      formats: values.map((r) => r.map(() => 'General')),
      load() {},
      protection: {
        load() {},
        get protected() {
          return fake.protected;
        },
      },
      activate() {
        fake.active = id;
      },
    };
    const filter = () => ({
      apply(range: any, column: number, criteria: any) {
        fake.writes.push({ filter: { sheet: id, column, criteria, range: range.address } });
      },
      clearCriteria() {
        fake.writes.push({ clearFilter: id });
      },
    });
    s.autoFilter = filter();
    s.tables = {
      items: [],
      load() {},
      getItem(name: string) {
        const t = this.items.find((t: any) => t.name === name);
        if (!t) throw new Error('Missing table');
        return t;
      },
      add(r: any) {
        fake.writes.push('table');
        let area = r;
        const t: any = {
          id: `table-${this.items.length + 1}`,
          name: `Table${this.items.length + 1}`,
          style: 'TableStyleMedium2',
          showTotals: false,
          autoFilter: filter(),
          getRange: () => area,
          resize(next: any) {
            fake.writes.push({ resize: next.address });
            area = next;
          },
        };
        this.items.push(t);
        return t;
      },
    };
    s.charts = {
      items: [],
      load() {},
      getItem(name: string) {
        const c = this.items.find((c: any) => c.name === name);
        if (!c) throw new Error('Missing chart');
        return c;
      },
      add(type: string, r: any) {
        fake.writes.push('chart');
        const c: any = {
          id: `chart-${this.items.length + 1}`,
          name: `Chart${this.items.length + 1}`,
          chartType: type,
          source: r.address,
          title: { text: '', load() {} },
          setData(range: any) {
            this.source = range.address;
            fake.writes.push({ chartData: range.address });
          },
          setPosition() {},
        };
        this.items.push(c);
        return c;
      },
    };
    const range = (row: number, col: number, rows: number, cols: number): any => {
      const read = (data: any[][], fallback: any) =>
        Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => data[row + r]?.[col + c] ?? fallback),
        );
      const place = (data: any[][], v: any[][]) => {
        for (let r = 0; r < rows; r++) {
          data[row + r] ||= [];
          for (let c = 0; c < cols; c++) data[row + r][col + c] = v[r]![c];
        }
      };
      const format: any = {
        font: {},
        fill: {},
        autofitColumns() {
          fake.writes.push({ autofitColumns: id });
        },
        autofitRows() {
          fake.writes.push({ autofitRows: id });
        },
      };
      const r: any = {
        worksheet: s,
        rowIndex: row,
        columnIndex: col,
        rowCount: rows,
        columnCount: cols,
        address: `${name}!${letters(col)}${row + 1}:${letters(col + cols - 1)}${row + rows}`,
        load() {},
        isNullObject: false,
        get values() {
          return read(s.values, '');
        },
        get formulas() {
          return read(s.formulas, '');
        },
        get numberFormat() {
          return read(s.formats, 'General');
        },
        set numberFormat(v: any[][]) {
          place(s.formats, v);
          fake.writes.push({ numberFormat: v, range: this.address });
        },
        get hasSpill() {
          return fake.spill;
        },
        getMergedAreasOrNullObject() {
          return { isNullObject: !fake.merged };
        },
        getTables() {
          return {
            load() {},
            items: s.tables.items.filter((t: any) => {
              const b = t.getRange();
              return (
                row < b.rowIndex + b.rowCount &&
                row + rows > b.rowIndex &&
                col < b.columnIndex + b.columnCount &&
                col + cols > b.columnIndex
              );
            }),
          };
        },
        set valuesAsJson(v: any[][]) {
          fake.writes.push({ id, values: v });
          if (
            fake.failWrite ||
            (fake.writesUntilFailure !== null && fake.writesUntilFailure-- === 0)
          )
            throw new Error('Simulated write interruption');
          const plain = v.map((line) => line.map((c) => c.basicValue ?? ''));
          place(s.values, plain);
          place(s.formulas, plain);
        },
        getCell(r: number, c: number) {
          const cell = range(row + r, col + c, 1, 1);
          Object.defineProperty(cell, 'formulas', {
            get() {
              return [[s.formulas[row + r]?.[col + c] ?? '']];
            },
            set(v: any[][]) {
              s.formulas[row + r] ||= [];
              s.formulas[row + r][col + c] = v[0][0];
              fake.writes.push({ formula: v[0][0] });
            },
          });
          return cell;
        },
        format: new Proxy(format, {
          set(obj, key, value) {
            obj[key] = value;
            fake.writes.push({ format: key, value });
            return true;
          },
        }),
        sort: {
          apply(fields: any[], _match: any, headers: boolean) {
            fake.writes.push({ sort: fields, range: r.address });
            const start = row + (headers ? 1 : 0),
              indices = Array.from({ length: rows - (headers ? 1 : 0) }, (_, i) => start + i);
            indices.sort((a, b) => {
              for (const f of fields) {
                const av = s.values[a]?.[col + f.key],
                  bv = s.values[b]?.[col + f.key];
                if (av !== bv) return (av > bv ? 1 : -1) * (f.ascending ? 1 : -1);
              }
              return 0;
            });
            for (const data of [s.values, s.formulas, s.formats]) {
              const sorted = indices.map((i) =>
                Array.from({ length: cols }, (_, c) => data[i]?.[col + c] ?? ''),
              );
              for (let i = 0; i < sorted.length; i++) {
                data[start + i] ||= [];
                data[start + i].splice(col, cols, ...sorted[i]!);
              }
            }
          },
        },
        getEntireRow() {
          return {
            insert() {
              fake.writes.push({ insertRows: rows });
              for (const data of [s.values, s.formulas, s.formats])
                data.splice(row, 0, ...Array.from({ length: rows }, () => []));
            },
            delete() {
              fake.writes.push({ deleteRows: rows });
              for (const data of [s.values, s.formulas, s.formats]) data.splice(row, rows);
            },
          };
        },
        getEntireColumn() {
          return {
            insert() {
              fake.writes.push({ insertColumns: cols });
              for (const data of [s.values, s.formulas, s.formats])
                for (const line of data) line.splice(col, 0, ...Array(cols).fill(''));
            },
            delete() {
              fake.writes.push({ deleteColumns: cols });
              for (const data of [s.values, s.formulas, s.formats])
                for (const line of data) line.splice(col, cols);
            },
          };
        },
      };
      format.font = new Proxy(format.font, {
        set(obj, key, value) {
          obj[key] = value;
          fake.writes.push({ font: key, value });
          return true;
        },
      });
      format.fill = new Proxy(format.fill, {
        set(obj, key, value) {
          obj[key] = value;
          fake.writes.push({ fill: key, value });
          return true;
        },
      });
      return r;
    };
    s.getRangeByIndexes = range;
    s.getCell = (r: number, c: number) => range(r, c, 1, 1);
    s.getUsedRangeOrNullObject = () => {
      const rows = s.values.length,
        cols = Math.max(0, ...s.values.map((r: any[]) => r.length));
      return rows && cols ? range(0, 0, rows, cols) : { isNullObject: true, load() {} };
    };
    fake.sheets.push(s);
    return s;
  };
  fake.addSheet = (name: string, values: any[][]) =>
    sheet(`sheet-${fake.sheets.length + 1}`, name, values);
  fake.source = fake.addSheet('Input', [
    ['Value', 'Total'],
    [2, 4],
  ]);
  fake.source.formulas[1][1] = '=A2*2';
  const workbook: any = {
    protection: { load() {}, protected: false },
    getSelectedRange() {
      const s = fake.selection
        ? fake.sheets.find((s: any) => s.name === fake.selection.sheet)
        : fake.source;
      const b = fake.selection || {
        row: 0,
        column: 0,
        rows: s.values.length,
        columns: s.values[0].length,
      };
      return s.getRangeByIndexes(b.row, b.column, b.rows, b.columns);
    },
    onSelectionChanged: events(),
    worksheets: {
      onActivated: events(),
      load() {},
      get items() {
        return fake.sheets;
      },
      getItem(id: string) {
        const s = fake.sheets.find((s: any) => s.id === id || s.name === id);
        if (!s) throw new Error('Missing worksheet');
        return s;
      },
      getItemOrNullObject(name: string) {
        return {
          isNullObject: !fake.sheets.some((s: any) => s.name.toLowerCase() === name.toLowerCase()),
        };
      },
      add(name: string) {
        fake.writes.push('sheet');
        return fake.addSheet(name, []);
      },
    },
  };
  fake.select = async (selection: any) => {
    fake.selection = selection;
    for (const fn of fake.selectionHandlers) await fn();
  };
  w.fakeExcel = fake;
  w.Office = {
    onReady: async () => ({ host: 'Excel' }),
    HostType: { Excel: 'Excel' },
    context: { requirements: { isSetSupported: () => true } },
  };
  w.Excel = {
    run: async (...args: any[]) => args.at(-1)({ workbook, sync: async () => {} }),
    ChartType: { columnClustered: 'column', barClustered: 'bar', line: 'line', pie: 'pie' },
    ChartSeriesBy: { columns: 'columns' },
    SortOrientation: { rows: 'Rows' },
    FilterOn: { values: 'Values' },
    InsertShiftDirection: { down: 'Down', right: 'Right' },
    DeleteShiftDirection: { up: 'Up', left: 'Left' },
  };
  return fake;
}
