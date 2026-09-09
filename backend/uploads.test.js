const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAF' +
  'c3w1AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJ0UkG' +
  'AAAAAAgIYw3PNQAAAABJRU5ErkJggg==';

function waitForServer(port) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      fetch(`http://localhost:${port}/api/health`)
        .then((res) => res.ok ? resolve() : setTimeout(tick, 100))
        .catch(() => {
          if (Date.now() - started > 7000) return reject(new Error('Server did not start in time'));
          setTimeout(tick, 100);
        });
    };
    tick();
  });
}

const serverPath = path.join(__dirname, 'server.js');

test('upload endpoint should exist and reject unauthenticated requests with 401', async () => {
  const port = 4433;
  const env = { ...process.env, PORT: String(port) };
  const child = spawn(process.execPath, [serverPath], { cwd: path.join(__dirname, '..'), env });

  try {
    await waitForServer(port);

    const response = await fetch(`http://localhost:${port}/api/uploads/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mimeType: 'image/png', dataBase64: pngBase64 }),
    });

    assert.equal(response.status, 401, `Expected 401 but got ${response.status}`);
  } finally {
    child.kill('SIGTERM');
  }
});
