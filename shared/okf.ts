export interface OkfPreview {
  fingerprint: string;
  pages: { path: string; name: string; action: 'add' | 'update' | 'skip' }[];
  counts: { add: number; update: number; skip: number };
}
