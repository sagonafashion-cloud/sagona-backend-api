// jsdom UI test for admin-referral.js. Needs: npm i esbuild jsdom (not repo dependencies), then: node admin_ui.uitest.mjs
// Run from a folder where esbuild and jsdom resolve (for example: cp to /tmp/x, npm i esbuild jsdom).
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const ROOT = process.env.ADMIN_JS_DIR || new URL('../../../frontend/nc_assets/js', import.meta.url).pathname;
const out = await build({ entryPoints:[ROOT+'/admin-referral.js'], bundle:true, write:false, format:'iife', globalName:'RefMod', platform:'browser', logLevel:'silent' });
const code = out.outputFiles[0].text;
const results=[]; const t=(n,ok,i='')=>results.push((ok?'PASS ':'FAIL ')+n+(i?' — '+i:''));
const tick=(ms=40)=>new Promise(r=>setTimeout(r,ms));

async function setup({ canWrite=true, pingFails=false, promoters=[], codes=[] }={}) {
  const dom = new JSDOM(`<body><div id="ref-root"></div><div id="modal-overlay" style="display:none"><div id="modal-body"></div><button id="modal-close"></button></div></body>`, { url:'https://sagona.in/admin.html', runScripts:'outside-only', pretendToBeVisual:true });
  const w = dom.window; const calls=[]; const toasts=[];
  w.eval(code);
  const api = async (path, opts={}) => {
    calls.push({ path, method: opts.method||'GET', body: opts.body && typeof opts.body==='string' ? JSON.parse(opts.body) : opts.body });
    if (path.endsWith('/ping')) { if (pingFails) throw new Error('Not Found'); return { data:{ programmeEnabled:true, encryptionConfigured:true, canWrite } }; }
    if (path.includes('/rates/effective')) return { data: null };
    if (path.startsWith('/admin/promoters/rates')) return { data: [] };
    if (path.startsWith('/admin/promoters/settings')) return { data:{ settings:{ enabled:false, return_window_days:10, min_payout_paise:50000, payout_day:5, commission_base:'NET_EX_GST', margin_guard_max_pct:40, margin_guard_mode:'warn', tds_enabled:false, tds_section:'', tds_rate_bps:0, tds_annual_threshold_paise:0, gst_on_commission_bps:1800, reevaluate_gst_slab:false, fraud_velocity_orders_24h:5, fraud_return_rate_alert_pct:40, agreement_template_version:'v1', agreement_grace_days:30, terms_url:'/x', support_contact:'' } } };
    if (path.startsWith('/admin/promoters/codes')) return { data: codes, warnings: [], ...(opts.method==='POST' ? { data:{ codes:['A','B'] } } : {}) };
    if (path.startsWith('/admin/promoters/payouts/preview')) return { fy:'2026-27', data: [
      { promoterId:'p1', name:'Asha', eligible:true, blockers:[], grossPaise:100000, gstPaise:18000, tdsPaise:10000, netPaise:108000 },
      { promoterId:'p2', name:'<b>Bela</b>', eligible:false, blockers:['KYC not verified'], grossPaise:90000, gstPaise:0, tdsPaise:0, netPaise:90000 }] };
    if (path.match(/^\/admin\/promoters\/payouts\/b1\/bank-file/)) return 'Ref,Amount\r\nSAG/PO/1,1080.00\r\n';
    if (path.match(/^\/admin\/promoters\/payouts\/b1$/)) return { data:{ _id:'b1', batchNo:'PB/2026-27/0001', status:'approved', items:[{ _id:'i1', voucherNo:'SAG/PO/2026-27/0001', promoterName:'Asha', grossPaise:100000, gstPaise:18000, tdsPaise:10000, netPaise:108000, status:'approved' }] } };
    if (path.match(/^\/admin\/promoters\/payouts\/b1\/approve/)) return { data:{ approved:1, dropped:0 } };
    if (path.match(/^\/admin\/promoters\/payouts(\?|$)/) && opts.method!=='POST') return { data:[{ _id:'b1', batchNo:'PB/2026-27/0001', createdAt:'2026-11-03', itemCount:1, grossPaise:100000, netPaise:108000, status:'approved' }] };
    if (path.startsWith('/admin/promoters/statements/')) return { data:{ summary:{ openingPaise:0, accruedPaise:5000, reversedPaise:0, adjustedPaise:0, paidOutPaise:-5000, closingPaise:0, pendingClosingPaise:0, payableClosingPaise:0 } } };
    if (path.startsWith('/admin/promoters/exports/')) return 'a,b\r\n1,2\r\n';
    if (path.startsWith('/admin/promoters/fraud/f1/')) return { data:{ reversedPaise: 1000 } };
    if (path.startsWith('/admin/promoters/fraud')) return { data: path.includes('status=open') ? [{ _id:'f1', createdAt:'2026-11-03', promoterName:'<i>Asha</i>', orderNumber:'SAG-9', rule:'self_referral', severity:'high', detail:'Buyer phone or email matches the promoter', status:'open' }] : [] };
    if (path.startsWith('/admin/promoters/reports/liability')) return path.includes('format=csv') ? 'a,b\r\n' : { data:{ rows:[{ promoterId:'p1', name:'Asha', pendingPaise:300, payablePaise:700, reservedPaise:500, paidPaise:900, owedPaise:1500 }], total:{ pendingPaise:300, payablePaise:700, reservedPaise:500, paidPaise:900, owedPaise:1500 } } };
    if (path.startsWith('/admin/promoters/reports/summary')) return { data:{ summary:{ orders:3, cancelledOrReturned:1, listPaise:150000, discountPaise:15000, commissionPaise:1200, programmeCostPct:10.8, byCategory:{} }, gst:{ rows:[{ gstRate:5, taxablePaise:128571, gstPaise:6429, discountPaise:15000, taxableReductionPaise:14286, gstReductionPaise:714 }], total:{} } } };
    if (path.startsWith('/admin/promoters/reports/promoters')) return { data:[{ promoterId:'p1', name:'Asha', orders:3, delivered:2, cancelledOrReturned:1, returnRatePct:33.33, discountPaise:15000, commissionPaise:1200 }] };
    if (path.startsWith('/admin/promoters/reports/links')) return path.includes('format=csv') ? 'a,b\r\n' : { data:[{ codeId:'c1', code:'RHEA25', promoter:'<u>Asha</u>', clicks:40, orders:2, conversionPct:5 }] };
    if (path.startsWith('/admin/promoters/reports/profit')) { if (!canWrite) throw new Error('Forbidden'); return { data:{ taxablePaise:100000, costPaise:50000, commissionPaise:1200, unknownCostPaise:0, marginPaise:48800, marginPct:48.8 } }; }
    if (path.startsWith('/admin/promoters/reports/reconciliation')) return { data:{ allOk:false, checks:[{ check:'Code usage counters equal referral records', ok:false, count:1, samples:['RHEA25'] }, { check:'Payout ledger entries equal approved + paid payout items', ok:true, count:0, samples:[] }] } };
    if (path.startsWith('/admin/promoters/audit')) return { data: [] };
    if (path.startsWith('/admin/promoters/orders')) return { data: [{ _id:'r1', orderNumber:'SAG-1', orderDate:'2026-11-02', orderStatus:'delivered', promoter:'Asha', code:'RHEA25', customer:'B*** ******3210', grossPaise:50000, discountPaise:5000, taxablePaise:42857, gstPaise:2143, shippingPaise:9900, commissionPaise:4286, flags:{}, referralStatus:'applied' }] };
    if (path.startsWith('/admin/promoters/ledger/balances')) return { data: [{ promoterId:'p1', name:'Asha', pendingPaise:4286, payablePaise:1000 }] };
    if (path.startsWith('/admin/promoters/ledger')) return { data: [{ promoterId:'p1', entryType:'accrual_pending', bucket:'pending', amountPaise:4286, eventAt:'2026-11-02', reason:'Order placed' }] };
    if (path.match(/^\/admin\/promoters\/\?/)) return { data: promoters };
    return { data: {}, warnings: [] };
  };
  const ctx = { api, toast:(m,ty)=>toasts.push([m,ty]), openModal:(h)=>{ w.document.getElementById('modal-body').innerHTML=h; w.document.getElementById('modal-overlay').style.display='flex'; }, closeModal:()=>{ w.document.getElementById('modal-body').innerHTML=''; w.document.getElementById('modal-overlay').style.display='none'; } };
  await w.RefMod.loadPromoters(ctx); await tick();
  return { w, calls, toasts, ctx };
}
const click = (w, sel) => { const el = w.document.querySelector(sel); if(!el) throw new Error('missing '+sel); el.dispatchEvent(new w.MouseEvent('click',{bubbles:true})); };
const setv = (w, id, v) => { const el=w.document.getElementById(id); el.value=v; };

