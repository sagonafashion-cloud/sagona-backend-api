// jsdom test for the checkout referral box. Needs esbuild + jsdom (not repo dependencies).
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import fs from 'fs';
const FRONT = process.env.FRONTEND_DIR || new URL('../../../frontend', import.meta.url).pathname;
const bundle = (await build({ entryPoints: [`${FRONT}/nc_assets/js/checkout.js`], bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent' })).outputFiles[0].text;
const html = fs.readFileSync(`${FRONT}/checkout.html`, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const results = []; const t = (n, ok, i = '') => results.push((ok ? 'PASS ' : 'FAIL ') + n + (i ? ' - ' + i : ''));
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function page({ statusEnabled, validate, orderResponse, cartQty = 1, storedRef } = {}) {
  const dom = new JSDOM(html, { url: 'https://sagona.in/checkout.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; const calls = []; const alerts = [];
  w.localStorage.setItem('cart', JSON.stringify([{ id: 'p1', name: 'Kurta', price: 500, quantity: cartQty, size: '', image: '' }]));
  if (storedRef) w.localStorage.setItem('sg_ref', JSON.stringify(storedRef));
  w.alert = (m) => alerts.push(m); w.confirm = () => false;
  const J = (status, body) => ({ ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) });
  w.fetch = async (url, opts = {}) => {
    const path = String(url).replace(/^.*\/api/, '');
    calls.push({ path, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : undefined });
    if (path === '/referral/status') return statusEnabled === undefined ? J(404, { success: false }) : J(200, { success: true, data: { enabled: statusEnabled } });
    if (path === '/referral/validate') return validate(JSON.parse(opts.body));
    if (path.startsWith('/products/')) return J(200, { data: { gstSlab: 5 } });
    if (path === '/orders') return orderResponse ? orderResponse(JSON.parse(opts.body)) : J(201, { success: true, data: { orderNumber: 'SAG-1', billing: { grandTotal: 549 } } });
    return J(404, {});
  };
  w.eval(bundle); await tick(120);
  const $ = (id) => w.document.getElementById(id);
  // fill required fields
  for (const [id, v] of [['ship-name', 'Buyer'], ['phone', '9876543210'], ['address-line1', 'x'], ['city', 'Haridwar'], ['state', 'Uttarakhand'], ['pincode', '249403'], ['email', 'b@x.com']]) { const el = $(id); if (el) el.value = v; }
  return { w, $, calls, alerts };
}
const OK = (code, discount, grand, ship = 99, taxable = 428.57) => ({ ok: true, status: 200, json: async () => ({ success: true, data: { code, discount, billing: { grandTotal: grand, shippingCharge: ship, taxableAmount: taxable, subtotal: 500, referralDiscount: discount } } }) });
const BAD = { ok: false, status: 400, json: async () => ({ success: false, message: 'This code is not valid for this order' }) };
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

// 1. programme off (404): box hidden, legacy totals
let p = await page({});
t('programme off: referral box hidden', p.$('referral-box').style.display === 'none');
t('programme off: legacy total 599', p.$('checkout-total').textContent === '599', p.$('checkout-total').textContent);

// 2. enabled but DB setting off
p = await page({ statusEnabled: false });
t('enabled=false: box hidden', p.$('referral-box').style.display === 'none');

// 3. enabled: apply good code -> server figures shown
p = await page({ statusEnabled: true, validate: async () => OK('RHEA25', 50, 549) });
t('enabled: box visible, collapsed', p.$('referral-box').style.display === 'block' && p.$('referral-form').style.display === 'none');
click(p.w, p.$('referral-toggle')); p.$('referral-input').value = 'rhea25'; click(p.w, p.$('referral-apply')); await tick();
t('applied: total comes from the server (549)', p.$('checkout-total').textContent === '549', p.$('checkout-total').textContent);
t('applied: discount row shows code and amount', p.$('referral-row').style.display === 'flex' && /RHEA25/.test(p.$('referral-row-label').textContent) && /50/.test(p.$('referral-discount-amt').textContent));
t('applied: "Code applied" shown, input hidden', p.$('referral-applied').style.display === 'block' && p.$('referral-form').style.display === 'none');
const vc = p.calls.find((c) => c.path === '/referral/validate');
t('validate request has code + items, no amounts', vc.body.code === 'rhea25' && vc.body.items[0].productId === 'p1' && !('grandTotal' in vc.body) && !('discount' in vc.body));

// 4. place COD order -> payload carries the code
p.w.document.querySelector('[name="payment"][value="COD"]')?.setAttribute('checked', 'checked');
p.$('checkout-form').dispatchEvent(new p.w.Event('submit', { cancelable: true, bubbles: true })); await tick(150);
const oc = p.calls.find((c) => c.path === '/orders');
t('COD order payload includes referralCode', oc && oc.body.referralCode === 'RHEA25', JSON.stringify(oc?.body?.referralCode));

// 5. remove -> back to legacy totals
p = await page({ statusEnabled: true, validate: async () => OK('RHEA25', 50, 549) });
click(p.w, p.$('referral-toggle')); p.$('referral-input').value = 'RHEA25'; click(p.w, p.$('referral-apply')); await tick();
click(p.w, p.$('referral-remove')); await tick();
t('removed: total back to 599, row hidden', p.$('checkout-total').textContent === '599' && p.$('referral-row').style.display === 'none');
p.$('checkout-form').dispatchEvent(new p.w.Event('submit', { cancelable: true, bubbles: true })); await tick(150);
t('removed: order payload has no referralCode', !('referralCode' in p.calls.find((c) => c.path === '/orders').body));

// 6. invalid code: generic message, nothing changes
p = await page({ statusEnabled: true, validate: async () => BAD });
click(p.w, p.$('referral-toggle')); p.$('referral-input').value = 'WRONG'; click(p.w, p.$('referral-apply')); await tick();
t('invalid: generic message shown', p.$('referral-msg').textContent === 'This code is not valid for this order');
t('invalid: total unchanged', p.$('checkout-total').textContent === '599');

// 7. code becomes invalid at order time -> removed, totals refreshed, no silent re-charge
p = await page({ statusEnabled: true, validate: async () => OK('RHEA25', 50, 549),
  orderResponse: async () => ({ ok: false, status: 409, json: async () => ({ success: false, message: 'This code is not valid for this order', referralInvalid: true }) }) });
click(p.w, p.$('referral-toggle')); p.$('referral-input').value = 'RHEA25'; click(p.w, p.$('referral-apply')); await tick();
p.$('checkout-form').dispatchEvent(new p.w.Event('submit', { cancelable: true, bubbles: true })); await tick(150);
t('stale code: alert explains, code removed, total back to 599', p.alerts.length === 1 && /no longer valid/.test(p.alerts[0]) && p.$('checkout-total').textContent === '599');
t('stale code: Place Order button usable again', p.w.document.querySelector('#checkout-form [type="submit"]').disabled === false);

// 8. XSS: server-sent code text cannot inject markup
p = await page({ statusEnabled: true, validate: async () => OK('<img src=x onerror=alert(1)>', 50, 549) });
click(p.w, p.$('referral-toggle')); p.$('referral-input').value = 'X'; click(p.w, p.$('referral-apply')); await tick();
t('code label is text, not HTML', !p.w.document.querySelector('#referral-code-label img') && !p.w.document.querySelector('#referral-row-label img'));


// ?ref= link: stored code is applied automatically
p = await page({ statusEnabled: true, validate: async () => OK('RHEA25', 50, 549), storedRef: { code: 'RHEA25', at: Date.now() } });
await tick(150);
t('link: stored code auto-applied, total from server', p.$('checkout-total').textContent === '549' && p.$('referral-applied').style.display === 'block', p.$('checkout-total').textContent);
t('link: validate called once with the stored code', p.calls.filter((c) => c.path === '/referral/validate').length === 1 && p.calls.find((c) => c.path === '/referral/validate').body.code === 'RHEA25');
p.w.document.querySelector('[name="payment"][value="COD"]')?.setAttribute('checked', 'checked');
p.$('checkout-form').dispatchEvent(new p.w.Event('submit', { cancelable: true, bubbles: true })); await tick(200);
t('link: order carries the code and the stored link is forgotten after the order', p.calls.find((c) => c.path === '/orders')?.body.referralCode === 'RHEA25' && p.w.localStorage.getItem('sg_ref') === null);

p = await page({ statusEnabled: true, validate: async () => BAD, storedRef: { code: 'DEAD1', at: Date.now() } });
await tick(150);
t('link: a stored code that is no longer valid is dropped silently (no error shown, no discount, link forgotten)', p.$('referral-msg') ? p.$('referral-msg').textContent === '' : true);
t('link: dead code leaves legacy total and clears storage', p.$('checkout-total').textContent === '599' && p.w.localStorage.getItem('sg_ref') === null && p.$('referral-applied').style.display !== 'block');

p = await page({ statusEnabled: true, validate: async () => OK('RHEA25', 50, 549), storedRef: { code: 'RHEA25', at: Date.now() - 31 * 86400000 } });
await tick(150);
t('link: code older than 30 days is ignored and removed', !p.calls.some((c) => c.path === '/referral/validate') && p.w.localStorage.getItem('sg_ref') === null);

p = await page({ statusEnabled: true, validate: async () => OK('RHEA25', 50, 549), storedRef: { code: '<img src=x>', at: Date.now() } });
await tick(150);
t('link: malformed stored value is never sent to the server', !p.calls.some((c) => c.path === '/referral/validate'));

p = await page({ validate: async () => OK('RHEA25', 50, 549), storedRef: { code: 'RHEA25', at: Date.now() } });
await tick(150);
t('link: programme off -> stored code does nothing', !p.calls.some((c) => c.path === '/referral/validate') && p.$('checkout-total').textContent === '599');

console.log(results.join('\n')); process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
