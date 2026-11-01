// jsdom tests: promoter portal page + ?ref= capture in config.js. Needs esbuild + jsdom (not repo deps).
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import fs from 'fs';
const FRONT = process.env.FRONTEND_DIR || new URL('../../../frontend', import.meta.url).pathname;
const bundle = async (f) => (await build({ entryPoints: [`${FRONT}/nc_assets/js/${f}`], bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent' })).outputFiles[0].text;
const portalJs = await bundle('promoter.js'); const configJs = await bundle('config.js');
const html = fs.readFileSync(`${FRONT}/promoter.html`, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const results = []; const t = (n, ok, i = '') => results.push((ok ? 'PASS ' : 'FAIL ') + n + (i ? ' - ' + i : ''));
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));
const J = (status, body) => ({ ok: status < 400, status, json: async () => body });

async function portal({ token, routes = {} } = {}) {
  const dom = new JSDOM(html, { url: 'https://sagona.in/promoter.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; const calls = [];
  if (token) w.sessionStorage.setItem('promoter_token', token);
  w.fetch = async (url, opts = {}) => {
    const path = String(url).replace(/^.*\/api\/promoter/, '');
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ path, method: opts.method || 'GET', body, auth: opts.headers?.Authorization });
    const r = routes[path.split('?')[0]];
    return r ? r(body, opts) : J(404, { success: false });
  };
  w.eval(portalJs); await tick(80);
  return { w, calls, $: (id) => w.document.getElementById(id), root: w.document.getElementById('pp-root') };
}
const ME = { success: true, data: { name: '<b>Asha</b>', email: 'asha@example.com', mobile: 'XXXXXX0001', panLast4: '234F', bankLast4: '1234', kycStatus: 'verified', agreementStatus: 'signed', notifyEmail: true } };
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const baseRoutes = () => ({
  '/me': () => J(200, ME),
  '/dashboard': () => J(200, { success: true, data: { pendingPaise: 12345, payablePaise: 50000, inApprovedPayoutPaise: 0, paidNetPaise: 99900, referredOrders: 7, clicks30d: 31 } }),
  '/codes': () => J(200, { success: true, data: [{ code: 'RHEA25', status: 'active', link: 'https://sagona.in/?ref=RHEA25' }] }),
  '/orders': () => J(200, { success: true, data: [{ date: '2026-11-02', code: 'RHEA25', status: 'Delivered', commissionPaise: 400 }] }),
  '/payouts': () => J(200, { success: true, data: [{ voucherNo: 'SAG/PO/2026-27/0001', date: '2026-11-05', status: 'Paid', grossPaise: 100000, gstPaise: 18000, tdsPaise: 10000, netPaise: 108000, utr: 'UTR123456' }] }),
  '/statement': () => J(200, { success: true, data: { summary: { openingPaise: 0, accruedPaise: 5000, reversedPaise: 0, adjustedPaise: 0, paidOutPaise: -5000, closingPaise: 0 } } }),
  '/me/notifications': (b) => J(200, { success: true, data: b })
});

// 1. not logged in -> login form; no data calls
let p = await portal({ routes: baseRoutes() });
t('logged out: login form shown, no data requested', !!p.$('pp-email') && p.calls.length === 0 && p.$('pp-logout').style.display === 'none');

// 2. request code -> otp box; same neutral wording
p = await portal({ routes: { '/auth/request': () => J(200, { success: true }), '/auth/verify': (b) => (b.otp === '123456' ? J(200, { success: true, token: 'tok' }) : J(401, { success: false, message: 'Invalid or expired code' })), ...baseRoutes() } });
p.$('pp-email').value = 'asha@example.com'; click(p.w, p.$('pp-send')); await tick();
t('request code: OTP box appears with neutral message', p.$('pp-otp-box').style.display === 'block' && /If this email is registered/.test(p.$('pp-msg').textContent));
p.$('pp-otp').value = '000000'; click(p.w, p.$('pp-verify')); await tick();
t('wrong code: error shown, still logged out', /Invalid or expired/.test(p.$('pp-msg').textContent) && !p.w.sessionStorage.getItem('promoter_token'));
p.$('pp-otp').value = '123456'; click(p.w, p.$('pp-verify')); await tick(150);
t('right code: token kept in sessionStorage (not localStorage) and dashboard loads', p.w.sessionStorage.getItem('promoter_token') === 'tok' && !p.w.localStorage.getItem('promoter_token') && /Pending/.test(p.root.textContent));
t('data calls send the bearer token', p.calls.filter((c) => c.path === '/dashboard').every((c) => c.auth === 'Bearer tok'));
t('overview: amounts in rupees and counts', /₹123\.45/.test(p.root.textContent) && /₹500\.00/.test(p.root.textContent) && /₹999\.00/.test(p.root.textContent) && />31</.test(p.root.innerHTML.replace(/\s/g, '')));
t('greeting escapes markup', /&lt;b&gt;Asha/.test(p.root.innerHTML));

// 3. tabs
click(p.w, p.root.querySelector('[data-tab="codes"]')); await tick(100);
t('codes tab: code + shareable link + copy button', /RHEA25/.test(p.root.textContent) && /\?ref=RHEA25/.test(p.root.textContent) && !!p.root.querySelector('[data-copy]'));
click(p.w, p.root.querySelector('[data-tab="orders"]')); await tick(100);
const ot = p.root.querySelector('#pp-body').textContent;
t('orders tab: date, code, status, commission; no customer columns', /Delivered/.test(ot) && /₹4\.00/.test(ot) && !/Customer|Phone|Address|Email/i.test(p.root.querySelector('#pp-body thead').textContent));
click(p.w, p.root.querySelector('[data-tab="payouts"]')); await tick(100);
t('payouts tab: voucher, GST, TDS, net and bank ref', /SAG\/PO\/2026-27\/0001/.test(p.root.textContent) && /₹1,080\.00/.test(p.root.textContent) && /UTR123456/.test(p.root.textContent));
click(p.w, p.root.querySelector('[data-tab="statement"]')); await tick(100);
t('statement tab: closing balance', /Closing balance/.test(p.root.textContent));
t('statement request carries a date range', p.calls.some((c) => c.path.startsWith('/statement?from=') && c.path.includes('&to=')));

// 4. settings: masked identifiers, notification toggle
click(p.w, p.root.querySelector('[data-tab="settings"]')); await tick(100);
t('settings: PAN/bank masked, mobile masked', /XXXXXX234F/.test(p.root.textContent) && /XXXXXX1234/.test(p.root.textContent) && /XXXXXX0001/.test(p.root.textContent));
const cb = p.$('pp-notify'); cb.checked = false; cb.dispatchEvent(new p.w.Event('change', { bubbles: true })); await tick(80);
const put = p.calls.find((c) => c.path === '/me/notifications');
t('notification switch sends PUT { notifyEmail:false }', put && put.method === 'PUT' && put.body.notifyEmail === false);

// 5. session expiry and logout
p = await portal({ token: 'old', routes: { '/me': () => J(401, { success: false, message: 'Please log in' }) } });
t('expired session: back to login with token removed', !!p.$('pp-email') && !p.w.sessionStorage.getItem('promoter_token'));
p = await portal({ token: 'tok', routes: baseRoutes() });
click(p.w, p.$('pp-logout')); await tick();
t('logout clears token and shows login', !p.w.sessionStorage.getItem('promoter_token') && !!p.$('pp-email'));

// 6. portal disabled on server (404 on request)
p = await portal({ routes: { '/auth/request': () => J(404, { success: false }) } });
p.$('pp-email').value = 'a@b.co'; click(p.w, p.$('pp-send')); await tick();
t('portal off (404): friendly message, no OTP box', /not available yet/.test(p.$('pp-msg').textContent) && p.$('pp-otp-box').style.display === 'none');

// 7. ?ref= capture in config.js
async function visit(url, { clicked } = {}) {
  const dom = new JSDOM('<body></body>', { url, runScripts: 'outside-only' });
  const w = dom.window; const calls = [];
  if (clicked) w.sessionStorage.setItem('sg_ref_clicked', '1');
  w.fetch = async (u, o) => { calls.push({ u: String(u), body: o?.body ? JSON.parse(o.body) : undefined, method: o?.method }); return J(204, {}); };
  w.eval(configJs); await tick(20);
  return { w, calls, stored: JSON.parse(w.localStorage.getItem('sg_ref') || 'null') };
}
let v = await visit('https://sagona.in/shop.html?ref=rhea25');
t('?ref= stored upper-cased with timestamp and one click sent', v.stored?.code === 'RHEA25' && Math.abs(v.stored.at - Date.now()) < 5000 && v.calls.length === 1 && v.calls[0].u.endsWith('/referral/click') && v.calls[0].body.code === 'RHEA25' && v.calls[0].method === 'POST');
t('click payload contains only the code', Object.keys(v.calls[0].body).join() === 'code');
v = await visit('https://sagona.in/shop.html?ref=rhea25', { clicked: true });
t('second page in the same session: remembered but NOT counted again', v.stored?.code === 'RHEA25' && v.calls.length === 0);
for (const bad of ['', '<script>', 'ab', 'x'.repeat(40), 'a b', "a';drop"]) {
  v = await visit(`https://sagona.in/?ref=${encodeURIComponent(bad)}`);
  t(`invalid ref "${bad.slice(0, 12)}" ignored`, v.stored === null && v.calls.length === 0);
}
v = await visit('https://sagona.in/shop.html');
t('no ref param: nothing stored or sent', v.stored === null && v.calls.length === 0);

console.log(results.join('\n')); process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
