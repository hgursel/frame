import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appFixture, waitUntil } from './helpers.js';
import { imagesSchema, imageId } from '../server/images.js';
import { readHistory } from '../server/history.js';
const image = {
  mimeType: 'image/png' as const,
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=',
};

test('image validation rejects unsupported, oversized and malformed inputs', () => {
  assert.equal(imagesSchema.parse([image]).length, 1);
  for (const invalid of [
    { ...image, mimeType: 'image/svg+xml' },
    { ...image, data: 'YQ==' },
    { ...image, mimeType: 'image/jpeg', data: 'YQ==' },
    { ...image, data: image.data + ' ' },
  ])
    assert.equal(imagesSchema.safeParse([invalid]).success, false);
  assert.equal(imagesSchema.safeParse(Array(5).fill(image)).success, false);
  const oversized = Buffer.from(image.data, 'base64');
  oversized.writeUInt32BE(99999, 16);
  assert.equal(
    imagesSchema.safeParse([{ ...image, data: oversized.toString('base64') }]).success,
    false,
  );
});

test('SDK sends native images to the local endpoint, preserves follow-ups and scopes private previews', async () => {
  const requests: any[] = [];
  const mock = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    requests.push(JSON.parse(raw));
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: object, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'vision', object: 'chat.completion.chunk', model: 'local-vision', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    res.end(
      chunk({ role: 'assistant', content: 'Image received.' }) +
        chunk({}, 'stop') +
        'data: [DONE]\n\n',
    );
  });
  await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve));
  const f = await appFixture('images');
  try {
    await f.signIn();
    f.store.saveSettings({
      ...f.store.settings(),
      modelId: 'local-vision',
      baseUrl: `http://127.0.0.1:${(mock.address() as any).port}/v1`,
    });
    const project = f.store.createProject({
      name: 'Vision',
      instructions: '',
      toolsEnabled: false,
    });
    const chat = f.store.createConversation(project.id);
    const send = async (id: string, text: string, images?: (typeof image)[]) => {
      const requestId = randomUUID();
      const result = await f.auth(`/conversations/${id}/messages`, 'POST', {
        requestId,
        text,
        images,
      });
      assert.equal(result.statusCode, 202, result.body);
      await waitUntil(() => !f.runner.snapshot(id).running);
      assert.equal(f.runner.snapshot(id).error, undefined);
      return requestId;
    };
    const id = await send(chat.id, '', [image]);
    const url = `/conversations/${chat.id}/images/${imageId(image)}`;
    assert.equal((await f.call(url)).statusCode, 401);
    const preview = await f.auth(url);
    assert.equal(preview.headers['content-type'], 'image/png');
    assert.equal(preview.headers['cache-control'], 'no-store');
    assert.deepEqual(preview.rawPayload, Buffer.from(image.data, 'base64'));
    const history = readHistory(f.store.sessionFile(chat.id));
    assert.deepEqual(history[0]?.images, [{ id: imageId(image) }]);
    assert(
      !JSON.stringify(history).includes(image.data),
      'SSE history carries references, not image bytes',
    );
    const other = f.store.createConversation(project.id);
    assert.equal(
      (await f.auth(`/conversations/${other.id}/images/${imageId(image)}`)).statusCode,
      404,
    );
    const duplicate = await f.auth(`/conversations/${chat.id}/messages`, 'POST', {
      requestId: id,
      text: '',
      images: [image],
    });
    assert.equal(duplicate.json().duplicate, true);
    await send(chat.id, 'What about that same image?');
    assert.equal(requests.length, 2);
    for (const request of requests)
      assert(
        request.messages.some(
          (m: any) =>
            m.role === 'user' &&
            Array.isArray(m.content) &&
            m.content.some(
              (p: any) =>
                p.type === 'image_url' && p.image_url.url === `data:image/png;base64,${image.data}`,
            ),
        ),
      );
    const temporary = (
      await f.auth('/conversations', 'POST', { projectId: project.id, incognito: true })
    ).json();
    await send(temporary.id, 'Temporary screenshot', [image]);
    assert(!existsSync(f.store.sessionFile(temporary.id)));
    assert.equal(
      (await f.auth(`/conversations/${temporary.id}/images/${imageId(image)}`)).statusCode,
      200,
    );
    await f.auth(`/conversations/${temporary.id}/end`, 'POST', {});
    await waitUntil(() => !f.store.conversation(temporary.id));
    assert.equal(
      (await f.auth(`/conversations/${temporary.id}/images/${imageId(image)}`)).statusCode,
      404,
    );
    assert.equal(
      (
        await f.auth(`/conversations/${chat.id}/messages`, 'POST', {
          requestId: randomUUID(),
          text: '',
          images: [],
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await f.auth(`/conversations/${chat.id}/messages`, 'POST', {
          requestId: randomUUID(),
          text: 'Bad',
          images: [{ ...image, data: 'YQ==' }],
        })
      ).statusCode,
      400,
    );
  } finally {
    await f.cleanup();
    mock.closeAllConnections();
    await new Promise<void>((resolve) => mock.close(() => resolve()));
  }
});
