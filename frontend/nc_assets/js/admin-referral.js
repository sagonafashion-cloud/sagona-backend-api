// Admin screens for the Referral & Promoter programme (Phase 1).
// Loaded on demand from admin.js (dynamic import) so the main admin bundle is
// unchanged when the programme is off. All data comes from /api/admin/promoters/*.
import { API_BASE, escapeHtml as esc } from './config.js';

const CATS = ['kids', 'women', 'men', 'accessories'];
const pct = (bps) => (bps == null ? '—' : `${(bps / 100).toFixed(2).replace(/\.00$/, '')}%`);
const inr = (paise) => (paise == null || paise === '' ? '—' : `₹${(paise / 100).toLocaleString('en-IN')}`);
const d = (x) => (x ? new Date(x).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—');
const dt = (x) => (x ? new Date(x).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const pill = (txt, good, warn) =>
  `<span class="pill ${good ? 'pill-delivered' : warn ? 'pill-placed' : 'pill-cancelled'}">${esc(String(txt)).toUpperCase()}</span>`;

const SETTING_LABELS = {
  enabled: ['Programme enabled (storefront field + validate API)', 'bool'],
  return_window_days: ['Return window (days after delivery)', 'int'],
  min_payout_paise: ['Minimum payout (₹)', 'rupees'],
  payout_day: ['Payout day of month (1-28)', 'int'],
  commission_base: ['Commission base', ['NET_EX_GST', 'LIST_EX_GST', 'NET_INCL_GST']],
  margin_guard_max_pct: ['Margin guard: max discount % + commission %', 'num'],
  margin_guard_mode: ['Margin guard mode', ['warn', 'block']],
  store_state_code: ['Store GST state code (2 digits, e.g. 05)', 'text'],
  tds_enabled: ['TDS enabled (confirm with CA)', 'bool'],
  tds_section: ['TDS section label', 'text'],
  tds_rate_bps: ['TDS rate (%)', 'pct'],
  tds_annual_threshold_paise: ['TDS annual threshold (₹)', 'rupees'],
  gst_on_commission_bps: ['GST on commission, registered promoters (%)', 'pct'],
  reevaluate_gst_slab: ['Re-evaluate GST slab on discounted price (CA to confirm)', 'bool'],
  slab_threshold_paise: ['Slab threshold: per-piece value (₹) at or below which the low rate applies', 'rupees'],
  slab_low_rate: ['Slab low rate (%)', 'int'],
  slab_high_rate: ['Slab high rate (%)', 'int'],
  fraud_velocity_orders_24h: ['Fraud: orders per code per 24h', 'int'],
  fraud_return_rate_alert_pct: ['Fraud: return-rate alert %', 'num'],
  agreement_template_version: ['Current agreement version', 'text'],
  agreement_grace_days: ['Agreement re-acceptance grace (days)', 'int'],
  terms_url: ['Programme terms URL', 'text'],
  support_contact: ['Support contact', 'text']
};

export async function loadPromoters(ctx) {
  const { api, toast, closeModal } = ctx;
  // Wrap modal content so this module's delegated handlers never react to other sections' modals.
  const openModal = (html) => ctx.openModal(`<div data-refmodal>${html}</div>`);
  const root = document.getElementById('ref-root');
  let canWrite = false;
  let tab = 'promoters';
  let promotersCache = [];

  const call = async (path, opts = {}) => api(`/admin/promoters${path}`, opts.body && !(opts.body instanceof FormData) ? { ...opts, body: JSON.stringify(opts.body) } : opts);
  const fail = (e) => toast(e.message || 'Request failed', 'error');

  try {
    const ping = await call('/ping');
    canWrite = !!ping.data.canWrite;
    root.innerHTML = `
      <div class="admin-card" style="padding:10px 14px;font-size:12px;margin-bottom:12px">
        Programme: ${pill(ping.data.programmeEnabled ? 'ON' : 'OFF (storefront hidden)', ping.data.programmeEnabled, false)}
        ${ping.data.encryptionConfigured ? '' : pill('Encryption key missing', false, false)}
        <span style="color:var(--gray);margin-left:8px">Tax rates and thresholds here are configurable; confirm them with your CA.</span>
      </div>
      <div id="ref-tabs" style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap"></div>
      <div id="ref-body"></div>`;
  } catch (e) {
    root.innerHTML = `<div class="admin-card" style="padding:16px">The referral module is not available${e.message ? ': ' + esc(e.message) : ''}.</div>`;
    return;
  }

  const TABS = [['promoters', 'Promoters'], ['codes', 'Referral Codes'], ['rates', 'Commission Rates'], ['orders', 'Referred Orders'], ['ledger', 'Commission Ledger'], ['payouts', 'Payouts'], ['settings', 'Settings'], ['audit', 'Audit Log']];
  const drawTabs = () => {
    document.getElementById('ref-tabs').innerHTML = TABS.map(([k, l]) =>
      `<button class="btn ${tab === k ? 'gold' : 'ghost'}" data-tab="${k}" style="padding:7px 14px;font-size:11px">${l}</button>`).join('');
  };
  const body = () => document.getElementById('ref-body');

  /* ── Promoters ── */
  async function showPromoters(q = '', status = '') {
    body().innerHTML = '<div class="loading">Loading…</div>';
    const qs = new URLSearchParams({ limit: '100', ...(q ? { q } : {}), ...(status ? { status } : {}) });
    const res = await call(`/?${qs}`);
    promotersCache = res.data;
    body().innerHTML = `
      <div class="section-header" style="margin-bottom:8px">
        <div style="display:flex;gap:8px">
          <input id="ref-q" placeholder="Search name / mobile / email" value="${esc(q)}" style="padding:7px">
          <select id="ref-status" style="padding:7px"><option value="">All statuses</option>${['pending', 'active', 'suspended', 'terminated'].map((s) => `<option ${s === status ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <button class="btn ghost" id="ref-search" style="padding:7px 12px;font-size:11px">Search</button>
        </div>
        ${canWrite ? '<button class="btn gold" id="ref-add-promoter">+ Add Promoter</button>' : ''}
      </div>
      <div class="admin-card"><table class="admin-table"><thead><tr><th>Name</th><th>Mobile</th><th>Status</th><th>KYC</th><th>Agreement</th><th>PAN</th><th>GST</th><th></th></tr></thead><tbody>
      ${res.data.map((p) => `<tr>
        <td>${esc(p.name)}${p.bankNameMismatch ? ' <span title="Bank account holder name differs from promoter name" style="color:#dc2626">⚠</span>' : ''}</td>
        <td>${esc(p.mobile)}</td>
        <td>${pill(p.status, p.status === 'active', p.status === 'pending')}</td>
        <td>${pill(p.kycStatus, p.kycStatus === 'verified', p.kycStatus === 'pending')}</td>
        <td>${pill(p.agreementStatus, p.agreementStatus === 'signed', ['sent', 'not_sent'].includes(p.agreementStatus))}</td>
        <td>${esc(p.pan) || '<span style="color:#dc2626">missing</span>'}</td>
        <td>${p.gstRegistered ? esc(p.gstin) : 'No'}</td>
        <td><button class="btn ghost" data-view="${esc(p._id)}" style="padding:5px 10px;font-size:10px">Open</button></td></tr>`).join('') || '<tr><td colspan="8" class="loading">No promoters yet.</td></tr>'}
      </tbody></table></div>`;
  }

  function promoterForm(p = {}) {
    const f = (id, label, val = '', type = 'text', ph = '') =>
      `<div><label>${label}</label><input id="${id}" type="${type}" value="${esc(val)}" placeholder="${esc(ph)}"></div>`;
    return `
      <h3>${p._id ? 'Edit' : 'Add'} Promoter</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${f('pf-name', 'Full name *', p.name)}${f('pf-mobile', 'Mobile *', p.mobile)}
        ${f('pf-email', 'Email', p.email)}${f('pf-dob', 'Date of birth * (18+)', p.dob ? p.dob.slice(0, 10) : '', 'date')}
        ${f('pf-pan', `PAN ${p.pan ? '(current ' + p.pan + ', leave blank to keep)' : ''}`, '', 'text', 'ABCDE1234F')}
        ${f('pf-state', 'GST state code', p.stateCode, 'text', '05')}
        ${f('pf-bank', `Bank account ${p.bankAccount ? '(current ' + p.bankAccount + ')' : ''}`, '', 'text')}
        ${f('pf-ifsc', 'IFSC', p.bankIfsc)}
        ${f('pf-holder', 'Account holder name (must be the promoter)', p.bankHolderName)}
        ${f('pf-audience', 'Audience size', p.audienceSize ?? '', 'number')}
        <div><label>GST registered?</label><select id="pf-gstreg"><option value="0">No</option><option value="1" ${p.gstRegistered ? 'selected' : ''}>Yes</option></select></div>
        ${f('pf-gstin', `GSTIN ${p.gstin ? '(current ' + p.gstin + ')' : ''}`, '')}
        ${f('pf-line1', 'Address line 1', p.address?.line1)}${f('pf-city', 'City', p.address?.city)}
        ${f('pf-pin', 'Pincode', p.address?.pincode)}
        <div><label>Instagram / social handle</label><input id="pf-handle" value="${esc(p.socialHandles?.[0]?.handle || '')}"></div>
        <div><label><input type="checkbox" id="pf-tds" ${p.tdsApplicable ? 'checked' : ''}> TDS applicable</label></div>
        <div><label><input type="checkbox" id="pf-gstc" ${p.gstOnCommissionApplicable ? 'checked' : ''}> GST on commission applicable</label></div>
      </div>
      <label>Notes</label><textarea id="pf-notes" rows="2" style="width:100%">${esc(p.notes || '')}</textarea>
      <div style="margin-top:12px;text-align:right"><button class="btn gold" id="pf-save" data-id="${esc(p._id || '')}">Save</button></div>`;
  }

  function readPromoterForm() {
    const v = (id) => document.getElementById(id).value.trim();
    const o = {
      name: v('pf-name'), mobile: v('pf-mobile'), email: v('pf-email'), dob: v('pf-dob'), stateCode: v('pf-state'),
      bankIfsc: v('pf-ifsc'), bankHolderName: v('pf-holder'), notes: v('pf-notes'),
      gstRegistered: v('pf-gstreg') === '1',
      address: { line1: v('pf-line1'), city: v('pf-city'), pincode: v('pf-pin') },
      socialHandles: v('pf-handle') ? [{ platform: 'instagram', handle: v('pf-handle') }] : [],
      tdsApplicable: document.getElementById('pf-tds').checked,
      gstOnCommissionApplicable: document.getElementById('pf-gstc').checked
    };
    if (v('pf-audience')) o.audienceSize = Number(v('pf-audience'));
    for (const [k, id] of [['pan', 'pf-pan'], ['bankAccount', 'pf-bank'], ['gstin', 'pf-gstin']]) if (v(id)) o[k] = v(id);
    return o;
  }

  async function openPromoter(id) {
    const { data: p } = await call(`/${id}`);
    const btn = (label, attrs, danger) => `<button class="btn ghost" ${attrs} style="padding:5px 10px;font-size:10px;${danger ? 'color:#dc2626' : ''}">${label}</button>`;
    openModal(`
      <h3>${esc(p.name)} ${pill(p.status, p.status === 'active', p.status === 'pending')}</h3>
      <div style="font-size:12px;line-height:1.9">
        Mobile: ${esc(p.mobile)} · Email: ${esc(p.email) || '—'} · DOB: ${d(p.dob)}<br>
        PAN: ${esc(p.pan) || '<b style="color:#dc2626">missing</b>'} · GSTIN: ${p.gstRegistered ? esc(p.gstin) : 'not registered'} ·
        Bank: ${esc(p.bankAccount) || '—'} ${esc(p.bankIfsc) || ''} (${esc(p.bankHolderName) || '—'})
        ${p.bankNameMismatch ? '<b style="color:#dc2626">⚠ holder name differs from promoter</b>' : ''}<br>
        KYC: ${pill(p.kycStatus, p.kycStatus === 'verified', p.kycStatus === 'pending')} ${esc(p.kycNotes) || ''}<br>
        Agreement: ${pill(p.agreementStatus, p.agreementStatus === 'signed', true)} ${esc(p.agreementVersion) || ''} ${d(p.agreementSignedAt)}<br>
        Strikes: ${(p.strikes || []).length} · Codes: ${(p.codes || []).map((c) => esc(c.code) + ' (' + esc(c.status) + ')').join(', ') || 'none'}
      </div>
      ${canWrite ? `<hr><div style="display:flex;gap:6px;flex-wrap:wrap">
        ${btn('Edit', `data-edit="${esc(p._id)}"`)}
        ${btn('KYC: verify', `data-kyc="verified" data-id="${esc(p._id)}"`)}${btn('KYC: reject', `data-kyc="rejected" data-id="${esc(p._id)}"`, true)}
        ${btn('Agreement: sent', `data-agr="sent" data-id="${esc(p._id)}"`)}${btn('Agreement: signed', `data-agr="signed" data-id="${esc(p._id)}"`)}
        ${btn('Activate', `data-st="active" data-id="${esc(p._id)}"`)}${btn('Suspend', `data-st="suspended" data-id="${esc(p._id)}"`, true)}${btn('Terminate', `data-st="terminated" data-id="${esc(p._id)}"`, true)}
        ${btn('Add strike', `data-strike="${esc(p._id)}"`, true)}${btn('Reveal PAN/bank', `data-reveal="${esc(p._id)}"`)}
      </div>
      <hr><b style="font-size:12px">Documents (encrypted)</b>
      <ul style="font-size:12px">${(p.documents || []).map((x) => `<li>${esc(x.type)} · ${esc(x.filename)} · ${d(x.createdAt)} <a href="#" data-doc="${esc(x._id)}" data-pid="${esc(p._id)}" data-fn="${esc(x.filename)}">download</a></li>`).join('') || '<li>none</li>'}</ul>
      <div style="display:flex;gap:6px;align-items:center"><select id="doc-type">${['pan', 'bank_proof', 'gst_certificate', 'id_proof', 'agreement'].map((t) => `<option>${t}</option>`).join('')}</select>
        <input type="file" id="doc-file" accept=".pdf,.png,.jpg,.jpeg"> ${btn('Upload', `data-upload="${esc(p._id)}"`)}</div>` : ''}`);
  }

  /* ── Codes ── */
  async function showCodes(status = '') {
    body().innerHTML = '<div class="loading">Loading…</div>';
    const res = await call(`/codes?limit=100${status ? '&status=' + status : ''}`);
    body().innerHTML = `
      <div class="section-header" style="margin-bottom:8px"><div><select id="code-status" style="padding:7px"><option value="">All</option>${['active', 'paused', 'expired'].map((s) => `<option ${s === status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        ${canWrite ? '<div><button class="btn gold" id="code-add">+ New Code</button> <button class="btn ghost" id="code-bulk">Bulk create</button></div>' : ''}</div>
      <div class="admin-card"><table class="admin-table"><thead><tr><th>Code</th><th>Promoter</th><th>Discount</th><th>Min order</th><th>Cap</th><th>Valid</th><th>Used</th><th>Status</th><th></th></tr></thead><tbody>
      ${res.data.map((c) => `<tr><td><b>${esc(c.code)}</b></td><td>${esc(c.promoterId?.name)}</td>
        <td>${c.discountType === 'percent' ? pct(c.discountValue) : inr(c.discountValue)}</td><td>${inr(c.minOrderPaise)}</td><td>${inr(c.discountCapPaise)}</td>
        <td>${d(c.validFrom)} → ${d(c.validTo)}</td><td>${c.timesUsed}${c.usageLimitTotal ? ' / ' + c.usageLimitTotal : ''}</td>
        <td>${pill(c.status, c.status === 'active', c.status === 'paused')}${c.pausedReason ? ' <span style="font-size:10px;color:var(--gray)">' + esc(c.pausedReason) + '</span>' : ''}</td>
        <td>${canWrite ? (c.status === 'active' ? `<button class="btn ghost" data-pause="${esc(c._id)}" style="padding:4px 8px;font-size:10px">Pause</button>` : c.status === 'paused' ? `<button class="btn ghost" data-resume="${esc(c._id)}" style="padding:4px 8px;font-size:10px">Resume</button>` : '')
          + (c.status !== 'expired' ? ` <button class="btn ghost" data-expire="${esc(c._id)}" style="padding:4px 8px;font-size:10px;color:#dc2626">Expire</button>` : '') : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="loading">No codes yet.</td></tr>'}
      </tbody></table></div>`;
  }

  async function codeForm(bulk) {
    const { data } = await call('/?limit=100');
    const opts = data.filter((p) => p.status !== 'terminated').map((p) => `<option value="${esc(p._id)}">${esc(p.name)} (${esc(p.status)})</option>`).join('');
    openModal(`
      <h3>${bulk ? 'Bulk create codes' : 'New referral code'}</h3>
      <label>Promoter</label><select id="cf-promoter">${opts}</select>
      ${bulk ? '<label>Prefix (optional, ≤8, no I/L/O)</label><input id="cf-prefix"><label>How many (max 200)</label><input id="cf-count" type="number" value="10">'
        : '<label>Code (leave blank for random)</label><input id="cf-code" placeholder="e.g. RHEA25">'}
      <label>Discount type</label><select id="cf-type"><option value="percent">Percent</option><option value="flat">Flat ₹</option></select>
      <label>Discount value (% or ₹)</label><input id="cf-value" type="number" step="0.01" value="10">
      <label>Max discount per order (₹, optional)</label><input id="cf-cap" type="number">
      <label>Minimum order value (₹, optional)</label><input id="cf-min" type="number">
      <label>Valid from / to</label><div style="display:flex;gap:6px"><input id="cf-from" type="date"><input id="cf-to" type="date"></div>
      <label>Total uses limit / per customer (blank = unlimited)</label><div style="display:flex;gap:6px"><input id="cf-total" type="number"><input id="cf-per" type="number"></div>
      <label>Categories (none ticked = all)</label><div>${CATS.map((c) => `<label style="margin-right:10px"><input type="checkbox" class="cf-cat" value="${c}"> ${c}</label>`).join('')}</div>
      <label><input type="checkbox" id="cf-sale" checked> Exclude already-discounted items</label>
      <div style="margin-top:12px;text-align:right"><button class="btn gold" id="cf-save" data-bulk="${bulk ? 1 : 0}">Create</button></div>`);
  }

  function readCodeForm(bulk) {
    const v = (id) => document.getElementById(id).value.trim();
    const type = v('cf-type');
    const money = (id) => (v(id) === '' ? undefined : Math.round(Number(v(id)) * 100));
    const o = {
      promoterId: v('cf-promoter'), discountType: type,
      discountValue: Math.round(Number(v('cf-value')) * 100),     // % -> bps, ₹ -> paise
      discountCapPaise: money('cf-cap'), minOrderPaise: money('cf-min'),
      validFrom: v('cf-from') || undefined, validTo: v('cf-to') ? `${v('cf-to')}T23:59:59+05:30` : undefined,
      usageLimitTotal: v('cf-total') === '' ? undefined : Number(v('cf-total')),
      usageLimitPerCustomer: v('cf-per') === '' ? undefined : Number(v('cf-per')),
      categoryScope: [...document.querySelectorAll('.cf-cat:checked')].map((x) => x.value),
      excludeSaleItems: document.getElementById('cf-sale').checked
    };
    if (bulk) { o.count = Number(v('cf-count')); o.prefix = v('cf-prefix'); } else if (v('cf-code')) o.code = v('cf-code');
    return o;
  }

  /* ── Rates ── */
  async function showRates() {
    body().innerHTML = '<div class="loading">Loading…</div>';
    const [hist, pr] = await Promise.all([call('/rates'), call('/?limit=100')]);
    const eff = {};
    for (const c of [null, ...CATS]) {
      eff[c || 'all'] = (await call(`/rates/effective${c ? '?category=' + c : ''}`)).data;
    }
    body().innerHTML = `
      <div class="admin-card" style="padding:12px;margin-bottom:12px"><b style="font-size:12px">Rates in effect today (default, all promoters)</b>
        <div style="display:flex;gap:18px;margin-top:6px;font-size:13px">${['all', ...CATS].map((c) => `<div>${c === 'all' ? 'Fallback' : esc(c)}: <b>${eff[c] ? pct(eff[c].rateBps) : '—'}</b></div>`).join('')}</div></div>
      ${canWrite ? `<div class="admin-card" style="padding:12px;margin-bottom:12px"><b style="font-size:12px">Add a new rate (history is kept; nothing is overwritten)</b>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:end">
          <div><label>Category</label><select id="rt-cat"><option value="">All categories</option>${CATS.map((c) => `<option>${c}</option>`).join('')}</select></div>
          <div><label>Promoter override</label><select id="rt-pr"><option value="">Default (everyone)</option>${pr.data.map((p) => `<option value="${esc(p._id)}">${esc(p.name)}</option>`).join('')}</select></div>
          <div><label>Rate %</label><input id="rt-rate" type="number" step="0.01" style="width:90px"></div>
          <div><label>Effective from</label><input id="rt-from" type="date"></div>
          <div><label>Note</label><input id="rt-note"></div>
          <button class="btn gold" id="rt-save">Add rate</button></div></div>` : ''}
      <div class="admin-card"><table class="admin-table"><thead><tr><th>Effective from</th><th>Category</th><th>Promoter</th><th>Rate</th><th>Note</th><th>Added</th></tr></thead><tbody>
      ${hist.data.map((r) => `<tr><td>${d(r.effectiveFrom)}</td><td>${esc(r.category) || 'all'}</td><td>${r.promoterId ? esc(pr.data.find((p) => p._id === r.promoterId)?.name || String(r.promoterId).slice(-6)) : 'default'}</td><td><b>${pct(r.rateBps)}</b></td><td>${esc(r.note) || ''}</td><td>${dt(r.createdAt)}</td></tr>`).join('') || '<tr><td colspan="6" class="loading">No rates set. Until a rate exists, commission is 0.</td></tr>'}
      </tbody></table></div>`;
  }


  /* ── Referred orders (read-only; customer shown masked) ── */
  async function showOrders(promoterId = '', code = '') {
    body().innerHTML = '<div class="loading">Loading…</div>';
    const qs = new URLSearchParams({ limit: '100', ...(promoterId ? { promoterId } : {}), ...(code ? { code } : {}) });
    const [res, pr] = await Promise.all([call(`/orders?${qs}`), call('/?limit=100')]);
    body().innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <select id="ro-promoter" style="padding:7px"><option value="">All promoters</option>${pr.data.map((p) => `<option value="${esc(p._id)}" ${p._id === promoterId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <input id="ro-code" placeholder="Code" value="${esc(code)}" style="padding:7px;width:120px">
        <button class="btn ghost" id="ro-go" style="padding:7px 12px;font-size:11px">Filter</button></div>
      <div class="admin-card"><table class="admin-table"><thead><tr><th>Order</th><th>Date</th><th>Promoter</th><th>Code</th><th>Customer</th><th>List value</th><th>Discount</th><th>Taxable</th><th>GST</th><th>Shipping</th><th>Commission</th><th>Order status</th></tr></thead><tbody>
      ${res.data.map((r) => `<tr><td>${esc(r.orderNumber)}</td><td>${d(r.orderDate)}</td><td>${esc(r.promoter)}</td><td><b>${esc(r.code)}</b></td><td>${esc(r.customer)}</td>
        <td>${inr(r.grossPaise)}</td><td>-${inr(r.discountPaise)}</td><td>${inr(r.taxablePaise)}</td><td>${inr(r.gstPaise)}</td><td>${inr(r.shippingPaise)}</td>
        <td>${inr(r.commissionPaise)}${r.flags?.noRate ? ' <span title="No commission rate was set for this order" style="color:#dc2626">⚠</span>' : ''}</td>
        <td>${pill(r.orderStatus || '—', r.orderStatus === 'delivered', !['cancelled', 'returned'].includes(r.orderStatus))}${r.referralStatus === 'void' ? ' <span style="font-size:10px;color:var(--gray)">void</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="12" class="loading">No referred orders yet.</td></tr>'}
      </tbody></table></div>`;
  }

  /* ── Commission ledger (append-only) ── */
  async function showLedger(promoterId = '') {
    body().innerHTML = '<div class="loading">Loading…</div>';
    const [bal, led, pr] = await Promise.all([call('/ledger/balances'), call(`/ledger?limit=100${promoterId ? '&promoterId=' + promoterId : ''}`), call('/?limit=100')]);
    const names = new Map(pr.data.map((p) => [p._id, p.name]));
    body().innerHTML = `
      <div class="admin-card" style="padding:12px;margin-bottom:12px"><b style="font-size:12px">Balances (sum of the ledger)</b>
        <table class="admin-table" style="margin-top:6px"><thead><tr><th>Promoter</th><th>Pending (return window open)</th><th>Payable</th></tr></thead><tbody>
        ${bal.data.map((b) => `<tr><td>${esc(b.name || b.promoterId)}</td><td>${inr(b.pendingPaise)}</td><td><b>${inr(b.payablePaise)}</b></td></tr>`).join('') || '<tr><td colspan="3" class="loading">No commission yet.</td></tr>'}
        </tbody></table></div>
      ${canWrite ? `<div class="admin-card" style="padding:12px;margin-bottom:12px"><b style="font-size:12px">Manual adjustment (adds a new entry; reason required; audited)</b>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:end">
          <div><label>Promoter</label><select id="adj-pr">${pr.data.map((p) => `<option value="${esc(p._id)}">${esc(p.name)}</option>`).join('')}</select></div>
          <div><label>Amount ₹ (negative to deduct)</label><input id="adj-amt" type="number" step="0.01" style="width:140px"></div>
          <div><label>Bucket</label><select id="adj-bucket"><option value="payable">Payable</option><option value="pending">Pending</option></select></div>
          <div style="flex:1"><label>Reason</label><input id="adj-reason" style="width:100%"></div>
          <button class="btn gold" id="adj-save">Add entry</button></div></div>` : ''}
      <div style="margin-bottom:8px"><select id="led-promoter" style="padding:7px"><option value="">All promoters</option>${pr.data.map((p) => `<option value="${esc(p._id)}" ${p._id === promoterId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="admin-card"><table class="admin-table"><thead><tr><th>When</th><th>Promoter</th><th>Type</th><th>Bucket</th><th>Amount</th><th>Reason</th></tr></thead><tbody>
      ${led.data.map((e) => `<tr><td>${dt(e.eventAt)}</td><td>${esc(names.get(String(e.promoterId)) || '')}</td><td>${esc(e.entryType)}</td><td>${esc(e.bucket)}</td>
        <td style="color:${e.amountPaise < 0 ? '#dc2626' : '#16a34a'}">${e.amountPaise < 0 ? '-' : '+'}${inr(Math.abs(e.amountPaise))}</td><td>${esc(e.reason) || ''}</td></tr>`).join('') || '<tr><td colspan="6" class="loading">Nothing yet.</td></tr>'}
      </tbody></table></div>`;
  }


  /* ── Payouts (Phase 3): preview -> draft batch -> approve -> bank file -> mark paid ── */
  const download = (name, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const statusPill = (s) => pill(s, s === 'paid', ['draft', 'approved'].includes(s));

  async function showPayouts() {
    body().innerHTML = '<div class="loading">Loading…</div>';
    const [pv, bt, pr] = await Promise.all([call('/payouts/preview'), call('/payouts'), call('/?limit=100')]);
    const eligible = pv.data.filter((x) => x.eligible);
    body().innerHTML = `
      <div class="admin-card" style="padding:12px;margin-bottom:12px"><b style="font-size:12px">Ready to pay now (financial year ${esc(pv.fy)})</b>
        <table class="admin-table" style="margin-top:6px"><thead><tr><th>Promoter</th><th>Commission</th><th>GST</th><th>TDS</th><th>Net to pay</th><th>Status</th></tr></thead><tbody>
        ${pv.data.map((x) => `<tr><td>${esc(x.name)}</td><td>${inr(x.grossPaise)}</td><td>${inr(x.gstPaise)}</td><td>${inr(x.tdsPaise)}</td><td><b>${inr(x.netPaise)}</b></td>
          <td>${x.eligible ? pill('Eligible', true, false) : `<span style="font-size:11px;color:var(--gray)">${esc(x.blockers.join('; '))}</span>`}</td></tr>`).join('') || '<tr><td colspan="6" class="loading">Nothing payable yet.</td></tr>'}
        </tbody></table>
        ${canWrite ? `<div style="margin-top:10px;text-align:right"><button class="btn gold" id="po-create" ${eligible.length ? '' : 'disabled'}>Create draft batch (${eligible.length})</button></div>` : ''}
      </div>
      <div class="admin-card" style="margin-bottom:12px"><table class="admin-table"><thead><tr><th>Batch</th><th>Created</th><th>Items</th><th>Commission</th><th>Net</th><th>Status</th><th></th></tr></thead><tbody>
        ${bt.data.map((b) => `<tr><td>${esc(b.batchNo)}</td><td>${d(b.createdAt)}</td><td>${b.itemCount}</td><td>${inr(b.grossPaise)}</td><td>${inr(b.netPaise)}</td><td>${statusPill(b.status)}</td>
          <td><button class="btn" data-po-open="${esc(b._id)}">Open</button></td></tr>`).join('') || '<tr><td colspan="7" class="loading">No batches yet.</td></tr>'}
      </tbody></table></div>
      <div id="po-detail"></div>
      <div class="admin-card" style="padding:12px;margin-bottom:12px"><b style="font-size:12px">Statements and accounting exports</b>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:end">
          <div><label>Promoter</label><select id="st-pr">${pr.data.map((p) => `<option value="${esc(p._id)}">${esc(p.name)}</option>`).join('')}</select></div>
          <div><label>From</label><input id="st-from" type="date"></div><div><label>To</label><input id="st-to" type="date"></div>
          <button class="btn" id="st-go">Show statement</button>
          <div style="margin-left:auto"><label>Financial year</label><input id="ex-fy" placeholder="2026-27" style="width:90px"></div>
          <button class="btn" id="ex-pay">Payouts CSV</button><button class="btn" id="ex-tds">TDS CSV</button>
        </div><div id="st-out" style="margin-top:10px"></div></div>`;
  }

  async function openBatch(id) {
    const { data: b } = await call(`/payouts/${id}`);
    const box = document.getElementById('po-detail');
    box.innerHTML = `<div class="admin-card" style="padding:12px;margin-bottom:12px" data-batch="${esc(b._id)}">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><b>${esc(b.batchNo)} ${statusPill(b.status)}</b><span>
        ${canWrite && b.status === 'draft' ? '<button class="btn gold" id="po-approve">Approve and reserve funds</button>' : ''}
        ${canWrite && b.status === 'approved' ? '<button class="btn" id="po-bank">Download bank file</button> <button class="btn gold" id="po-paid">Mark paid</button>' : ''}
        ${canWrite && ['draft', 'approved'].includes(b.status) ? '<button class="btn" id="po-cancel">Cancel batch</button>' : ''}</span></div>
      <table class="admin-table" style="margin-top:8px"><thead><tr><th>Voucher</th><th>Promoter</th><th>Commission</th><th>GST</th><th>TDS</th><th>Net</th><th>Status</th><th>UTR</th><th></th></tr></thead><tbody>
      ${b.items.map((i) => `<tr><td>${esc(i.voucherNo)}</td><td>${esc(i.promoterName)}</td><td>${inr(i.grossPaise)}</td><td>${inr(i.gstPaise)}</td><td>${inr(i.tdsPaise)}</td><td><b>${inr(i.netPaise)}</b></td><td>${statusPill(i.status)}</td>
        <td>${i.status === 'approved' && canWrite ? `<input data-utr="${esc(i._id)}" placeholder="UTR" style="width:130px">` : esc(i.utr || '')}</td>
        <td>${i.status === 'approved' && canWrite ? `<button class="btn" data-po-fail="${esc(i._id)}">Failed</button>` : esc(i.failureReason || '')}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  /* ── Settings ── */
  async function showSettings() {
    const { data } = await call('/settings');
    const s = data.settings;
    const row = ([k, [label, type]]) => {
      const val = s[k];
      let input;
      if (type === 'bool') input = `<select data-k="${k}" data-t="bool"><option value="0">No</option><option value="1" ${val ? 'selected' : ''}>Yes</option></select>`;
      else if (Array.isArray(type)) input = `<select data-k="${k}" data-t="text">${type.map((o) => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
      else {
        const shown = type === 'rupees' ? val / 100 : type === 'pct' ? val / 100 : val;
        input = `<input data-k="${k}" data-t="${type}" value="${esc(shown)}" ${type === 'text' ? '' : 'type="number" step="0.01"'}>`;
      }
      return `<tr><td style="font-size:12px">${label}</td><td>${input}</td></tr>`;
    };
    body().innerHTML = `<div class="admin-card"><table class="admin-table"><tbody>${Object.entries(SETTING_LABELS).map(row).join('')}</tbody></table>
      ${canWrite ? '<div style="padding:12px;text-align:right"><button class="btn gold" id="set-save">Save settings</button></div>' : ''}</div>`;
  }

  function readSettings() {
    const out = {};
    document.querySelectorAll('#ref-body [data-k]').forEach((el) => {
      const t = el.dataset.t; let v = el.value;
      if (t === 'bool') v = v === '1';
      else if (t === 'int') v = parseInt(v, 10);
      else if (t === 'num') v = Number(v);
      else if (t === 'rupees' || t === 'pct') v = Math.round(Number(v) * 100);
      out[el.dataset.k] = v;
    });
    return out;
  }

  /* ── Audit ── */
  async function showAudit(entity = '') {
    body().innerHTML = '<div class="loading">Loading…</div>';
    const res = await call(`/audit?limit=100${entity ? '&entity=' + entity : ''}`);
    body().innerHTML = `
      <div style="margin-bottom:8px"><select id="aud-entity" style="padding:7px"><option value="">All</option>${['Promoter', 'ReferralCode', 'CommissionRate', 'Setting', 'Document'].map((e) => `<option ${e === entity ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
      <div class="admin-card"><table class="admin-table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Reason</th><th>IP</th></tr></thead><tbody>
      ${res.data.map((a) => `<tr><td>${dt(a.createdAt)}</td><td>${esc(a.actorName)} <span style="font-size:10px;color:var(--gray)">${esc(a.role)}</span></td><td>${esc(a.action)}</td><td>${esc(a.entity)} ${esc(String(a.entityId || '').slice(-6))}</td><td>${esc(a.reason) || ''}</td><td>${esc(a.ip)}</td></tr>`).join('') || '<tr><td colspan="6" class="loading">Nothing logged yet.</td></tr>'}
      </tbody></table></div>`;
  }

  const show = async () => {
    drawTabs();
    try {
      if (tab === 'promoters') await showPromoters();
      else if (tab === 'codes') await showCodes();
      else if (tab === 'rates') await showRates();
      else if (tab === 'orders') await showOrders();
      else if (tab === 'ledger') await showLedger();
      else if (tab === 'payouts') await showPayouts();
      else if (tab === 'settings') await showSettings();
      else await showAudit();
    } catch (e) { body().innerHTML = `<div class="admin-card" style="padding:16px">Failed to load: ${esc(e.message)}</div>`; }
  };

  /* ── events (delegated; bound once per page load) ── */
  if (!root.dataset.bound) {
    root.dataset.bound = '1';
    const act = (fn) => async (e) => { try { await fn(e); } catch (err) { fail(err); } };
    const modalBody = document.getElementById('modal-body');

    root.addEventListener('click', act(async (e) => {
      const t = e.target.closest('button,a'); if (!t) return;
      if (t.dataset.tab) { tab = t.dataset.tab; return show(); }
      if (t.id === 'ref-search') return showPromoters(document.getElementById('ref-q').value.trim(), document.getElementById('ref-status').value);
      if (t.id === 'ref-add-promoter') return openModal(promoterForm());
      if (t.dataset.view) return openPromoter(t.dataset.view);
      if (t.id === 'code-add') return codeForm(false);
      if (t.id === 'code-bulk') return codeForm(true);
      for (const [attr, action] of [['pause', 'pause'], ['resume', 'resume'], ['expire', 'expire']]) {
        if (t.dataset[attr]) {
          const reason = action === 'expire' ? window.prompt('Reason (optional)') || undefined : undefined;
          await call(`/codes/${t.dataset[attr]}/${action}`, { method: 'POST', body: { reason } });
          toast(`Code ${action}d`, 'success'); return showCodes(document.getElementById('code-status')?.value || '');
        }
      }
      if (t.id === 'rt-save') {
        const v = (id) => document.getElementById(id).value.trim();
        const r = await call('/rates', { method: 'POST', body: { category: v('rt-cat') || undefined, promoterId: v('rt-pr') || undefined, rateBps: Math.round(Number(v('rt-rate')) * 100), effectiveFrom: v('rt-from') || undefined, note: v('rt-note') || undefined } });
        (r.warnings || []).forEach((w) => toast(w, 'error')); toast('Rate added', 'success'); return showRates();
      }
      if (t.id === 'ro-go') return showOrders(document.getElementById('ro-promoter').value, document.getElementById('ro-code').value.trim());
      if (t.id === 'adj-save') {
        const v = (id) => document.getElementById(id).value.trim();
        const amt = Math.round(Number(v('adj-amt')) * 100);
        if (!amt) return toast('Enter a non-zero amount', 'error');
        await call('/ledger/adjust', { method: 'POST', body: { promoterId: v('adj-pr'), amountPaise: amt, bucket: v('adj-bucket'), reason: v('adj-reason') } });
        toast('Adjustment recorded', 'success'); return showLedger();
      }
      if (t.id === 'po-create') {
        if (!window.confirm('Create a draft payout batch for all eligible promoters? Nothing is paid or reserved until you approve it.')) return;
        await call('/payouts', { method: 'POST', body: {} }); toast('Draft batch created', 'success'); return showPayouts();
      }
      if (t.dataset.poOpen) return openBatch(t.dataset.poOpen);
      const bid = () => t.closest('[data-batch]')?.dataset.batch;
      if (t.id === 'po-approve') {
        if (!window.confirm('Approve this batch? The commission is deducted from each promoter\'s payable balance now.')) return;
        const id = bid(); const r = await call(`/payouts/${id}/approve`, { method: 'POST', body: {} });
        toast(`Approved ${r.data.approved}${r.data.dropped ? `, dropped ${r.data.dropped} (balance changed)` : ''}`, 'success'); await showPayouts(); return openBatch(id);
      }
      if (t.id === 'po-cancel') {
        if (!window.confirm('Cancel this batch? Any reserved funds go back to the promoters\' payable balance.')) return;
        await call(`/payouts/${bid()}/cancel`, { method: 'POST', body: {} }); toast('Batch cancelled', 'success'); return showPayouts();
      }
      if (t.id === 'po-bank') {
        const csv = await call(`/payouts/${bid()}/bank-file`); download('bank-file.csv', csv); return toast('Bank file downloaded (contains account numbers: handle with care)', 'success');
      }
      if (t.id === 'po-paid') {
        const payments = [...root.querySelectorAll('[data-utr]')].map((i) => ({ itemId: i.dataset.utr, utr: i.value.trim() })).filter((p) => p.utr);
        if (!payments.length) return toast('Enter the UTR for each item you have paid', 'error');
        const id = bid(); await call(`/payouts/${id}/paid`, { method: 'POST', body: { payments } });
        toast('Marked paid', 'success'); await showPayouts(); return openBatch(id);
      }
      if (t.dataset.poFail) {
        const reason = window.prompt('Why did this payment fail? (min 5 characters)'); if (!reason) return;
        const id = bid(); await call(`/payout-items/${t.dataset.poFail}/fail`, { method: 'POST', body: { reason } });
        toast('Marked failed; funds returned to payable', 'success'); await showPayouts(); return openBatch(id);
      }
      if (t.id === 'st-go') {
        const q = new URLSearchParams(); const f = document.getElementById('st-from').value, to = document.getElementById('st-to').value;
        if (f) q.set('from', f); if (to) q.set('to', to);
        const { data } = await call(`/statements/${document.getElementById('st-pr').value}?${q}`); const x = data.summary;
        document.getElementById('st-out').innerHTML = `<table class="admin-table"><tbody>
          <tr><td>Opening balance</td><td>${inr(x.openingPaise)}</td></tr><tr><td>Commission earned</td><td>${inr(x.accruedPaise)}</td></tr>
          <tr><td>Reversals (cancel/return)</td><td>${inr(x.reversedPaise)}</td></tr><tr><td>Adjustments</td><td>${inr(x.adjustedPaise)}</td></tr>
          <tr><td>Paid out (net of voids)</td><td>${inr(x.paidOutPaise)}</td></tr><tr><td><b>Closing balance</b></td><td><b>${inr(x.closingPaise)}</b> (pending ${inr(x.pendingClosingPaise)}, payable ${inr(x.payableClosingPaise)})</td></tr></tbody></table>`;
        return;
      }
      if (t.id === 'ex-pay' || t.id === 'ex-tds') {
        const fy = document.getElementById('ex-fy').value.trim(); const q = fy ? `?fy=${encodeURIComponent(fy)}` : '';
        const csv = await call(t.id === 'ex-pay' ? `/exports/payouts${q}` : `/exports/tds${q}`); return download(t.id === 'ex-pay' ? 'payouts.csv' : 'tds.csv', csv);
      }
      if (t.id === 'set-save') {
        const r = await call('/settings', { method: 'PUT', body: readSettings() });
        toast(r.data.changed.length ? `Saved: ${r.data.changed.join(', ')}` : 'No changes', 'success'); return showSettings();
      }
    }));
    root.addEventListener('change', act(async (e) => {
      if (e.target.id === 'code-status') return showCodes(e.target.value);
      if (e.target.id === 'aud-entity') return showAudit(e.target.value);
      if (e.target.id === 'led-promoter') return showLedger(e.target.value);
      if (e.target.id === 'ro-promoter') return showOrders(e.target.value, document.getElementById('ro-code').value.trim());
    }));

    modalBody.addEventListener('click', act(async (e) => {
      const t = e.target.closest('button,a'); if (!t || !t.closest('[data-refmodal]')) return;
      if (t.id === 'pf-save') {
        const id = t.dataset.id;
        await call(id ? `/${id}` : '/', { method: id ? 'PUT' : 'POST', body: readPromoterForm() });
        closeModal(); toast('Saved', 'success'); return showPromoters();
      }
      if (t.id === 'cf-save') {
        const bulk = t.dataset.bulk === '1';
        const r = await call(bulk ? '/codes/bulk' : '/codes', { method: 'POST', body: readCodeForm(bulk) });
        (r.warnings || []).forEach((w) => toast(w, 'error'));
        closeModal(); toast(bulk ? `${r.data.codes.length} codes created` : 'Code created', 'success'); return showCodes();
      }
      if (t.dataset.edit) { const { data } = await call(`/${t.dataset.edit}`); return openModal(promoterForm(data)); }
      if (t.dataset.kyc) {
        const notes = window.prompt('KYC notes (optional)') ?? '';
        await call(`/${t.dataset.id}/kyc`, { method: 'POST', body: { kycStatus: t.dataset.kyc, kycNotes: notes } });
        toast('KYC updated', 'success'); return openPromoter(t.dataset.id);
      }
      if (t.dataset.agr) {
        const body = { agreementStatus: t.dataset.agr };
        if (t.dataset.agr === 'signed') {
          body.agreementVersion = window.prompt('Agreement version signed (e.g. v1)'); if (!body.agreementVersion) return;
          body.method = window.confirm('Press OK if this was an uploaded signed PDF, Cancel for click-wrap/e-sign') ? 'uploaded_pdf' : 'esign';
        }
        await call(`/${t.dataset.id}/agreement`, { method: 'POST', body });
        toast('Agreement updated', 'success'); return openPromoter(t.dataset.id);
      }
      if (t.dataset.st) {
        const status = t.dataset.st;
        const reason = status === 'active' ? undefined : window.prompt(`Reason for ${status} (required)`);
        if (status !== 'active' && !reason) return;
        await call(`/${t.dataset.id}/status`, { method: 'POST', body: { status, reason } });
        toast(`Promoter ${status}`, 'success'); return openPromoter(t.dataset.id);
      }
      if (t.dataset.strike) {
        const reason = window.prompt('Reason for strike (e.g. missing #ad disclosure)'); if (!reason) return;
        await call(`/${t.dataset.strike}/strike`, { method: 'POST', body: { reason } });
        toast('Strike recorded', 'success'); return openPromoter(t.dataset.strike);
      }
      if (t.dataset.reveal) {
        const reason = window.prompt('Why do you need the full PAN / bank number? (logged)'); if (!reason) return;
        const r = await call(`/${t.dataset.reveal}/reveal`, { method: 'POST', body: { fields: ['pan', 'gstin', 'bankAccount'], reason } });
        window.alert(`PAN: ${r.data.pan || '—'}\nGSTIN: ${r.data.gstin || '—'}\nBank account: ${r.data.bankAccount || '—'}\n\nThis view has been recorded in the audit log.`); return;
      }
      if (t.dataset.upload) {
        const file = document.getElementById('doc-file').files[0]; if (!file) return toast('Choose a file first', 'error');
        const fd = new FormData(); fd.append('type', document.getElementById('doc-type').value); fd.append('file', file);
        await call(`/${t.dataset.upload}/documents`, { method: 'POST', body: fd });
        toast('Uploaded (encrypted)', 'success'); return openPromoter(t.dataset.upload);
      }
      if (t.dataset.doc) {
        e.preventDefault();
        const res = await fetch(`${API_BASE}/admin/promoters/${t.dataset.pid}/documents/${t.dataset.doc}`, { headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
        if (!res.ok) throw new Error('Download failed');
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement('a'); a.href = url; a.download = t.dataset.fn || 'document'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    }));
  }

  await show();
}
