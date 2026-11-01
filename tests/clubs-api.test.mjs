import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const writerPassword = 'writer-password-0123';
const adminPassword = 'admin-password-4567';
const plannerDocument = { version: 1, activeScenarioId: 'original', scenarios: [{ id: 'original' }] };
const emptyContact = { name: '', email: '', phone: '', website: '', instagram: '', tiktok: '', public: false };
const initialStore = {
  version: 1,
  data: [
    {
      id: 'club_public',
      seura: 'Julkinen seura ry',
      paikkakunta: 'Helsinki',
      latitude: 60.17,
      longitude: 24.94,
      jasenmaara: 125,
      aanimaara: 15,
      contact: { ...emptyContact, email: 'public@example.fi', public: true },
      details: { district: 'Etelä' },
      archived: false,
    },
    {
      id: 'club_private',
      seura: 'Yksityinen seura ry',
      paikkakunta: 'Tampere',
      latitude: null,
      longitude: null,
      jasenmaara: null,
      aanimaara: null,
      contact: { ...emptyContact, email: 'private@example.fi' },
      details: {},
      archived: false,
    },
    {
      id: 'club_archived',
      seura: 'Arkistoitu seura ry',
      paikkakunta: 'Turku',
      latitude: null,
      longitude: null,
      jasenmaara: 0,
      aanimaara: 0,
      contact: emptyContact,
      details: {},
      archived: true,
    },
  ],
};

function runSetup(dataDirectory, passwords = [writerPassword, writerPassword, adminPassword, adminPassword], extraEnv = {}) {
  return spawnSync('php', [new URL('../server/setup-auth.php', import.meta.url).pathname], {
    cwd: process.cwd(),
    env: { ...process.env, HOME: dataDirectory.replace(/\/planner-data$/, ''), ...extraEnv },
    input: `${passwords.join('\n')}\n`,
    encoding: 'utf8',
  });
}

async function startHost(t, { initialize = true, clubs = initialStore, https = true } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'clubs-api-'));
  const root = join(home, 'public_html', 'site');
  const data = join(home, 'planner-data');
  await mkdir(join(root, 'api'), { recursive: true });
  await mkdir(data, { mode: 0o700 });
  for (const file of ['planner.php', 'clubs.php', 'clubs-api.php', 'setup-auth.php']) {
    await copyFile(new URL(`../server/${file}`, import.meta.url), join(root, 'api', file));
  }
  await writeFile(join(data, 'config.json'), JSON.stringify({}));
  await writeFile(join(data, 'planner.json'), JSON.stringify({ document: plannerDocument, backups: [] }), { mode: 0o600 });
  if (clubs !== null) {
    await writeFile(join(data, 'clubs.json'), JSON.stringify(clubs), { mode: 0o600 });
  }
  if (initialize) {
    const setup = runSetup(data);
    assert.equal(setup.status, 0, `setup failed: ${setup.stderr}`);
  }
  const router = join(home, 'https-router.php');
  await writeFile(router, https
    ? "<?php\n$_SERVER['HTTPS'] = 'on';\n$_SERVER['SERVER_PORT'] = '443';\nreturn false;\n"
    : "<?php\nreturn false;\n");
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const php = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root, router], {
    env: { ...process.env, HOME: home },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
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
  return {
    data,
    plannerUrl: `http://127.0.0.1:${port}/api/planner.php`,
    clubsUrl: `http://127.0.0.1:${port}/api/clubs.php`,
  };
}

function cookieFrom(response, fallback = '') {
  const header = response.headers.get('set-cookie');
  return header ? header.split(';', 1)[0] : fallback;
}

async function getSession(host, cookie = '') {
  const response = await fetch(`${host.plannerUrl}?action=session`, { headers: cookie ? { Cookie: cookie } : {} });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return { data, cookie: cookieFrom(response, cookie) };
}

