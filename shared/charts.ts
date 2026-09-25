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
  source?: {
    kind: 'sql' | 'document' | 'message' | 'file';
    name: string;
    id?: string;
    table?: number;
  };
  database: string;
  sourceAt: string;
  createdAt: string;
  truncated: boolean;
  notices: string[];
}
