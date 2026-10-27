import test from 'node:test';
import assert from 'node:assert/strict';
import { renderEmailHtml } from '../shared/email-markdown.js';
import { EMAIL_FOOTER } from '../shared/email.js';

test('email Markdown renders tables, inline formatting, lists, links and code with inline styles', () => {
  const html = renderEmailHtml(
    '# Report\n\n**Revenue** and *cost*\n\n| Team | Total |\n| :--- | ---: |\n| Sales | $42 |\n\n3. Review\n4. Send\n\n- [x] Done\n\n> Note\n\n```sql\nselect a < b;\n```\n\n[Report][r]\n\n[r]: https://example.com/report?a=1&b=2',
  );
  assert.match(html, /<h1[^>]*>Report<\/h1>/);
  assert.match(html, /<strong>Revenue<\/strong> and <em>cost<\/em>/);
  assert.match(html, /<th scope="col"[^>]*text-align:right[^>]*>Total<\/th>/);
  assert.match(html, /<td[^>]*>\$42<\/td>/);
  assert.match(html, /<ol start="3"/);
  assert.match(html, /\[x\] /);
  assert.match(html, /<blockquote/);
  assert.match(html, /<code>select a &lt; b;<\/code>/);
  assert.match(html, /href="https:\/\/example.com\/report\?a=1&amp;b=2"/);
  assert(html.includes(EMAIL_FOOTER));
});

test('email rendering escapes HTML and excludes executable links, relative URLs and external images', () => {
  const html = renderEmailHtml(
    '<script>alert(1)</script>\n\n<img src="https://tracker.example/pixel" onerror="alert(1)">\n\n[bad](javascript:alert%281%29) [data](data:text/html,test) [relative](/api/logout) ![Chart](https://tracker.example/pixel)\n\n[good](https://example.com/\"test) [email](mailto:alice@example.com)',
  );
  assert(!/<(?:script|img|iframe|style|svg)\b/i.test(html));
  assert(!/href="(?:javascript:|data:|\/)/i.test(html));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /\[Image: Chart\]/);
  assert.match(html, /href="mailto:alice@example.com"/);
  assert(!html.includes('href="https://example.com/"test'));
});

test('existing plain-text emails preserve line breaks, special characters and Unicode', () => {
  const html = renderEmailHtml('Hello Hakan,\nRevenue: $50 & cost: $20\nThanks — Görüşürüz');
  assert.match(html, /Hello Hakan,<br>Revenue: \$50 &amp; cost: \$20<br>Thanks — Görüşürüz/);
});
