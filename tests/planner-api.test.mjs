import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const writerPassword = 'writer-password-0123';
const adminPassword = 'admin-password-4567';
const oldKey = 'legacy-write-key-not-authorized-anymore';
const originalDocument = { version: 1, activeScenarioId: 'original', scenarios: [{ id: 'original' }] };
const editedDocument = { version: 1, activeScenarioId: 'updated', scenarios: [{ id: 'updated' }] };

function runSetup(dataDirectory, passwords = [writerPassword, writerPassword, adminPassword, adminPassword], extraEnv = {}) {
  return spawnSync('php', [new URL('../server/setup-auth.php', import.meta.url).pathname], {
    cwd: process.cwd(),
    env: { ...process.env, HOME: dataDirectory.replace(/\/planner-data$/, ''), ...extraEnv },
    input: `${passwords.join('\n')}\n`,
    encoding: 'utf8',
  });
}

async function startHost(t, { initialize = true, withPlan = true } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'planner-auth-'));
  const root = join(home, 'public_html', 'site');
  const data = join(home, 'planner-data');
  await mkdir(join(root, 'api'), { recursive: true });
  await mkdir(data, { mode: 0o700 });
  await copyFile(new URL('../server/planner.php', import.meta.url), join(root, 'api', 'planner.php'));
  await copyFile(new URL('../server/setup-auth.php', import.meta.url), join(root, 'api', 'setup-auth.php'));
  const router = join(home, 'https-router.php');
  await writeFile(router, "<?php\n$_SERVER['HTTPS'] = 'on';\n$_SERVER['SERVER_PORT'] = '443';\nreturn false;\n");
  await writeFile(join(data, 'config.json'), JSON.stringify({ writeKey: oldKey }), { mode: 0o600 });
  if (withPlan) {
    await writeFile(join(data, 'planner.json'), JSON.stringify({ document: originalDocument, backups: [] }), { mode: 0o600 });
  }
  if (initialize) {
    const setup = runSetup(data);
    assert.equal(setup.status, 0, `setup failed: ${setup.stderr}`);
  }
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const env = { ...process.env, HOME: home };
  const php = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root, router], { env, stdio: ['ignore', 'ignore', 'pipe'] });
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
  const url = `http://127.0.0.1:${port}/api/planner.php`;
  return { home, root, data, url, logs: () => logs };
}

function cookieFrom(response, fallback = '') {
  const header = response.headers.get('set-cookie');
  return header ? header.split(';', 1)[0] : fallback;
}

async function getSession(host, cookie = '') {
  const response = await fetch(`${host.url}?action=session`, { headers: cookie ? { Cookie: cookie } : {} });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return { data, cookie: cookieFrom(response, cookie) };
}

