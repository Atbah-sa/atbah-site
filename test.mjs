// اختبار شامل للمستقبِل: يتطلّب DATABASE_URL لقاعدة فارغة طُبِّق عليها schema.sql، وLEADS_SECRET.
// node --test test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';

const SECRET = process.env.LEADS_SECRET || 'test-secret';
const PORT = 8799;
const base = `http://127.0.0.1:${PORT}`;
const sign = (body, ts) => createHmac('sha256', SECRET).update(ts + '.' + body).digest('hex');
const call = async (path, method = 'GET', payload, opts = {}) => {
  const body = payload ? JSON.stringify(payload) : '';
  const ts = opts.ts ?? String(Date.now());
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Atbah-Ts': ts, 'X-Atbah-Sig': opts.badSig ? 'deadbeef' : sign(body, ts) }, body: body || undefined });
  return { status: res.status, json: await res.json() };
};

let child;
test.before(async () => {
  child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(PORT), LEADS_SECRET: SECRET }, stdio: 'inherit' });
  for (let i = 0; i < 50; i++) { try { const r = await fetch(base + '/health'); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('receiver did not start');
});
test.after(() => child?.kill());

const lead = { name: 'محمد العتيبي', phone: '0551234567', email: null, role: 'buyer', city: 'الرياض', budget: 1310000, note: 'الدفعة الأولى', consent_text_ver: 'phase0-v1', consent_lang: 'ar', marketing_consent: false, ip_hash: 'abc', source: 'coming-soon', wishes: { pay: 'loan', ptype: 'villa', rooms: '4', district: 'الملقا', when: '6m', bogus: 'x', purpose: 'nope' } };
let ref;

test('rejects a bad signature and a stale timestamp', async () => {
  assert.equal((await call('/interest', 'POST', lead, { badSig: true })).status, 401);
  assert.equal((await call('/interest', 'POST', lead, { ts: String(Date.now() - 10 * 60_000) })).status, 401);
});

test('creates a lead and returns an ATB-I reference', async () => {
  const r = await call('/interest', 'POST', lead);
  assert.equal(r.status, 201);
  assert.match(r.json.ref, /^ATB-I-\d{4}-\d{4}$/);
  ref = r.json.ref;
});

test('validates phone and name', async () => {
  assert.equal((await call('/interest', 'POST', { ...lead, phone: '123' })).status, 400);
  assert.equal((await call('/interest', 'POST', { ...lead, name: 'م' })).status, 400);
});

test('lists and reads', async () => {
  const l = await call('/interest?status=new');
  assert.equal(l.status, 200); assert.ok(l.json.some((x) => x.ref === ref));
  const g = await call(`/interest/${ref}`);
  assert.equal(g.json.name, lead.name);
  assert.deepEqual(g.json.wishes, { pay: 'loan', ptype: 'villa', rooms: '4', when: '6m', district: 'الملقا' });
});

test('contacted → converted → withdrawn erases personal fields', async () => {
  assert.equal((await call(`/interest/${ref}/event`, 'POST', { kind: 'contacted', actor: 'osama' })).status, 200);
  assert.equal((await call(`/interest/${ref}`)).json.status, 'contacted');
  assert.equal((await call(`/interest/${ref}/event`, 'POST', { kind: 'converted', actor: 'osama', person_id: 'p1' })).json.ok, true);
  assert.equal((await call(`/interest/${ref}/event`, 'POST', { kind: 'withdrawn', actor: 'osama' })).json.ok, true);
  const g = await call(`/interest/${ref}`);
  assert.equal(g.json.phone, '—'); assert.equal(g.json.name, '—'); assert.ok(g.json.deleted_at);
  assert.equal((await call(`/interest/${ref}/event`, 'POST', { kind: 'contacted', actor: 'x' })).status, 404);
});
