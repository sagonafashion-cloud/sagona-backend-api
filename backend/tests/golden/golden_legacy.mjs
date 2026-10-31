// Golden-snapshot harness for the LEGACY (pre-referral) money path.
// Pure functions only (no DB): calculateTax + invoice PDF text.
// Usage:  node tests/golden/golden_legacy.mjs --write   (capture)
//         node tests/golden/golden_legacy.mjs           (compare; exit 1 on any diff)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { calculateTax } from '../../utils/taxCalculator.js';
import { generateInvoice } from '../../utils/invoiceGenerator.js';
import { PDFParse } from 'pdf-parse';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(here, 'legacy.golden.json');

const mk = (name, unitPrice, qty, gstSlab, mrp, hsnCode = '6109') =>
  ({ name, unitPrice, qty, gstSlab, mrp: mrp ?? unitPrice, hsnCode, size: 'M' });

const CASES = [
  { id: 'intra_single_5pct',  store: 'Uttarakhand', cust: 'Uttarakhand', ship: 99,  items: [mk('Kids Kurta', 750, 1, 5, 1500)] },
  { id: 'inter_single_5pct',  store: 'Uttarakhand', cust: 'Delhi',       ship: 99,  items: [mk('Kids Kurta', 750, 1, 5, 1500)] },
  { id: 'intra_multi_mixed',  store: 'Uttarakhand', cust: 'uttarakhand', ship: 0,   items: [mk('Shirt', 1299, 2, 5), mk('Jeans', 2799, 1, 18, 3499), mk('Belt', 499, 3, 0)] },
  { id: 'inter_multi_mixed',  store: 'Uttarakhand', cust: 'Maharashtra', ship: 0,   items: [mk('Shirt', 1299, 2, 5), mk('Jeans', 2799, 1, 18, 3499)] },
  { id: 'odd_paise_rounding', store: 'Uttarakhand', cust: 'Uttarakhand', ship: 99,  items: [mk('Tee', 333, 3, 5), mk('Cap', 199, 7, 18)] },
  { id: 'nil_rated',          store: 'Uttarakhand', cust: 'Delhi',       ship: 99,  items: [mk('Handkerchief', 99, 2, 0)] },
];

async function pdfText(buf) {
  const p = new PDFParse({ data: new Uint8Array(buf) });
  const r = await p.getText();
  await p.destroy?.();
  return r.text.replace(/\s+/g, ' ').trim();
}

async function build() {
  const out = {};
  for (const c of CASES) {
    const tax = calculateTax(c.items, c.store, c.cust);
    const billing = {
      subtotal: tax.subtotal, shippingCharge: c.ship, taxableAmount: tax.taxableAmount,
      cgst: tax.cgst, sgst: tax.sgst, igst: tax.igst, grandTotal: tax.grandTotal + c.ship
    };
    const order = {
      orderNumber: `SAG-GOLDEN-${c.id}`, createdAt: '2026-10-01T10:00:00.000Z', taxType: tax.taxType,
      customer: { name: 'QA Test' }, shippingAddress: { name: 'QA Test', state: c.cust, city: 'X', pincode: '249403', phone: '9999999999' },
      payment: { method: 'COD', status: 'pending' }, items: c.items, billing
    };
    const text = await pdfText(await generateInvoice(order, null));
    out[c.id] = { tax, billing, invoiceTextSha256: crypto.createHash('sha256').update(text).digest('hex'), invoiceText: text };
  }
  return out;
}

const current = await build();
if (process.argv.includes('--write')) {
  fs.writeFileSync(FILE, JSON.stringify(current, null, 2));
  console.log(`golden written: ${Object.keys(current).length} cases -> ${path.relative(process.cwd(), FILE)}`);
} else {
  const golden = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  let bad = 0;
  for (const id of Object.keys(golden)) {
    if (JSON.stringify(golden[id]) !== JSON.stringify(current[id])) { bad++; console.error('DIFF in case:', id); }
  }
  if (bad) { console.error(`${bad} golden case(s) differ`); process.exit(1); }
  console.log(`golden OK: ${Object.keys(golden).length} cases identical`);
}
