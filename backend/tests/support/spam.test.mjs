import test from 'node:test';
import assert from 'node:assert/strict';
process.env.JWT_SECRET = 'j'.repeat(40);
const G = await import('../../utils/spamGuard.js');

const T0 = 1_800_000_000_000;
const tokenAt = (ago) => G.makeToken(T0 - ago);
const body = (o = {}) => ({ name: 'Priya Sharma', email: 'p@example.com', message: 'Where is my order SAG-1?', formToken: tokenAt(10_000), website: '', ...o });

test('real names are never flagged as gibberish (incl. long Indian and European names)', () => {
  for (const n of ['Priya Sharma', 'Krishnamurthy Iyer', 'Lakshmi Narayanan', 'Chandrashekhar Patil', 'Venkatesh Rao', 'Srinivasan', 'Parthasarathy', 'Anjali Mehta', 'Rhea Kapoor', 'Manoj Devare', 'Christopher Smith', 'Schwarzenegger', 'Lynn Flynn', 'Ng', 'A B', 'Mkhize Zulu', 'Shreyas', 'Tripathi', 'Sandhya Krishnan', 'Wójcik Łukasz', 'Smith', 'Krishnan', 'Dhruv', 'Tshering', 'Szymczak', 'Bhattacharya', 'Prithviraj'])
    assert.equal(G.looksGibberish(n), false, n);
});
test('the actual spam names seen on the live form are flagged', () => {
  for (const n of ['Wzwq Mdhggj', 'Vlnsgm Lkmexywt', 'Swdc Sjoqmukr', 'Vyrcxz Stmcd', 'Qfix Vzwpcjjrg', 'Jwmems Iktfbsvku']) {
    // each of these has at least one word that is not a plausible name
    assert.equal(G.looksGibberish(n), true, n);
  }
});
test('token: valid after 3s, too fast before, expired after 2h, forged/garbled invalid, missing', () => {
  assert.equal(G.checkToken(tokenAt(10_000), T0).state, 'valid');
  assert.equal(G.checkToken(tokenAt(500), T0).state, 'toofast');
  assert.equal(G.checkToken(tokenAt(3 * 3600_000), T0).state, 'expired');
  assert.equal(G.checkToken(`${T0 - 10_000}.${'a'.repeat(32)}`, T0).state, 'invalid');
  assert.equal(G.checkToken('garbage', T0).state, 'invalid');
  assert.equal(G.checkToken(tokenAt(-60_000), T0).state, 'invalid', 'future-dated');
  assert.equal(G.checkToken('', T0).state, 'missing'); assert.equal(G.checkToken(undefined, T0).state, 'missing');
  // a token can't be re-dated: changing the timestamp breaks the signature
  const [ts, sig] = tokenAt(10_000).split('.'); assert.equal(G.checkToken(`${Number(ts) - 1000}.${sig}`, T0).state, 'invalid');
});
test('classify: normal visitor passes with auto-reply allowed', () => {
  assert.deepEqual(G.classify({ body: body(), now: T0 }), { action: 'normal', reasons: [] });
});
test('classify: honeypot, forged token, instant submit are dropped', () => {
  assert.equal(G.classify({ body: body({ website: 'http://x.com' }), now: T0 }).action, 'drop');
  assert.equal(G.classify({ body: body({ formToken: 'x.y' }), now: T0 }).action, 'drop');
  assert.equal(G.classify({ body: body({ formToken: tokenAt(300) }), now: T0 }).action, 'drop');
});
test('classify: the current bot (no token, gibberish name) is dropped', () => {
  const r = G.classify({ body: { name: 'Jwmems Iktfbsvku', email: 'a@b.co', message: 'x'.repeat(30) }, now: T0 });
  assert.equal(r.action, 'drop');
});
test('classify: genuine visitor on an old cached page (no token, normal name) still reaches the inbox, tagged, without auto-reply', () => {
  const r = G.classify({ body: { name: 'Priya Sharma', email: 'p@example.com', message: 'Please help with my return' }, now: T0 });
  assert.equal(r.action, 'review'); assert.ok(r.reasons.includes('token_missing'));
});
test('classify: valid token but suspicious (gibberish name / two links) is delivered for review with no auto-reply', () => {
  assert.equal(G.classify({ body: body({ name: 'Mdhggj Vlnsgm' }), now: T0 }).action, 'review');
  assert.equal(G.classify({ body: body({ message: 'buy now http://a.com and http://b.com' }), now: T0 }).action, 'review');
  assert.equal(G.classify({ body: body({ message: 'see my photo https://x.com/a.jpg' }), now: T0 }).action, 'normal', 'a single link is fine');
});
test('classify: expired token (page left open for hours) is delivered, never lost', () => {
  assert.equal(G.classify({ body: body({ formToken: tokenAt(5 * 3600_000) }), now: T0 }).action, 'review');
});
test('reply limiter: one per address per day, daily ceiling overall', () => {
  const l = G.makeReplyLimiter({ perAddress: 1, perDay: 3 });
  assert.equal(l.allow('a@x.com', T0), true); assert.equal(l.allow('A@x.com', T0 + 1000), false, 'same address, case-insensitive');
  assert.equal(l.allow('b@x.com', T0), true); assert.equal(l.allow('c@x.com', T0), true);
  assert.equal(l.allow('d@x.com', T0), false, 'daily ceiling');
  assert.equal(l.allow('a@x.com', T0 + 25 * 3600_000), true, 'window rolls over');
});