// 1. XSS-safe rendering + read-only role
let s = await setup({ canWrite:false, promoters:[{ _id:'1', name:'<img src=x onerror=alert(1)>', mobile:'9876543210', status:'active', kycStatus:'verified', agreementStatus:'signed', pan:'XXXXXX234F', gstRegistered:false }] });
t('promoter name is escaped (no injected <img>)', !s.w.document.querySelector('#ref-body img') && s.w.document.getElementById('ref-body').innerHTML.includes('&lt;img'));
t('read-only role: no Add button', !s.w.document.getElementById('ref-add-promoter'));
t('tabs rendered', s.w.document.querySelectorAll('#ref-tabs button').length===10);

// 2. module off
s = await setup({ pingFails:true });
t('module off shows message, no tabs', /not available/.test(s.w.document.getElementById('ref-root').textContent) && !s.w.document.getElementById('ref-tabs'));

// 3. create promoter payload
s = await setup({});
click(s.w,'#ref-add-promoter'); await tick();
setv(s.w,'pf-name','Asha Verma'); setv(s.w,'pf-mobile','9876543210'); setv(s.w,'pf-dob','1998-05-10'); setv(s.w,'pf-pan','ABCDE1234F');
setv(s.w,'pf-bank','123456789012'); setv(s.w,'pf-ifsc','SBIN0001234'); setv(s.w,'pf-holder','Asha Verma'); setv(s.w,'pf-handle','@asha');
click(s.w,'#pf-save'); await tick(80);
const post = s.calls.find(c=>c.method==='POST' && c.path==='/admin/promoters/');
t('create promoter POSTs expected fields', post && post.body.name==='Asha Verma' && post.body.pan==='ABCDE1234F' && post.body.bankAccount==='123456789012' && post.body.gstRegistered===false && post.body.socialHandles[0].handle==='@asha', JSON.stringify(post?.body));
t('modal closes after save', s.w.document.getElementById('modal-overlay').style.display==='none');

