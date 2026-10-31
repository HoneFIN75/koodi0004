import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

async function startHost(t, environment = {}) {
  const home = await mkdtemp(join(tmpdir(), 'planner-api-'));
  const root = join(home, 'public_html', 'site');
  const data = join(home, 'planner-data');
  await mkdir(join(root, 'api'), { recursive: true });
  await mkdir(data, { mode: 0o700 });
  await copyFile(new URL('../server/planner.php', import.meta.url), join(root, 'api', 'planner.php'));
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const env = { ...process.env };
  delete env.PLANNER_DATA_FILE;
  delete env.PLANNER_WRITE_KEY;
  Object.assign(env, typeof environment === 'function' ? environment(home) : environment);
  const php = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let logs = '';
  t.after(async () => {
    if (php.exitCode === null && php.signalCode === null) {
      const exited = once(php, 'exit');
      php.kill();
      await exited;
    }
    await rm(home, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`PHP startup timed out: ${logs}`)), 5000);
    php.once('error', (error) => { clearTimeout(timeout); reject(error); });
    php.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`PHP exited with ${code}: ${logs}`)); });
    php.stderr.on('data', (chunk) => {
      logs += chunk;
      if (logs.includes('Development Server') && logs.includes('started')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  return { home, root, data, url: `http://127.0.0.1:${port}/api/planner.php`, logs: () => logs };
}

const key = 'test-only-write-key-not-a-production-secret';

test('PHP local configuration and persistence', async (t) => {
  const host = await startHost(t);
  const config = join(host.data, 'config.json');
  const configure = (value) => writeFile(config, JSON.stringify(value), { mode: 0o600 });
  const get = () => fetch(host.url);

  await t.test('missing configuration is an explicit service error', async () => {
    assert.equal((await get()).status, 503);
  });
  await t.test('malformed JSON and invalid keys are rejected without exposing contents', async () => {
    for (const value of ['{"writeKey":', '{"writeKey":123}', '{"writeKey":"short"}']) {
      await writeFile(config, value);
      const response = await get();
      assert.equal(response.status, 503);
      assert.ok((await response.json()).error);
    }
  });
  await configure({ writeKey: key });
  await t.test('finds configuration above a nested document root and returns empty state', async () => {
    const response = await get();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { document: null, backups: [], revision: null });
    assert.equal((await fetch(host.url.replace('api/planner.php', 'planner-data/config.json'))).status, 404);
  });
  const document = { version: 1, activeScenarioId: 'test', scenarios: [{ id: 'test' }] };
  const save = (headers = {}) => fetch(host.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-None-Match': '*', ...headers },
    body: JSON.stringify({ document, backups: [] }),
  });
  await t.test('writes still require the key', async () => {
    assert.equal((await save()).status, 401);
    assert.equal((await save({ 'X-Planner-Write-Key': 'incorrect' })).status, 401);
  });
  let revision;
  await t.test('authorized create persists beside configuration without changing the key', async () => {
    const response = await save({ 'X-Planner-Write-Key': key });
    assert.equal(response.status, 200);
    revision = (await response.json()).revision;
    assert.match(revision, /^[a-f0-9]{64}$/);
    assert.deepEqual(JSON.parse(await readFile(join(host.data, 'planner.json'), 'utf8')), { document, backups: [] });
    assert.deepEqual(JSON.parse(await readFile(config, 'utf8')), { writeKey: key });
    const loaded = await (await get()).json();
    assert.deepEqual(loaded, { document, backups: [], revision });
    assert.ok(!JSON.stringify(loaded).includes(key));
  });
  await t.test('stale writes are rejected and revision-based updates succeed', async () => {
    assert.equal((await save({ 'X-Planner-Write-Key': key })).status, 409);
    assert.equal((await save({ 'X-Planner-Write-Key': key, 'X-Expected-Revision': revision })).status, 200);
  });
  await t.test('configuration placed only inside the web root is not loaded', async () => {
    await rm(config);
    await mkdir(join(host.root, 'planner-data'));
    await writeFile(join(host.root, 'planner-data', 'config.json'), JSON.stringify({ writeKey: key }));
    assert.equal((await get()).status, 503);
  });
  await t.test('symbolic configuration files are rejected', async () => {
    const target = join(host.home, 'private.json');
    await writeFile(target, JSON.stringify({ writeKey: key }));
    await symlink(target, config);
    assert.equal((await get()).status, 503);
    await rm(config);
  });
  await t.test('configuration directory resolving inside the web root is rejected', async () => {
    await rm(host.data, { recursive: true });
    await symlink(join(host.root, 'planner-data'), host.data);
    assert.equal((await get()).status, 503);
    assert.ok(!host.logs().includes(key));
  });
});

test('PHP environment configuration retains precedence over a local file', async (t) => {
  const host = await startHost(t, (home) => ({
    PLANNER_DATA_FILE: join(home, 'environment-data', 'state.json'),
    PLANNER_WRITE_KEY: key,
  }));
  await mkdir(join(host.home, 'environment-data'));
  await writeFile(join(host.data, 'config.json'), 'invalid local JSON');
  assert.equal((await fetch(host.url)).status, 200);
});

test('partial or empty environment configuration does not fall back', async (t) => {
  for (const environment of [{ PLANNER_WRITE_KEY: key }, { PLANNER_DATA_FILE: '' }]) {
    await t.test(JSON.stringify(environment), async (t) => {
      const host = await startHost(t, environment);
      await writeFile(join(host.data, 'config.json'), JSON.stringify({ writeKey: key }));
      assert.equal((await fetch(host.url)).status, 503);
    });
  }
});

test('PHP environment data paths inside the web root remain rejected', async (t) => {
  const host = await startHost(t, (home) => ({
    PLANNER_DATA_FILE: join(home, 'public_html', 'site', 'state.json'),
    PLANNER_WRITE_KEY: key,
  }));
  assert.equal((await fetch(host.url)).status, 503);
});
