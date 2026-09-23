export type ChartKind = 'bar' | 'line' | 'pie' | 'scatter';
export interface ChartRef {
  id: string;
  title: string;
  kind: ChartKind;
}
export interface ChartData extends ChartRef {
  donut: boolean;
  x: string;
  y: string[];
  rows: (string | number | null)[][];
  database: string;
  sourceAt: string;
  createdAt: string;
  truncated: boolean;
  notices: string[];
}