// 4. code form unit conversion
s = await setup({ promoters:[{_id:'p1',name:'Asha',status:'active'}] });
click(s.w,'[data-tab="codes"]'); await tick(80);
click(s.w,'#code-add'); await tick(80);
setv(s.w,'cf-code','rhea25'); setv(s.w,'cf-type','percent'); setv(s.w,'cf-value','7.5'); setv(s.w,'cf-cap','100'); setv(s.w,'cf-min','499'); setv(s.w,'cf-to','2026-12-31');
s.w.document.querySelector('.cf-cat[value="kids"]').checked=true;
click(s.w,'#cf-save'); await tick(80);
let cp = s.calls.find(c=>c.method==='POST' && c.path==='/admin/promoters/codes');
t('percent 7.5 -> 750 bps; cap ₹100 -> 10000 paise; min ₹499 -> 49900 paise', cp && cp.body.discountValue===750 && cp.body.discountCapPaise===10000 && cp.body.minOrderPaise===49900 && cp.body.promoterId==='p1' && cp.body.code==='rhea25' && cp.body.categoryScope[0]==='kids', JSON.stringify(cp?.body));
t('validTo is end of day IST', cp?.body.validTo==='2026-12-31T23:59:59+05:30');
click(s.w,'#code-add'); await tick(80);
setv(s.w,'cf-type','flat'); setv(s.w,'cf-value','50'); click(s.w,'#cf-save'); await tick(80);
cp = s.calls.filter(c=>c.method==='POST' && c.path==='/admin/promoters/codes').at(-1);
t('flat ₹50 -> 5000 paise', cp.body.discountValue===5000);
click(s.w,'#code-bulk'); await tick(80);
setv(s.w,'cf-count','2'); setv(s.w,'cf-prefix','SAG'); click(s.w,'#cf-save'); await tick(80);
const bp = s.calls.find(c=>c.path==='/admin/promoters/codes/bulk');
t('bulk create sends count+prefix', bp && bp.body.count===2 && bp.body.prefix==='SAG');

