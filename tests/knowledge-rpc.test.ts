import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { appFixture, waitUntil } from './helpers.js';

test(
  'real SDK knowledge RPC searches full text, reads bounded pages and library sources, and isolates projects',
  { timeout: 30000 },
  async () => {
    const f = await appFixture('knowledge-rpc');
    const requests: any[] = [];
    let calls: { name: string; args: object }[] = [];
    let step = 0;
    const model = createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      requests.push(JSON.parse(raw));
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const chunk = (delta: object, finish: string | null = null) =>
        `data: ${JSON.stringify({ id: 'knowledge-rpc', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
      const call = calls[step++];
      if (call) {
        res.end(
          chunk({
            tool_calls: [
              {
                index: 0,
                id: `call-${step}`,
                type: 'function',
                function: { name: call.name, arguments: JSON.stringify(call.args) },
              },
            ],
          }) +
            chunk({}, 'tool_calls') +
            'data: [DONE]\n\n',
        );
      } else {
        res.end(chunk({ content: 'Knowledge checked.' }) + chunk({}, 'stop') + 'data: [DONE]\n\n');
      }
    });
    try {
      await f.signIn();
      await new Promise<void>((resolve) => model.listen(0, '127.0.0.1', resolve));
      f.store.saveSettings({
        ...f.store.settings(),
        modelId: 'local-test',
        baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
      });
      const project = f.store.createProject({
        name: 'References',
        instructions: '',
        toolsEnabled: false,
      });
      const other = f.store.createProject({ name: 'Other', instructions: '', toolsEnabled: false });
      const doc = await f.knowledge.add(
        project.id,
        'Source.md',
        Buffer.from(
          'Routine reference.\n' +
            'ordinary content '.repeat(400) +
            '\ndeepneedle: a body-only match.',
        ),
      );
      await f.wiki.record(project.id, doc.id);
      const secret = await f.knowledge.add(
        other.id,
        'Private.md',
        Buffer.from('deepneedle: OTHER_PROJECT_SECRET'),
      );
      const page = (await f.wiki.catalog(project.id))[0]!;
      const pack = f.library.get('california-hr', '1.1.0');
      f.library.install(pack);
      f.library.attach(project.id, pack.id, pack.version, null);
      const library = f.library.catalog(project.id)[0]!;
      calls = [
        { name: 'search_knowledge', args: { query: 'deepneedle' } },
        { name: 'read_knowledge', args: { id: doc.id, offset: 1000, length: 64 } },
        { name: 'read_knowledge', args: { id: library.id, length: 200 } },
        { name: 'read_knowledge', args: { id: secret.id } },
      ];
      for (const incognito of [false, true]) {
        step = 0;
        requests.length = 0;
        const chat = f.store.createConversation(project.id, incognito);
        if (incognito) f.incognito.touch(chat.id);
        const accepted = await f.auth(`/conversations/${chat.id}/messages`, 'POST', {
          requestId: randomUUID(),
          text: 'deepneedle',
        });
        assert.equal(accepted.statusCode, 202, accepted.body);
        await waitUntil(() => !f.runner.active.has(chat.id));
        const result = f.runner.snapshot(chat.id);
        assert.equal(result.status, 'completed', result.error);
        assert.equal(requests.length, 5);
        // A body-only search term should not preload the document as a reference excerpt.
        assert(!JSON.stringify(requests[0]).includes('a body-only match'));
        const search = JSON.parse(requests[1].messages.at(-1).content);
        assert.deepEqual(
          search.pages.map((p: any) => p.id),
          [doc.id],
        );
        assert(!('text' in search.pages[0]));
        const read = JSON.parse(requests[2].messages.at(-1).content);
        assert.equal(read.text, page.text.slice(1000, 1064));
        assert.equal(read.nextOffset, 1064);
        assert.equal(read.revision, doc.revision);
        const reference = JSON.parse(requests[3].messages.at(-1).content);
        assert.equal(reference.library.version, '1.1.0');
        assert.equal(reference.library.url, library.library!.url);
        assert.match(requests[4].messages.at(-1).content, /not found in this project/);
        assert(!JSON.stringify(requests).includes('OTHER_PROJECT_SECRET'));
        assert(result.messages.some((m) => m.knowledgeSourceId === doc.id));
        assert(result.messages.some((m) => m.knowledgeSourceId === library.id));
        if (incognito) f.incognito.end(chat.id);
      }
    } finally {
      await f.cleanup();
      model.closeAllConnections();
      await new Promise<void>((resolve) => model.close(() => resolve()));
    }
  },
);
