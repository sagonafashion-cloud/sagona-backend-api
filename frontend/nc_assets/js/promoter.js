// Promoter self-service portal (read-only). Talks only to /api/promoter/*, which returns the
// logged-in promoter's own commission data: never customer names, contacts or order contents.
import { API_BASE, escapeHtml as esc } from './config.js';

const root = document.getElementById('pp-root');
const logoutBtn = document.getElementById('pp-logout');
const TOKEN_KEY = 'promoter_token';
const inr = (p) => `₹${((p || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (x) => (x ? new Date(x).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const token = () => sessionStorage.getItem(TOKEN_KEY);

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}/promoter${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && token()) { sessionStorage.removeItem(TOKEN_KEY); showLogin('Your session ended. Please log in again.'); throw new Error('session'); }
  if (!res.ok) throw new Error(json.message || 'Something went wrong');
  return json;
}

/* ── login ── */
function showLogin(note = '') {
  logoutBtn.style.display = 'none';
  root.innerHTML = `<div class="pp-card"><h3 style="margin-top:0">Log in</h3>
    <p style="font-size:13px;color:var(--gray)">Enter the email address you registered with. We will email you a 6-digit code.</p>
    <input class="pp-input" id="pp-email" type="email" autocomplete="email" placeholder="you@example.com"> <button class="btn gold" id="pp-send">Send code</button>
    <div id="pp-otp-box" style="display:none;margin-top:14px"><input class="pp-input" id="pp-otp" inputmode="numeric" maxlength="6" placeholder="6-digit code" autocomplete="one-time-code"> <button class="btn gold" id="pp-verify">Log in</button></div>
    <div class="pp-msg" id="pp-msg">${esc(note)}</div></div>`;
}
const msg = (t, bad = false) => { const m = document.getElementById('pp-msg'); if (m) { m.textContent = t; m.style.color = bad ? '#dc2626' : '#16a34a'; } };

async function sendCode() {
  const email = document.getElementById('pp-email').value.trim();
  if (!email) return msg('Enter your email', true);
  const btn = document.getElementById('pp-send'); btn.disabled = true;
  try {
    const r = await fetch(`${API_BASE}/promoter/auth/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    if (r.status === 404) return msg('The promoter dashboard is not available yet.', true);
    if (r.status === 429) return msg('Too many attempts. Please try again later.', true);
    document.getElementById('pp-otp-box').style.display = 'block';
    msg('If this email is registered, a code has been sent. It works for 10 minutes.');
  } catch { msg('Could not reach the server. Please try again.', true); } finally { btn.disabled = false; }
}
async function verifyCode() {
  const email = document.getElementById('pp-email').value.trim(), otp = document.getElementById('pp-otp').value.trim();
  const r = await fetch(`${API_BASE}/promoter/auth/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, otp }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return msg(r.status === 429 ? 'Too many attempts. Please try again later.' : (j.message || 'Invalid or expired code'), true);
  sessionStorage.setItem(TOKEN_KEY, j.token);
  start();
}

/* ── dashboard ── */
const TABS = [['overview', 'Overview'], ['codes', 'My codes & links'], ['orders', 'Orders'], ['payouts', 'Payouts'], ['statement', 'Statement'], ['settings', 'Settings']];
let tab = 'overview';
let me = null;

async function shell() {
  logoutBtn.style.display = 'inline-block';
  root.innerHTML = `<div class="pp-card" style="font-size:13px">Hello <b>${esc(me.name)}</b>. Commission is shown for your own referrals only.</div>
    <div class="pp-tabs">${TABS.map(([k, l]) => `<button class="btn ${k === tab ? 'gold' : 'ghost'}" data-tab="${k}">${l}</button>`).join('')}</div><div id="pp-body"></div>`;
  const body = document.getElementById('pp-body');
  body.innerHTML = '<div class="pp-card">Loading…</div>';
  try { body.innerHTML = await VIEWS[tab](); } catch (e) { if (e.message !== 'session') body.innerHTML = `<div class="pp-card">${esc(e.message)}</div>`; }
}

const table = (head, rows, empty) => `<div class="pp-card" style="overflow-x:auto"><table class="pp-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}">${empty}</td></tr>`}</tbody></table></div>`;

const VIEWS = {
  async overview() {
    const { data: d } = await api('/dashboard');
    const s = (label, v) => `<div class="pp-card pp-stat"><span>${label}</span><b>${v}</b></div>`;
    return `<div class="pp-grid">${s('Pending (return window open)', inr(d.pendingPaise))}${s('Payable (next payout)', inr(d.payablePaise))}${s('In an approved payout', inr(d.inApprovedPayoutPaise))}${s('Paid to you so far', inr(d.paidNetPaise))}${s('Orders with your code', d.referredOrders)}${s('Link clicks, last 30 days', d.clicks30d)}</div>
      <div class="pp-card" style="font-size:12px;color:var(--gray)">Commission stays pending until the return window after delivery is over. Cancelled or returned orders are reversed.</div>`;
  },
  async codes() {
    const { data } = await api('/codes');
    return table(['Code', 'Status', 'Your shareable link'], data.map((c) => `<tr><td><b>${esc(c.code)}</b></td><td>${esc(c.status)}</td><td><span class="pp-link">${esc(c.link)}</span> <button class="btn ghost" data-copy="${esc(c.link)}">Copy</button></td></tr>`), 'No codes yet. Contact SAGONA support.');
  },
  async orders() {
    const { data } = await api('/orders');
    return table(['Date', 'Code', 'Status', 'Commission'], data.map((o) => `<tr><td>${day(o.date)}</td><td>${esc(o.code)}</td><td>${esc(o.status)}</td><td>${inr(o.commissionPaise)}</td></tr>`), 'No orders yet.');
  },
  async payouts() {
    const { data } = await api('/payouts');
    return table(['Voucher', 'Date', 'Commission', 'GST', 'TDS', 'Net paid', 'Status', 'Bank ref'], data.map((p) => `<tr><td>${esc(p.voucherNo)}</td><td>${day(p.date)}</td><td>${inr(p.grossPaise)}</td><td>${inr(p.gstPaise)}</td><td>${inr(p.tdsPaise)}</td><td><b>${inr(p.netPaise)}</b></td><td>${esc(p.status)}</td><td>${esc(p.utr || '')}</td></tr>`), 'No payouts yet.');
  },
  async statement() {
    const to = new Date(), from = new Date(to.getFullYear(), to.getMonth(), 1);
    const iso = (d) => d.toISOString().slice(0, 10);
    const { data } = await api(`/statement?from=${iso(from)}&to=${iso(new Date(to.getTime() + 86400000))}`);
    const x = data.summary;
    return `<div class="pp-card"><b>This month so far</b><table class="pp-table" style="margin-top:8px"><tbody>
      <tr><td>Opening balance</td><td>${inr(x.openingPaise)}</td></tr><tr><td>Commission earned</td><td>${inr(x.accruedPaise)}</td></tr>
      <tr><td>Reversals</td><td>${inr(x.reversedPaise)}</td></tr><tr><td>Adjustments</td><td>${inr(x.adjustedPaise)}</td></tr><tr><td>Paid out</td><td>${inr(x.paidOutPaise)}</td></tr>
      <tr><td><b>Closing balance</b></td><td><b>${inr(x.closingPaise)}</b></td></tr></tbody></table></div>`;
  },
  async settings() {
    const { data: m } = await api('/me');
    return `<div class="pp-card"><table class="pp-table"><tbody>
      <tr><td>Name</td><td>${esc(m.name)}</td></tr><tr><td>Email</td><td>${esc(m.email)}</td></tr><tr><td>Mobile</td><td>${esc(m.mobile)}</td></tr>
      <tr><td>PAN</td><td>${m.panLast4 ? 'XXXXXX' + esc(m.panLast4) : 'Not on file'}</td></tr><tr><td>Bank account</td><td>${m.bankLast4 ? 'XXXXXX' + esc(m.bankLast4) : 'Not on file'}</td></tr>
      <tr><td>KYC / Agreement</td><td>${esc(m.kycStatus)} / ${esc(m.agreementStatus)}</td></tr></tbody></table>
      <p style="font-size:12px;color:var(--gray)">To change bank, PAN or contact details, contact SAGONA support.</p>
      <label style="font-size:13px"><input type="checkbox" id="pp-notify" ${m.notifyEmail ? 'checked' : ''}> Email me about new orders, payable commission and payouts</label></div>`;
  }
};

async function start() {
  if (!token()) return showLogin();
  try { me = (await api('/me')).data; } catch (e) { if (e.message !== 'session') showLogin(e.message); return; }
  shell();
}

root.addEventListener('click', async (e) => {
  const t = e.target.closest('button'); if (!t) return;
  try {
    if (t.id === 'pp-send') return sendCode();
    if (t.id === 'pp-verify') return verifyCode();
    if (t.dataset.tab) { tab = t.dataset.tab; return shell(); }
    if (t.dataset.copy) { await navigator.clipboard?.writeText(t.dataset.copy); t.textContent = 'Copied'; return; }
  } catch (err) { msg(err.message, true); }
});
root.addEventListener('change', async (e) => {
  if (e.target.id !== 'pp-notify') return;
  try { await api('/me/notifications', { method: 'PUT', body: { notifyEmail: e.target.checked } }); } catch { e.target.checked = !e.target.checked; }
});
root.addEventListener('keydown', (e) => { if (e.key === 'Enter') { if (e.target.id === 'pp-email') sendCode(); if (e.target.id === 'pp-otp') verifyCode().catch(() => {}); } });
logoutBtn.addEventListener('click', () => { sessionStorage.removeItem(TOKEN_KEY); tab = 'overview'; showLogin(); });

start();