// 5. rate in bps
s = await setup({ promoters:[{_id:'p1',name:'Asha',status:'active'}] });
click(s.w,'[data-tab="rates"]'); await tick(120);
setv(s.w,'rt-cat','kids'); setv(s.w,'rt-rate','8.5'); setv(s.w,'rt-from','2026-11-01'); click(s.w,'#rt-save'); await tick(80);
const rp = s.calls.find(c=>c.method==='POST' && c.path==='/admin/promoters/rates');
t('rate 8.5% -> 850 bps with category and date', rp && rp.body.rateBps===850 && rp.body.category==='kids' && rp.body.effectiveFrom==='2026-11-01' && rp.body.promoterId===undefined, JSON.stringify(rp?.body));

// 6. settings conversions
s = await setup({});
click(s.w,'[data-tab="settings"]'); await tick(80);
s.w.document.querySelector('[data-k="tds_rate_bps"]').value='2';
s.w.document.querySelector('[data-k="min_payout_paise"]').value='750';
s.w.document.querySelector('[data-k="tds_enabled"]').value='1';
s.w.document.querySelector('[data-k="return_window_days"]').value='14';
click(s.w,'#set-save'); await tick(80);
const sp = s.calls.find(c=>c.method==='PUT' && c.path==='/admin/promoters/settings');
t('settings: 2% -> 200 bps, ₹750 -> 75000 paise, bool, int', sp && sp.body.tds_rate_bps===200 && sp.body.min_payout_paise===75000 && sp.body.tds_enabled===true && sp.body.return_window_days===14 && sp.body.gst_on_commission_bps===1800, JSON.stringify(sp?.body));

// 6b. referred orders + ledger tabs
s = await setup({ promoters:[{_id:'p1',name:'Asha',status:'active'}] });
click(s.w,'[data-tab="orders"]'); await tick(100);
const ot = s.w.document.getElementById('ref-body').textContent;
t('referred orders: row shows code, masked customer, amounts in rupees', /RHEA25/.test(ot) && /B\*\*\* \*{6}3210/.test(ot) && /₹428\.57/.test(ot) && /₹42\.86/.test(ot), ot.slice(0,200));
click(s.w,'[data-tab="ledger"]'); await tick(100);
const lt = s.w.document.getElementById('ref-body').textContent;
t('ledger: balances and entries render', /₹42\.86/.test(lt) && /₹10/.test(lt) && /accrual_pending/.test(lt));
setv(s.w,'adj-amt','-25.5'); setv(s.w,'adj-reason','Goodwill correction'); click(s.w,'#adj-save'); await tick(100);
const ap = s.calls.find(c=>c.path==='/admin/promoters/ledger/adjust');
t('adjustment: -25.5 rupees -> -2550 paise with reason and promoter', ap && ap.body.amountPaise===-2550 && ap.body.reason==='Goodwill correction' && ap.body.promoterId==='p1' && ap.body.bucket==='payable', JSON.stringify(ap?.body));
s = await setup({ canWrite:false });
click(s.w,'[data-tab="ledger"]'); await tick(100);
t('read-only role: no adjustment form', !s.w.document.getElementById('adj-save'));


