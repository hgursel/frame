import { createServer, type Socket } from 'node:net';
/** Local SMTP capture server. Never relays messages outside the test process. */
export async function smtpFixture() {
  const sockets = new Set<Socket>();
  const messages: string[] = [];
  let connections = 0;
  const state = { reject: '', dropAfterData: false, hold: false, release: () => {} };
  const server = createServer((socket) => {
    sockets.add(socket);
    connections++;
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.setEncoding('utf8');
    socket.write('220 frame-test ESMTP\r\n');
    let buffer = '';
    let data = false;
    let message = '';
    socket.on('data', (chunk) => {
      buffer += chunk;
      while (buffer.includes('\r\n')) {
        const index = buffer.indexOf('\r\n');
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (data) {
          if (line !== '.') {
            message += line + '\r\n';
            continue;
          }
          data = false;
          messages.push(message);
          message = '';
          const complete = () => {
            if (state.dropAfterData) socket.destroy();
            else socket.write('250 2.0.0 accepted\r\n');
          };
          if (state.hold) state.release = complete;
          else complete();
          continue;
        }
        if (/^(EHLO|HELO)/i.test(line)) socket.write('250-frame-test\r\n250 SIZE 30000000\r\n');
        else if (/^MAIL FROM:/i.test(line)) socket.write('250 sender ok\r\n');
        else if (/^RCPT TO:/i.test(line))
          socket.write(
            state.reject && line.includes(state.reject)
              ? '550 recipient rejected\r\n'
              : '250 recipient ok\r\n',
          );
        else if (line === 'DATA') {
          data = true;
          socket.write('354 End with dot\r\n');
        } else if (line === 'QUIT') {
          socket.end('221 goodbye\r\n');
        } else if (line === 'RSET' || line === 'NOOP') socket.write('250 ok\r\n');
        else socket.write('502 command unsupported\r\n');
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    state,
    messages,
    get connections() {
      return connections;
    },
    port: (server.address() as any).port,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
