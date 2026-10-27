import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { EMAIL_FOOTER } from './email.js';

const parser = unified().use(remarkParse).use(remarkGfm);
type Node = {
  type: string;
  value?: string;
  children?: Node[];
  depth?: number;
  ordered?: boolean;
  start?: number;
  checked?: boolean | null;
  url?: string;
  alt?: string;
  identifier?: string;
  align?: (string | null)[];
};
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

// Only explicit web/email links can leave the preview or appear in an email.
// No raw HTML, remote images, model-provided CSS, or application-relative URLs.
function safeUrl(value = '') {
  if (/[\u0000-\u0020\u007f]/.test(value) || !/^(https?:\/\/|mailto:)/i.test(value)) return '';
  try {
    return new URL(value).href;
  } catch {
    return '';
  }
}

/** A closed set of escaped HTML elements, shared by SMTP and the review preview. */
export function renderEmailHtml(markdown: string, inlineStyles = true): string {
  const root = parser.parse(markdown) as Node;
  const definitions = new Map<string, string>();
  const collect = (node: Node) => {
    if (node.type === 'definition' && node.identifier && !definitions.has(node.identifier))
      definitions.set(node.identifier, node.url || '');
    node.children?.forEach(collect);
  };
  collect(root);
  const render = (node: Node): string => {
    const children = () => (node.children || []).map(render).join('');
    switch (node.type) {
      case 'root':
        return children();
      case 'text':
        return escape(node.value || '').replace(/\r?\n/g, '<br>');
      case 'html':
        return escape(node.value || '');
      case 'paragraph':
        return `<p style="margin:0 0 14px">${children()}</p>`;
      case 'heading': {
        const depth = Math.max(1, Math.min(6, node.depth || 2));
        return `<h${depth} style="margin:20px 0 10px;line-height:1.3;font-weight:700;font-size:${[28, 24, 20, 18, 16, 15][depth - 1]}px">${children()}</h${depth}>`;
      }
      case 'strong':
        return `<strong>${children()}</strong>`;
      case 'emphasis':
        return `<em>${children()}</em>`;
      case 'delete':
        return `<del>${children()}</del>`;
      case 'break':
        return '<br>';
      case 'thematicBreak':
        return '<hr style="border:0;border-top:1px solid #cbd5e1;margin:20px 0">';
      case 'inlineCode':
        return `<code style="font-family:monospace;background:#f1f5f9;color:#172033;padding:2px 4px">${escape(node.value || '')}</code>`;
      case 'code':
        return `<pre style="white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f5f9;color:#172033;padding:12px;border:1px solid #cbd5e1"><code>${escape(node.value || '')}</code></pre>`;
      case 'blockquote':
        return `<blockquote style="margin:14px 0;padding:0 14px;border-left:3px solid #94a3b8">${children()}</blockquote>`;
      case 'list': {
        const tag = node.ordered ? 'ol' : 'ul';
        const start =
          node.ordered && Number.isSafeInteger(node.start) ? ` start="${node.start}"` : '';
        return `<${tag}${start} style="margin:0 0 14px;padding-left:26px">${children()}</${tag}>`;
      }
      case 'listItem':
        return `<li>${node.checked == null ? '' : node.checked ? '[x] ' : '[ ] '}${children()}</li>`;
      case 'link':
      case 'linkReference': {
        const url = safeUrl(
          node.type === 'link' ? node.url : definitions.get(node.identifier || ''),
        );
        return url
          ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer" style="color:#2459a6;text-decoration:underline">${children()}</a>`
          : children();
      }
      case 'image':
      case 'imageReference':
        return escape(node.alt ? `[Image: ${node.alt}]` : '[Image omitted]');
      case 'definition':
        return '';
      case 'table': {
        const rows = (node.children || []).map((row, rowIndex) => {
          const tag = rowIndex === 0 ? 'th' : 'td';
          return (
            '<tr>' +
            (row.children || [])
              .map((cell, i) => {
                const align = ['left', 'center', 'right'].includes(node.align?.[i] || '')
                  ? node.align![i]
                  : 'left';
                return `<${tag}${rowIndex === 0 ? ' scope="col"' : ''} align="${align}" style="border:1px solid #cbd5e1;padding:8px 12px;text-align:${align};vertical-align:top;${rowIndex === 0 ? 'background:#f1f5f9;color:#172033;' : ''}">${render(cell)}</${tag}>`;
              })
              .join('') +
            '</tr>'
          );
        });
        return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:14px 0"><thead>${rows[0] || ''}</thead><tbody>${rows.slice(1).join('')}</tbody></table>`;
      }
      default:
        return node.value !== undefined ? escape(node.value) : children();
    }
  };
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#172033;background:#ffffff;padding:16px;overflow-wrap:anywhere">${render(root)}<p class="email-footer" style="margin:20px 0 0;padding-top:12px;border-top:1px solid #cbd5e1;color:#596579;font-size:12px">${escape(EMAIL_FOOTER)}</p></div>`;
  // The app uses an external stylesheet under its strict content security policy.
  return inlineStyles ? html : html.replace(/ style="[^"]*"/g, '');
}