// 6c. payouts tab
s = await setup({ promoters:[{ _id:'p1', name:'Asha', status:'active' }] });
const dl = []; s.w.URL.createObjectURL = (b) => { dl.push(b); return 'blob:x'; }; s.w.URL.revokeObjectURL = () => {};
s.w.HTMLAnchorElement.prototype.click = function () { dl.push('a:' + this.download); };
s.w.confirm = () => true; s.w.prompt = () => 'Bank rejected the transfer';
click(s.w,'[data-tab="payouts"]'); await tick(100);
const pt = s.w.document.getElementById('ref-body');
t('payouts: preview shows net, blocker reason, and escapes names', /₹1,080/.test(pt.textContent) && /KYC not verified/.test(pt.textContent) && /&lt;b&gt;Bela/.test(pt.innerHTML) && !pt.querySelector('td > b:not(:only-child)')?.textContent.includes('Bela'));
t('payouts: only eligible counted on create button', /Create draft batch \(1\)/.test(pt.textContent));
click(s.w,'#po-create'); await tick(100);
t('payouts: create posts to /payouts after confirm', !!s.calls.find(c=>c.method==='POST' && c.path==='/admin/promoters/payouts'));
click(s.w,'[data-po-open="b1"]'); await tick(100);
t('payouts: batch detail shows voucher, bank file + mark paid for approved', /SAG\/PO\/2026-27\/0001/.test(pt.textContent) && !!s.w.document.getElementById('po-bank') && !!s.w.document.getElementById('po-paid') && !s.w.document.getElementById('po-approve'));
click(s.w,'#po-bank'); await tick(100);
t('payouts: bank file downloaded as CSV', dl.includes('a:bank-file.csv'));
click(s.w,'#po-paid'); await tick(60);
t('payouts: mark paid without UTR is refused', !s.calls.find(c=>c.path.endsWith('/paid')) && s.toasts.some(x=>/UTR/.test(x[0])));
s.w.document.querySelector('[data-utr="i1"]').value = 'UTR123456';
click(s.w,'#po-paid'); await tick(100);
const pd = s.calls.find(c=>c.path==='/admin/promoters/payouts/b1/paid');
t('payouts: mark paid sends itemId + utr', pd && pd.body.payments[0].itemId==='i1' && pd.body.payments[0].utr==='UTR123456', JSON.stringify(pd?.body));
click(s.w,'[data-po-open="b1"]'); await tick(100);
click(s.w,'[data-po-fail="i1"]'); await tick(100);
const fl = s.calls.find(c=>c.path==='/admin/promoters/payout-items/i1/fail');
t('payouts: fail item sends reason', fl && fl.body.reason==='Bank rejected the transfer');
click(s.w,'#st-go'); await tick(100);
t('payouts: statement renders closing balance', /Closing balance/.test(s.w.document.getElementById('st-out').textContent));
setv(s.w,'ex-fy','2026-27'); click(s.w,'#ex-tds'); await tick(100);
t('payouts: TDS export requested with FY and downloaded', !!s.calls.find(c=>c.path==='/admin/promoters/exports/tds?fy=2026-27') && dl.includes('a:tds.csv'));
s = await setup({ canWrite:false });
click(s.w,'[data-tab="payouts"]'); await tick(100);
t('payouts: read-only role has no create button', !s.w.document.getElementById('po-create'));


