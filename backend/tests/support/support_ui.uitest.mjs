// jsdom test for the support form (needs jsdom, esbuild not required). node support_ui.uitest.mjs
import { JSDOM } from 'jsdom';
import fs from 'fs';
const FRONT = process.env.FRONTEND_DIR || new URL('../../../frontend', import.meta.url).pathname;
let html = fs.readFileSync(`${FRONT}/support.html`, 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/import \{ API_BASE \} from [^;]+;/, "const API_BASE = 'https://api.test/api';");
html = html.replace(/<script type="module">[\s\S]*?<\/script>/, '');
const results = []; const t = (n, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + n);
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
async function run({ contactStatus = 200, contactBody = { success: true } } = {}) {
  const dom = new JSDOM(html, { url: 'https://sagona.in/support.html', runScripts: 'outside-only' });
  const w = dom.window; const calls = []; const alerts = [];
  w.alert = (m) => alerts.push(m);
  let tokenN = 0;
  w.fetch = async (u, o = {}) => {
    calls.push({ u: String(u), body: o.body ? JSON.parse(o.body) : undefined });
    if (String(u).endsWith('/support/token')) return { ok: true, status: 200, json: async () => ({ success: true, token: `tok${++tokenN}` }) };
    return { ok: contactStatus < 400, status: contactStatus, json: async () => contactBody };
  };
  w.eval(script.replace(/^\s*import[^\n]*\n/gm, '')); await tick();
  const $ = (id) => w.document.getElementById(id);
  $('s-name').value = 'Priya Sharma'; $('s-email').value = 'p@example.com'; $('s-message').value = 'Where is my order please?';
  $('support-form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); await tick(80);
  return { w, $, calls, alerts };
}
let r = await run();
const post = r.calls.find((c) => c.u.endsWith('/support/contact'));
t('token requested when the page loads', r.calls[0].u.endsWith('/support/token'));
t('submit sends the token and an empty honeypot', post.body.formToken === 'tok1' && post.body.website === '');
t('honeypot field exists, is hidden from people and from tab order', !!r.$('s-website') && r.$('s-website').tabIndex === -1 && r.$('s-website').closest('[aria-hidden="true"]') !== null);
t('success: message shown, form reset, fresh token fetched for next time', r.$('s-success').style.display === 'block' && r.$('s-name').value === '' && r.calls.filter((c) => c.u.endsWith('/support/token')).length === 2);
r = await run({ contactStatus: 429, contactBody: { success: false, message: 'Too many messages sent. Please try again in an hour.' } });
t('rate-limited: honest error shown, NO success banner, form kept', r.alerts.some((a) => /Too many messages/.test(a)) && r.$('s-success').style.display !== 'block' && r.$('s-name').value === 'Priya Sharma');
r = await run({ contactStatus: 500, contactBody: {} });
t('server error: told to email care@sagona.in, no false success', r.alerts.some((a) => /care@sagona\.in/.test(a)) && r.$('s-success').style.display !== 'block');
console.log(results.join('\n')); process.exit(results.some((x) => x.startsWith('FAIL')) ? 1 : 0);