async function postAuth(host, action, session, body) {
  const response = await fetch(`${host.plannerUrl}?action=${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': session.data.csrfToken,
      ...(session.cookie ? { Cookie: session.cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  return { response, data: await response.json(), cookie: cookieFrom(response, session.cookie) };
}

async function login(host, role, password) {
  const anonymous = await getSession(host);
  const result = await postAuth(host, 'login', anonymous, { role, password });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  return { data: result.data, cookie: result.cookie };
}

async function putClubs(host, session, document, revision, csrf = session.data.csrfToken) {
  const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
  if (session.cookie) headers.Cookie = session.cookie;
  if (revision) headers['X-Expected-Revision'] = revision;
  const response = await fetch(host.clubsUrl, { method: 'PUT', headers, body: JSON.stringify(document) });
  return { response, data: await response.json() };
}

test('public endpoint only returns active clubs with explicitly public contacts', async (t) => {
  const host = await startHost(t);
  const response = await fetch(host.clubsUrl);
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(body.metadata.recordCount, 2);
  assert.deepEqual(body.data.map((club) => club.id), ['club_public', 'club_private']);
  assert.equal(body.data[0].contact.email, 'public@example.fi');
  assert.equal(Object.hasOwn(body.data[1], 'contact'), false);
  assert.equal(JSON.stringify(body).includes('private@example.fi'), false);

  const differentPrivate = structuredClone(initialStore);
  differentPrivate.data[1].contact.email = 'another-private@example.fi';
  const otherHost = await startHost(t, { clubs: differentPrivate });
  const otherBody = await (await fetch(otherHost.clubsUrl)).json();
  assert.equal(otherBody.revision, body.revision);
});

test('Admin endpoint returns private and archived data; anonymous and Writer are denied', async (t) => {
  const host = await startHost(t);
  const anonymous = await fetch(`${host.clubsUrl}?view=admin`);
  assert.equal(anonymous.status, 401);

  const writer = await login(host, 'writer', writerPassword);
  const writerResponse = await fetch(`${host.clubsUrl}?view=admin`, { headers: { Cookie: writer.cookie } });
  assert.equal(writerResponse.status, 403);

  const admin = await login(host, 'admin', adminPassword);
  const adminResponse = await fetch(`${host.clubsUrl}?view=admin`, { headers: { Cookie: admin.cookie } });
  const body = await adminResponse.json();
  assert.equal(adminResponse.status, 200, JSON.stringify(body));
  assert.equal(body.data.length, 3);
  assert.equal(body.data[1].contact.email, 'private@example.fi');
  assert.equal(body.data[2].archived, true);
  assert.match(body.revision, /^[a-f0-9]{64}$/);
});

test('Admin endpoints require HTTPS', async (t) => {
  const host = await startHost(t, { https: false });
  const response = await fetch(`${host.clubsUrl}?view=admin`);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /HTTPS/);
});

test('only Admin can save with CSRF and a matching revision; writes are atomic', async (t) => {
  const host = await startHost(t);
  const revision = (await (await fetch(`${host.clubsUrl}?view=admin`, { headers: { Cookie: (await login(host, 'admin', adminPassword)).cookie } })).json()).revision;
  const writer = await login(host, 'writer', writerPassword);
  const writerWrite = await putClubs(host, writer, initialStore, revision);
  assert.equal(writerWrite.response.status, 403);

  const admin = await login(host, 'admin', adminPassword);
  const noCsrf = await putClubs(host, admin, initialStore, revision, 'invalid');
  assert.equal(noCsrf.response.status, 403);
  const stale = await putClubs(host, admin, initialStore, '0'.repeat(64));
  assert.equal(stale.response.status, 409);

  const changed = structuredClone(initialStore);
  changed.data[0].seura = 'Päivitetty seura ry';
  const saved = await putClubs(host, admin, changed, revision);
  assert.equal(saved.response.status, 200, JSON.stringify(saved.data));
  assert.match(saved.data.revision, /^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(await readFile(join(host.data, 'clubs.json'), 'utf8')).data[0].seura, 'Päivitetty seura ry');

  const invalid = structuredClone(changed);
  invalid.data[0].contact.website = 'javascript:alert(1)';
  const rejected = await putClubs(host, admin, invalid, saved.data.revision);
  assert.equal(rejected.response.status, 400);
  assert.equal(JSON.parse(await readFile(join(host.data, 'clubs.json'), 'utf8')).data[0].seura, 'Päivitetty seura ry');
});

test('missing migrated store fails visibly and unsupported methods are rejected', async (t) => {
  const host = await startHost(t, { clubs: null });
  const missing = await fetch(host.clubsUrl);
  assert.equal(missing.status, 503);
  assert.match((await missing.json()).error, /migraatio/);
  const method = await fetch(host.clubsUrl, { method: 'POST' });
  assert.equal(method.status, 405);
});

test('public endpoint refuses a store with permissive filesystem permissions', async (t) => {
  const host = await startHost(t);
  await chmod(join(host.data, 'clubs.json'), 0o644);
  const response = await fetch(host.clubsUrl);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /oikeuksien tulee olla 600/);
});

test('migration is deterministic, private, complete, and refuses duplicate keys or overwrites', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'clubs-migration-'));
  const privateDirectory = join(home, 'private');
  await mkdir(privateDirectory, { mode: 0o700 });
  const source = join(home, 'source.json');
  const output = join(privateDirectory, 'clubs.json');
  const sourceData = {
    data: [
      { seura: ' Esimerkkiseura ry ', paikkakunta: 'Helsinki', latitude: '60.17', longitude: '24.94', jasenmaara: '100', aanimaara: 10, website: 'https://example.fi', district: 'Etelä' },
      { seura: 'Toinen seura ry', paikkakunta: 'Turku', jasenmaara: null, aanimaara: 25 },
    ],
  };
  await writeFile(source, JSON.stringify(sourceData));
  const script = new URL('../server/migrate-clubs.php', import.meta.url).pathname;
  const migrate = () => spawnSync('php', [script, source, output], { encoding: 'utf8' });
  const result = migrate();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 seuraa migroitiin/);
  const saved = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(saved.data[0].jasenmaara, 100);
  assert.equal(saved.data[0].aanimaara, 15);
  assert.equal(saved.data[0].contact.website, 'https://example.fi');
  assert.equal(saved.data[0].contact.public, true);
  assert.equal(saved.data[0].details.district, 'Etelä');
  assert.equal(saved.data[1].aanimaara, null);
  assert.equal((await readFile(output)).length > 0, true);
  const secondOutput = join(privateDirectory, 'clubs-second.json');
  const second = spawnSync('php', [script, source, secondOutput], { encoding: 'utf8' });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(await readFile(secondOutput, 'utf8')).data[0].id, saved.data[0].id);
  const overwrite = migrate();
  assert.notEqual(overwrite.status, 0);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), saved);

  const duplicateSource = join(home, 'duplicate.json');
  await writeFile(duplicateSource, JSON.stringify({ data: [
    { seura: 'Sama seura ry', paikkakunta: 'Helsinki' },
    { seura: 'sama seura ry', paikkakunta: ' Helsinki ' },
  ] }));
  const duplicate = spawnSync('php', [script, duplicateSource, join(privateDirectory, 'duplicates.json')], { encoding: 'utf8' });
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /ei ole yksikäsitteinen/);
  assert.equal(await readFile(join(privateDirectory, 'duplicates.json')).catch(() => null), null);

  const preservedOutput = join(privateDirectory, 'duplicates-preserved.json');
  const preserved = spawnSync('php', [script, duplicateSource, preservedOutput, '--preserve-duplicate-name-town'], { encoding: 'utf8' });
  assert.equal(preserved.status, 0, preserved.stderr);
  const preservedStore = JSON.parse(await readFile(preservedOutput, 'utf8'));
  assert.equal(preservedStore.data.length, 2);
  assert.notEqual(preservedStore.data[0].id, preservedStore.data[1].id);
  assert.match(preserved.stdout, /duplicate name town groups preserved/);
  await rm(home, { recursive: true, force: true });
});