// 6d. fraud queue + reports
s = await setup({ promoters:[{ _id:'p1', name:'Asha', status:'active' }] });
s.w.prompt = () => 'Self purchase proven';
click(s.w,'[data-tab="fraud"]'); await tick(100);
const fb = s.w.document.getElementById('ref-body');
t('fraud: open flag listed with plain-language rule, names escaped', /Buyer looks like the promoter/.test(fb.textContent) && /&lt;i&gt;Asha/.test(fb.innerHTML) && /on hold/.test(fb.textContent));
click(s.w,'[data-fr-confirm="f1"]'); await tick(100);
const cf = s.calls.find(c=>c.path==='/admin/promoters/fraud/f1/confirm');
t('fraud: confirm posts note and reports the clawback', cf && cf.body.note==='Self purchase proven' && s.toasts.some(x=>/clawed back/.test(x[0])));
click(s.w,'[data-fr-clear="f1"]'); await tick(100);
t('fraud: clear posts to /clear', !!s.calls.find(c=>c.path==='/admin/promoters/fraud/f1/clear'));
s.w.prompt = () => null; const nBefore = s.calls.length;
click(s.w,'[data-fr-clear="f1"]'); await tick(60);
t('fraud: cancelling the prompt sends nothing', s.calls.length===nBefore);
s = await setup({ canWrite:false });
click(s.w,'[data-tab="fraud"]'); await tick(100);
t('fraud: read-only role sees no Clear/Confirm buttons', !s.w.document.querySelector('[data-fr-clear],[data-fr-confirm]'));

s = await setup({});
const dl2 = []; s.w.URL.createObjectURL = () => 'blob:x'; s.w.URL.revokeObjectURL = () => {}; s.w.HTMLAnchorElement.prototype.click = function () { dl2.push(this.download); };
click(s.w,'[data-tab="reports"]'); await tick(150);
const rb = s.w.document.getElementById('ref-body');
t('reports: failed reconciliation check is surfaced with its sample', /needs attention/i.test(rb.textContent) && /1 issue/i.test(rb.textContent) && /RHEA25/.test(rb.textContent));
t('reports: liability total, cost %, GST effect and margin shown', /₹15/.test(rb.textContent) && /10\.8%/.test(rb.textContent) && /₹142\.86/.test(rb.textContent) && /48\.8%/.test(rb.textContent));
setv(s.w,'rp-from','2026-11-01'); click(s.w,'#rp-go'); await tick(150);
t('reports: link performance shown (escaped) with conversion', /RHEA25/.test(rb.textContent) && /5%/.test(rb.textContent) && /&lt;u&gt;Asha/.test(rb.innerHTML));
t('reports: date range is sent to the API', !!s.calls.find(c=>c.path.startsWith('/admin/promoters/reports/summary?from=2026-11-01')));
click(s.w,'[data-rp-csv="liability"]'); await tick(100);
t('reports: CSV download requested with format=csv', dl2.includes('liability.csv') && !!s.calls.find(c=>c.path.includes('reports/liability') && c.path.includes('format=csv')));
s = await setup({ canWrite:false });
click(s.w,'[data-tab="reports"]'); await tick(150);
t('reports: finance role still gets reports, margin row hidden (no cost access)', /What you owe promoters/.test(s.w.document.getElementById('ref-body').textContent) && !/Margin after commission/.test(s.w.document.getElementById('ref-body').textContent));

// 7. other modals are not hijacked
s = await setup({});
s.ctx.openModal('<button id="pf-save" data-id="">x</button>'); // inside module wrapper -> handled
const before = s.calls.length;
s.w.document.getElementById('modal-body').innerHTML = '<button id="pf-save" data-id="">foreign modal</button>';
click(s.w,'#modal-body #pf-save'); await tick(60);
t('foreign modal buttons are ignored', s.calls.length===before);

console.log(results.join('\n')); process.exit(results.some(r=>r.startsWith('FAIL'))?1:0);
