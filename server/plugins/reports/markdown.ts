import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
const parser = unified().use(remarkParse).use(remarkGfm);
const escape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
type Node = {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean;
  start?: number;
  children?: Node[];
  position?: { start: { line: number; offset?: number }; end: { line: number; offset?: number } };
};
const plain = (node: Node): string => node.value ?? (node.children || []).map(plain).join('');
const inline = (node: Node): string => {
  const content =
    node.value !== undefined ? escape(node.value) : (node.children || []).map(inline).join('');
  if (node.type === 'strong') return `<b>${content}</b>`;
  if (node.type === 'emphasis') return `<i>${content}</i>`;
  if (node.type === 'inlineCode') return `<font name="Courier">${content}</font>`;
  if (node.type === 'break') return '<br/>';
  return content;
};
// GFM permits a plain paragraph immediately after a table to become a short
// table row. For reports, stop at that prose boundary instead of rejecting it.
// Find boundaries in the syntax tree so pipes inside fenced code are untouched.
function reportSource(text: string) {
  const lines = text.split(/\r?\n/),
    boundaries = new Set<number>();
  const hasPipe = (line: string) => {
    let slashes = 0;
    for (const char of line) {
      if (char === '|' && slashes % 2 === 0) return true;
      slashes = char === '\\' ? slashes + 1 : 0;
    }
    return false;
  };
  const visit = (node: Node) => {
    // A pipe-free row is valid in a one-column table, so retain GFM behavior there.
    if (node.type === 'table' && (node.children?.[0]?.children?.length || 0) > 1) {
      const row = (node.children || []).slice(1).find((r) => {
        const start = r.position?.start.offset,
          end = r.position?.end.offset;
        return start !== undefined && end !== undefined && !hasPipe(text.slice(start, end));
      });
      if (row?.position) boundaries.add(row.position.start.line);
    }
    for (const child of node.children || []) visit(child);
  };
  visit(parser.parse(text) as Node);
  const normalized: string[] = [],
    originalLines: number[] = [];
  lines.forEach((line, index) => {
    if (boundaries.has(index + 1)) {
      normalized.push('');
      originalLines.push(index + 1);
    }
    normalized.push(line);
    originalLines.push(index + 1);
  });
  return { text: normalized.join('\n'), originalLines, lines };
}
export function reportMarkdown(text: string, blockIndex = 1): object[] {
  const source = reportSource(text);
  const blocks: object[] = [];
  let tableIndex = 0;
  const walk = (node: Node, prefix = '') => {
    if (node.type === 'heading')
      blocks.push({ type: 'heading', level: node.depth, text: inline(node) });
    else if (node.type === 'paragraph')
      blocks.push({ type: 'paragraph', text: escape(prefix) + inline(node) });
    else if (node.type === 'code') blocks.push({ type: 'code', text: node.value || '' });
    else if (node.type === 'blockquote')
      blocks.push({ type: 'callout', text: (node.children || []).map(inline).join('<br/>') });
    else if (node.type === 'table') {
      tableIndex++;
      const rows = (node.children || []).map((row) => (row.children || []).map(plain));
      const columns = rows.shift() || [];
      const location = `Markdown block ${blockIndex}, table ${tableIndex}`;
      if (!columns.length || columns.length > 20)
        throw new Error(`${location}: header has ${columns.length} columns; expected 1–20.`);
      if (!rows.length)
        throw new Error(`${location}: add at least one data row below the separator.`);
      rows.forEach((row, index) => {
        if (row.length === columns.length) return;
        const position = node.children?.[index + 1]?.position;
        const line = position ? source.originalLines[position.start.line - 1] : undefined;
        const excerpt = line ? source.lines[line - 1]!.trim().slice(0, 80) : '';
        throw new Error(
          `${location}, data row ${index + 1}${line ? ` (line ${line})` : ''}: expected ${columns.length} cells, received ${row.length}. Row: ${JSON.stringify(excerpt)}. Keep one cell per column; escape literal pipes as \\|, including inside inline code.`,
        );
      });
      blocks.push({ type: 'table', columns, rows });
    } else if (node.type === 'list') {
      (node.children || []).forEach((item, i) =>
        (item.children || []).forEach((child, j) =>
          walk(child, j ? '' : node.ordered ? `${(node.start || 1) + i}. ` : '- '),
        ),
      );
    } else if (node.type === 'thematicBreak') blocks.push({ type: 'rule' });
    else if (node.type === 'html')
      blocks.push({ type: 'paragraph', text: escape(node.value || '') });
    else for (const child of node.children || []) walk(child);
  };
  walk(parser.parse(source.text) as Node);
  return blocks;
}