/* ── the route itself, with the email sender replaced ── */
import express from 'express';
import http from 'node:http';
const emails = [];
process.env.RESEND_API_KEY = 'test'; process.env.SUPPORT_EMAIL = 'care@test.in';
const axios = (await import('axios')).default;
axios.post = async (_u, payload) => { emails.push(payload); return { data: { id: 'x' } }; };
const { default: router } = await import('../../routes/supportRoutes.js');
const app = express(); app.use(express.json()); app.set('trust proxy', 1); app.use('/api/support', router);
const server = http.createServer(app); await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/api/support`;
const post = (b, ip = '9.9.9.9') => fetch(`${base}/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, json: await r.json() }));
const settle = () => new Promise((r) => setTimeout(r, 50));
const goodBody = (o = {}) => ({ name: 'Priya Sharma', email: `p${Math.random().toString(36).slice(2, 8)}@example.com`, message: 'Where is my order SAG-123?', subject: 'Order issue', website: '', formToken: G.makeToken(Date.now() - 10_000), ...o });

test('route: real submission emails support AND auto-replies once', async () => {
  emails.length = 0; const b = goodBody({ email: 'real@example.com' });
  const r = await post(b, '1.1.1.1'); await settle();
  assert.equal(r.status, 200); assert.equal(emails.length, 2);
  assert.equal(emails[0].to, 'care@test.in'); assert.ok(!emails[0].subject.includes('[Review]'));
  assert.equal(emails[1].to, 'real@example.com');
  assert.ok(!emails[1].html.includes('XXXXXXXXXX'), 'placeholder phone number is gone');
  emails.length = 0; await post(goodBody({ email: 'real@example.com' }), '1.1.1.2'); await settle();
  assert.equal(emails.length, 1, 'second message: support email only, no second auto-reply to the same address');
});
test('route: the live bot pattern sends NOTHING (no inbox mail, no auto-reply) but looks successful', async () => {
  emails.length = 0;
  const r = await post({ name: 'Jwmems Iktfbsvku', email: 'victim@company.com', message: 'Hello I have an order issue please', subject: 'Order issue' }, '2.2.2.2'); await settle();
  assert.equal(r.status, 200); assert.equal(r.json.success, true); assert.equal(emails.length, 0);
});
test('route: honeypot filled and forged token send nothing', async () => {
  emails.length = 0;
  await post(goodBody({ website: 'spam' }), '3.3.3.3'); await post(goodBody({ formToken: 'a.b' }), '3.3.3.4'); await settle();
  assert.equal(emails.length, 0);
});
test('route: review case reaches support tagged, with NO auto-reply', async () => {
  emails.length = 0; await post(goodBody({ name: 'Mdhggj Vlnsgm' }), '4.4.4.4'); await settle();
  assert.equal(emails.length, 1); assert.match(emails[0].subject, /\[Review\]/); assert.equal(emails[0].to, 'care@test.in');
});
test('route: rotating fake emails from ONE ip is stopped by the per-IP limit (8/hour)', async () => {
  emails.length = 0; let blocked = 0;
  for (let i = 0; i < 12; i++) { const r = await post(goodBody(), '5.5.5.5'); if (r.status === 429) blocked++; }
  assert.ok(blocked >= 4, `blocked ${blocked}`);
});
test('route: token endpoint issues a verifiable token', async () => {
  const r = await fetch(`${base}/token`, { headers: { 'X-Forwarded-For': '6.6.6.6' } }); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(G.checkToken(j.token, Date.now() + 5000).state, 'valid');
});
test('route: validation still enforced (bad email / short message send nothing)', async () => {
  emails.length = 0;
  const r1 = await post(goodBody({ email: 'nope' }), '7.7.7.7'); const r2 = await post(goodBody({ message: 'short' }), '7.7.7.8'); await settle();
  assert.ok(r1.status >= 400 && r2.status >= 400); assert.equal(emails.length, 0);
});
test.after(() => server.close());