async function postAuth(host, action, session, body, csrf = session.data.csrfToken) {
  const response = await fetch(`${host.url}?action=${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
      ...(session.cookie ? { Cookie: session.cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { response, data, cookie: cookieFrom(response, session.cookie) };
}

async function putPlan(host, { cookie = '', csrf = '', revision, document = editedDocument, extraHeaders = {} } = {}) {
  return fetch(host.url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...(revision === null ? { 'If-None-Match': '*' } : revision ? { 'X-Expected-Revision': revision } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify({ document, backups: [] }),
  });
}

test('public planner reads remain available before auth setup; all writes fail closed', async (t) => {
  const host = await startHost(t, { initialize: false });
  const read = await fetch(host.url);
  assert.equal(read.status, 200);
  const state = await read.json();
  assert.deepEqual(state.document, originalDocument);
  assert.deepEqual(state.backups, []);
  assert.match(state.revision, /^[a-f0-9]{64}$/);
  const session = await getSession(host);
  assert.equal(session.data.authReady, false);
  assert.equal(session.data.role, null);
  const oldKeyWrite = await putPlan(host, { revision: state.revision, extraHeaders: { 'X-Planner-Write-Key': oldKey } });
  assert.equal(oldKeyWrite.status, 401);
  const deniedWrite = await putPlan(host, { revision: state.revision });
  assert.equal(deniedWrite.status, 401);
  const cliOnly = await fetch(`${host.url.replace('/planner.php', '/setup-auth.php')}`);
  assert.equal(cliOnly.status, 404);
  assert.ok(!(await readFile(join(host.data, 'planner.json'), 'utf8')).includes('updated'));
});

test('one-time CLI setup preserves planner data and removes the legacy key', async (t) => {
  const host = await startHost(t);
  assert.deepEqual(JSON.parse(await readFile(join(host.data, 'planner.json'), 'utf8')), { document: originalDocument, backups: [] });
  assert.deepEqual(JSON.parse(await readFile(join(host.data, 'config.json'), 'utf8')), {});
  const auth = JSON.parse(await readFile(join(host.data, 'auth.json'), 'utf8'));
  assert.equal(auth.version, 1);
  assert.equal(auth.sessionVersion, 1);
  assert.ok(!JSON.stringify(auth).includes(writerPassword));
  assert.ok(!JSON.stringify(auth).includes(adminPassword));
  assert.equal((await readFile(join(host.data, 'auth.json'))).length > 0, true);
  const secondSetup = runSetup(host.data, []);
  assert.notEqual(secondSetup.status, 0);
  assert.match(secondSetup.stderr, /ei ylikirjoita/i);
});

test('CLI setup uses the configured planner data directory', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'planner-auth-custom-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const directory = join(home, 'private', 'store');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const setup = runSetup(directory, undefined, { HOME: home, PLANNER_DATA_FILE: join(directory, 'shared-plan.json') });
  assert.equal(setup.status, 0, `setup failed: ${setup.stderr}`);
  assert.ok(JSON.parse(await readFile(join(directory, 'auth.json'), 'utf8')).passwords);
  assert.equal(await readFile(join(home, 'planner-data', 'auth.json')).catch(() => null), null);
});

test('Writer can edit shared planner but cannot access Admin APIs', async (t) => {
  const host = await startHost(t);
  const initial = await (await fetch(host.url)).json();
  let session = await getSession(host);
  assert.equal(session.data.authReady, true);
  const csrfFailure = await postAuth(host, 'login', session, { role: 'writer', password: writerPassword }, 'invalid');
  assert.equal(csrfFailure.response.status, 403);
  const login = await postAuth(host, 'login', session, { role: 'writer', password: writerPassword });
  assert.equal(login.response.status, 200);
  assert.equal(login.data.role, 'writer');
  assert.match(login.response.headers.get('set-cookie') ?? '', /Secure/i);
  assert.match(login.response.headers.get('set-cookie') ?? '', /HttpOnly/i);
  assert.match(login.response.headers.get('set-cookie') ?? '', /SameSite=Strict/i);
  session = { data: login.data, cookie: login.cookie };

  const noCsrf = await putPlan(host, { cookie: session.cookie, revision: initial.revision });
  assert.equal(noCsrf.status, 403);
  const writerWrite = await putPlan(host, { cookie: session.cookie, csrf: session.data.csrfToken, revision: initial.revision });
  assert.equal(writerWrite.status, 200);
  assert.deepEqual((await (await fetch(host.url)).json()).document, editedDocument);

  const adminOnly = await postAuth(host, 'admin/password', session, {
    account: 'writer',
    currentAdminPassword: adminPassword,
    newPassword: 'new-writer-password-9876',
  });
  assert.equal(adminOnly.response.status, 403);
});

test('Admin changes account passwords and password updates invalidate every session', async (t) => {
  const host = await startHost(t);
  const initial = await (await fetch(host.url)).json();
  const writerAnonymous = await getSession(host);
  const writerLogin = await postAuth(host, 'login', writerAnonymous, { role: 'writer', password: writerPassword });
  const writerSession = { data: writerLogin.data, cookie: writerLogin.cookie };
  const adminAnonymous = await getSession(host);
  const adminLogin = await postAuth(host, 'login', adminAnonymous, { role: 'admin', password: adminPassword });
  let adminSession = { data: adminLogin.data, cookie: adminLogin.cookie };
  assert.equal(adminLogin.response.status, 200);
  const adminWrite = await putPlan(host, {
    cookie: adminSession.cookie,
    csrf: adminSession.data.csrfToken,
    revision: initial.revision,
  });
  assert.equal(adminWrite.status, 200);

  const changedWriter = await postAuth(host, 'admin/password', adminSession, {
    account: 'writer',
    currentAdminPassword: adminPassword,
    newPassword: 'new-writer-password-9876',
  });
  assert.equal(changedWriter.response.status, 200);
  assert.equal(changedWriter.data.role, null);
  const staleWriterWrite = await putPlan(host, {
    cookie: writerSession.cookie,
    csrf: writerSession.data.csrfToken,
    revision: initial.revision,
  });
  assert.equal(staleWriterWrite.status, 401);
  const staleAdminSession = await getSession(host, adminSession.cookie);
  assert.equal(staleAdminSession.data.role, null);

  const writerOldPassword = await postAuth(host, 'login', await staleWriterSession(host, writerSession.cookie), {
    role: 'writer', password: writerPassword,
  });
  assert.equal(writerOldPassword.response.status, 401);
  const writerNewPassword = await postAuth(host, 'login', await staleWriterSession(host, writerSession.cookie), {
    role: 'writer', password: 'new-writer-password-9876',
  });
  assert.equal(writerNewPassword.response.status, 200);

  const freshAdmin = await getSession(host, changedWriter.cookie);
  const reauthenticatedAdmin = await postAuth(host, 'login', freshAdmin, { role: 'admin', password: adminPassword });
  adminSession = { data: reauthenticatedAdmin.data, cookie: reauthenticatedAdmin.cookie };
  const changedAdmin = await postAuth(host, 'admin/password', adminSession, {
    account: 'admin',
    currentAdminPassword: adminPassword,
    newPassword: 'new-admin-password-9876',
  });
  assert.equal(changedAdmin.response.status, 200);
  const oldAdmin = await postAuth(host, 'login', await getSession(host, changedAdmin.cookie), { role: 'admin', password: adminPassword });
  assert.equal(oldAdmin.response.status, 401);
  const newAdmin = await postAuth(host, 'login', await getSession(host, oldAdmin.cookie), { role: 'admin', password: 'new-admin-password-9876' });
  assert.equal(newAdmin.response.status, 200);
  assert.deepEqual(JSON.parse(await readFile(join(host.data, 'planner.json'), 'utf8')).document, editedDocument);
});

test('wrong passwords are generic and rate-limited per remote address', async (t) => {
  const host = await startHost(t);
  let session = await getSession(host);
  const bad = () => postAuth(host, 'login', session, { role: 'writer', password: 'wrong-password-0000' });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await bad();
    assert.equal(response.response.status, 401);
    assert.equal(response.data.error, 'Tunnus tai salasana on virheellinen.');
  }
  const limited = await bad();
  assert.equal(limited.response.status, 429);
  assert.match(limited.data.error, /Odota 15 minuuttia/);
});

function staleWriterSession(host, cookie) {
  return getSession(host, cookie);
}
