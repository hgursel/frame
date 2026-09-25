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
export function reportMarkdown(text: string): object[] {
  const blocks: object[] = [];
  const walk = (node: Node, prefix = '') => {
    if (node.type === 'heading')
      blocks.push({ type: 'heading', level: node.depth, text: inline(node) });
    else if (node.type === 'paragraph')
      blocks.push({ type: 'paragraph', text: escape(prefix) + inline(node) });
    else if (node.type === 'code') blocks.push({ type: 'code', text: node.value || '' });
    else if (node.type === 'blockquote')
      blocks.push({ type: 'callout', text: (node.children || []).map(inline).join('<br/>') });
    else if (node.type === 'table') {
      const rows = (node.children || []).map((row) => (row.children || []).map(plain));
      const columns = rows.shift() || [];
      if (!columns.length || columns.length > 20 || rows.some((r) => r.length !== columns.length))
        throw new Error('Report tables must have consistent rows and at most 20 columns.');
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
  walk(parser.parse(text) as Node);
  return blocks;
}
