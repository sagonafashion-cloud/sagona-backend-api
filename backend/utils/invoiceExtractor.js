import Anthropic from '@anthropic-ai/sdk';
import { detectFileKind } from './fileValidation.js';

// Reads a vendor purchase-invoice (photo or PDF) with Claude and returns a
// structured, UNSAVED draft for the super admin to verify. Nothing here
// writes to the database.

const MODEL = process.env.PURCHASE_INVOICE_AI_MODEL || 'claude-haiku-4-5-20251001';
const BUYER_GSTIN = process.env.SELLER_GSTIN || '05CZOPK4885L2ZJ';

const MEDIA_TYPES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

// GSTIN first two digits = state code. Used to decide intra (CGST+SGST) vs
// inter (IGST) rather than trusting the model.
export const stateCodeOf = (gstin) => {
  const m = /^(\d{2})[A-Z0-9]{13}$/i.exec(String(gstin || '').trim());
  return m ? m[1] : null;
};

export const deriveTaxType = (vendorGstin, buyerGstin = BUYER_GSTIN) => {
  const v = stateCodeOf(vendorGstin);
  const b = stateCodeOf(buyerGstin);
  if (!v || !b) return null;
  return v === b ? 'intra' : 'inter';
};

const PROMPT = `You are reading an Indian GST tax invoice from a vendor. Extract the data and reply with ONLY a JSON object (no markdown, no commentary) of this exact shape:
{
  "vendor": { "name": string, "gstin": string|null, "state": string|null },
  "buyerGstin": string|null,
  "invoiceNumber": string|null,
  "invoiceDate": "YYYY-MM-DD"|null,
  "placeOfSupply": string|null,
  "reverseCharge": boolean,
  "items": [
    { "description": string, "hsnCode": string|null, "qty": number|null, "unitPrice": number|null, "taxableValue": number, "gstRate": number }
  ],
  "totals": { "taxableValue": number|null, "cgst": number|null, "sgst": number|null, "igst": number|null, "cess": number|null, "invoiceValue": number|null }
}
Rules:
- One entry in "items" per product line. Do not include totals, freight or round-off rows as items.
- unitPrice is the vendor's rate per unit EXCLUDING GST. taxableValue is the line amount excluding GST (qty x unitPrice, after any line discount).
- gstRate is the percentage for that line (e.g. 5, 12, 18). If the invoice shows only one rate for all lines, apply it to every line.
- Numbers must be plain numbers (no commas, no currency symbols). Use null when a value is not visible; never guess.
- invoiceDate must be ISO YYYY-MM-DD.`;

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const str = (v) => (v === null || v === undefined ? null : String(v).trim() || null);

function parseJson(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('AI response did not contain JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * @param {Buffer} buffer  file bytes (already signature-validated: image or PDF)
 * @returns {Promise<{draft:object, warnings:string[], usage:object}>}
 */
export async function extractInvoice(buffer) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const e = new Error('AI reading is not configured (ANTHROPIC_API_KEY missing). Enter the invoice manually.');
    e.code = 'NOT_CONFIGURED';
    throw e;
  }

  const kind = detectFileKind(buffer, ['pdf', 'jpeg', 'png', 'webp', 'gif']);
  if (!kind) throw new Error('Unsupported file type. Upload a PDF, JPG, PNG or WebP.');

  const data = buffer.toString('base64');
  const fileBlock = kind === 'pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image', source: { type: 'base64', media_type: MEDIA_TYPES[kind], data } };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    temperature: 0,
    messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: PROMPT }] }]
  });

  const text = (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const raw = parseJson(text);

  const warnings = [];
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map((it) => ({
      description: str(it.description) || '',
      hsnCode: str(it.hsnCode) || '',
      qty: num(it.qty),
      unitPrice: num(it.unitPrice),
      taxableValue: num(it.taxableValue) ?? 0,
      gstRate: num(it.gstRate) ?? 0
    }))
    .filter((it) => it.description);

  if (!items.length) warnings.push('No line items could be read. Please enter them manually.');

  const vendorGstin = str(raw.vendor?.gstin)?.toUpperCase() || null;
  const buyerGstin = str(raw.buyerGstin)?.toUpperCase() || null;
  const taxType = deriveTaxType(vendorGstin);
  if (!taxType) warnings.push('Could not determine intra/inter-state from the vendor GSTIN. Please choose the tax type.');
  if (buyerGstin && buyerGstin !== BUYER_GSTIN) {
    warnings.push(`Invoice is addressed to GSTIN ${buyerGstin}, which is not SAGONA's GSTIN (${BUYER_GSTIN}). Check this is the right invoice.`);
  }

  // Cross-check: what we compute from the lines vs the printed totals.
  const sumTaxable = Math.round(items.reduce((s, it) => s + it.taxableValue, 0) * 100) / 100;
  const t = raw.totals || {};
  const printedTaxable = num(t.taxableValue);
  if (printedTaxable !== null && Math.abs(printedTaxable - sumTaxable) > 1) {
    warnings.push(`Line items add up to ${sumTaxable} but the invoice shows taxable value ${printedTaxable}. A line may be missing or misread.`);
  }
  let computedTax = 0;
  for (const it of items) computedTax += (it.taxableValue * it.gstRate) / 100;
  computedTax = Math.round(computedTax * 100) / 100;
  const printedTax = (num(t.cgst) || 0) + (num(t.sgst) || 0) + (num(t.igst) || 0);
  if (printedTax > 0 && Math.abs(printedTax - computedTax) > 2) {
    warnings.push(`GST computed from lines is ${computedTax} but the invoice shows ${Math.round(printedTax * 100) / 100}. Check the GST rates.`);
  }
  const missingHsn = items.filter((it) => !it.hsnCode).length;
  if (missingHsn) warnings.push(`${missingHsn} line(s) have no HSN code.`);

  return {
    draft: {
      vendor: { name: str(raw.vendor?.name) || '', gstin: vendorGstin, state: str(raw.vendor?.state) },
      invoiceNumber: str(raw.invoiceNumber),
      invoiceDate: str(raw.invoiceDate),
      placeOfSupply: str(raw.placeOfSupply),
      reverseCharge: !!raw.reverseCharge,
      taxType,
      items,
      printedTotals: {
        taxableValue: printedTaxable,
        cgst: num(t.cgst), sgst: num(t.sgst), igst: num(t.igst), cess: num(t.cess),
        invoiceValue: num(t.invoiceValue)
      }
    },
    warnings,
    usage: { model: MODEL, inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens }
  };
}
