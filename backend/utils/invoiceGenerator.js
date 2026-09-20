import PDFDocument from 'pdfkit';
import { v2 as cloudinary } from 'cloudinary';
import { splitInclusivePrice } from './taxCalculator.js';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/* ── PDF buffer helper ── */
const buildBuffer = (doc) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data',  (c) => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

/* ── Cloudinary PDF upload ── */
const uploadPdf = (buffer, publicId) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'raw', folder: 'sagona/invoices', public_id: publicId, format: 'pdf' },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });

/* ── Seller registered details (GST Rule 46) ──
   These are fixed for the whole business, not per-store — the Store model
   currently only holds one placeholder/test record, so GSTIN + registered
   address are printed from here regardless of whether an order has a
   resolvable store. Update this block if these details ever change. */
const SELLER_LEGAL_NAME     = 'SAGONA';
const SELLER_GSTIN          = '05CZOPK4885L2ZJ';
const SELLER_ADDRESS_LINES  = ['Radhe Complex', 'Haridwar, Uttarakhand - 249403'];

/* ── Drawing helpers ── */
// NOTE: the ₹ glyph (U+20B9) has no glyph in PDF's base-14 Helvetica font
// under WinAnsiEncoding — pdfkit silently substitutes the wrong character
// for it (confirmed: renders as "¹"). Use "Rs." instead, which is always
// correct with the standard font rather than embedding a custom font.
const INR = (n) => `Rs. ${Number(n || 0).toFixed(2)}`;
const pct = (n) => `${n}%`;

function drawHLine(doc, y, x1 = 40, x2 = 555) {
  doc.moveTo(x1, y).lineTo(x2, y).stroke('#cccccc');
}

function tableRow(doc, cols, y, widths, isHeader = false) {
  let x = 40;
  doc.fontSize(isHeader ? 7.5 : 7).fillColor(isHeader ? '#333333' : '#111111');
  cols.forEach((text, i) => {
    doc.text(String(text ?? ''), x + 2, y + 3, { width: widths[i] - 4, align: i === 0 ? 'left' : 'right' });
    x += widths[i];
  });
}

/* ═══════════════════════════════════════════════════════════
   MAIN EXPORT
═══════════════════════════════════════════════════════════ */
export async function generateInvoice(order, store) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  const bufPromise = buildBuffer(doc);

  const pageW = 515; // usable width (595 - 2*40)

  /* ── HEADER ──────────────────────────────────────────── */
  // Business name + registered address + GSTIN are always printed — this is
  // the seller's fixed registered identity for GST Rule 46, independent of
  // whichever store (if any) the order's items happen to be tagged with.
  doc.fontSize(22).font('Helvetica-Bold').fillColor('#111111').text(SELLER_LEGAL_NAME, 40, 40);
  doc.fontSize(8).font('Helvetica').fillColor('#555555');
  SELLER_ADDRESS_LINES.forEach((line, i) => doc.text(line, 40, 66 + i * 11));
  doc.font('Helvetica-Bold').fillColor('#111111')
     .text(`GSTIN: ${SELLER_GSTIN}`, 40, 66 + SELLER_ADDRESS_LINES.length * 11 + 2);
  doc.font('Helvetica').fillColor('#555555');

  // Store dispatch info, when the order's item resolves to a real store —
  // secondary/informational only, doesn't replace the registered identity above.
  let storeLineY = 66 + SELLER_ADDRESS_LINES.length * 11 + 14;
  if (store?.name) {
    doc.fontSize(7).fillColor('#888888')
       .text(`Dispatched from: ${store.name}${store.city ? `, ${store.city}` : ''}`, 40, storeLineY);
    storeLineY += 11;
  }

  /* Invoice meta — right column */
  doc.fontSize(14).font('Helvetica-Bold').fillColor('#111111')
     .text('TAX INVOICE', 360, 40, { width: 195, align: 'right' });
  doc.fontSize(8).font('Helvetica').fillColor('#555555');
  doc.text(`Invoice No: ${order.orderNumber}`,          360, 62, { width: 195, align: 'right' });
  doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 360, 74, { width: 195, align: 'right' });
  doc.text(`Order Date: ${new Date(order.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 360, 86, { width: 195, align: 'right' });
  doc.text('Reverse Charge: No', 360, 98, { width: 195, align: 'right' });

  const hdrBottom = Math.max(storeLineY, 110) + 6;
  drawHLine(doc, hdrBottom);

  /* ── BILL TO ─────────────────────────────────────────── */
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#333333').text('BILL TO', 40, hdrBottom + 8);
  doc.fontSize(8).font('Helvetica').fillColor('#111111');
  const addr = order.shippingAddress || {};
  doc.text(addr.name || order.customer?.name || '',     40, hdrBottom + 20);
  if (addr.line1) doc.text(addr.line1,                  40, doc.y);
  if (addr.line2) doc.text(addr.line2,                  40, doc.y);
  const cityLine = [addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
  if (cityLine) doc.text(cityLine,                      40, doc.y);
  if (addr.phone) doc.text(`Ph: ${addr.phone}`,         40, doc.y);

  // Place of supply drives CGST+SGST vs IGST below — state the delivery
  // state explicitly rather than leaving it implied by the column headers.
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#333333')
     .text(`Place of Supply: ${addr.state || '—'}`, 40, doc.y + 4);

  /* Payment info — right column */
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#333333').text('PAYMENT', 360, hdrBottom + 8, { width: 195, align: 'right' });
  doc.fontSize(8).font('Helvetica').fillColor('#555555');
  doc.text(`Method: ${order.payment?.method || 'COD'}`, 360, hdrBottom + 20, { width: 195, align: 'right' });
  doc.text(`Status: ${order.payment?.status || 'pending'}`, 360, doc.y,   { width: 195, align: 'right' });

  const addrBottom = Math.max(doc.y, hdrBottom + 80) + 10;
  drawHLine(doc, addrBottom);

  /* ── ITEMS TABLE ─────────────────────────────────────── */
  // Prices are GST-inclusive — GST is NOT added on top of "Price". It is shown
  // as an informational breakdown: Taxable Value + GST (CGST+SGST or IGST) = Price.
  // This uses the SAME splitInclusivePrice() helper as taxCalculator.js/calculateTax
  // (the single shared source of truth) rather than recomputing tax independently.
  const COL_W = [20, 125, 40, 30, 55, 55, 35, 45, 35, 55];
  const taxType = order.taxType || 'intra';
  const headers = taxType === 'intra'
    ? ['#', 'Description', 'HSN', 'Qty', 'Price', 'Taxable Val', 'CGST%', 'CGST', 'SGST%', 'SGST']
    : ['#', 'Description', 'HSN', 'Qty', 'Price', 'Taxable Val', 'IGST%', 'IGST', '', ''];

  const tableTop = addrBottom + 8;

  // Header row background
  doc.rect(40, tableTop, pageW, 16).fill('#f0f0f0');
  tableRow(doc, headers, tableTop, COL_W, true);
  doc.fillColor('#111111');

  let rowY = tableTop + 16;
  let srNo = 1;

  for (const item of order.items || []) {
    const gstSlab   = item.gstSlab || 0;
    const lineTotal = item.unitPrice * item.qty; // GST-inclusive — what was actually charged
    const { taxableAmt, cgst, sgst, igst } = splitInclusivePrice(lineTotal, gstSlab, taxType);

    const cgstRate = taxType === 'intra' ? gstSlab / 2 : 0;
    const sgstRate = taxType === 'intra' ? gstSlab / 2 : 0;
    const igstRate = taxType === 'inter' ? gstSlab : 0;

    // Flag a missing HSN code visibly rather than leaving the cell blank —
    // a blank cell reads as "nothing to report," which understates a real
    // catalog data gap that needs fixing (Product.hsnCode not set).
    const hsnCell = item.hsnCode || 'MISSING';

    const cols = taxType === 'intra'
      ? [srNo, `${item.name}${item.size ? ` (${item.size})` : ''}${item.colour ? ` / ${item.colour}` : ''}`,
         hsnCell, item.qty, INR(lineTotal), INR(taxableAmt), pct(cgstRate), INR(cgst), pct(sgstRate), INR(sgst)]
      : [srNo, `${item.name}${item.size ? ` (${item.size})` : ''}${item.colour ? ` / ${item.colour}` : ''}`,
         hsnCell, item.qty, INR(lineTotal), INR(taxableAmt), pct(igstRate), INR(igst), '', ''];

    if (rowY > 720) { doc.addPage(); rowY = 40; }

    tableRow(doc, cols, rowY, COL_W);
    rowY += 16;
    drawHLine(doc, rowY, 40, 555);
    srNo++;
  }

  /* ── TOTALS ──────────────────────────────────────────── */
  // Prices are GST-inclusive: Subtotal + Shipping = Grand Total, with NO GST
  // added on top. The CGST/SGST/IGST split is shown as a separate, visually
  // distinct informational note — not as a row that sums into Grand Total —
  // so it can't be misread as an additional charge.
  const billing   = order.billing || {};
  const totalsX   = 370;
  const totalsW   = 185;
  rowY += 10;

  const totalsData = [
    ['Subtotal (GST-incl.)', INR(billing.subtotal || billing.taxableAmount)],
    ['Shipping',             INR(billing.shippingCharge || 0)],
    ...(billing.discount ? [['Savings vs MRP', `-${INR(billing.discount)}`]] : []),
    ['Grand Total',          INR(billing.grandTotal)]
  ];

  for (const [label, value] of totalsData) {
    const isGrand = label === 'Grand Total';
    doc.fontSize(isGrand ? 9 : 7.5)
       .font(isGrand ? 'Helvetica-Bold' : 'Helvetica')
       .fillColor('#111111')
       .text(label, totalsX, rowY, { width: 95, align: 'left' })
       .text(value, totalsX + 95, rowY, { width: 90, align: 'right' });
    if (isGrand) drawHLine(doc, rowY - 2, totalsX, totalsX + totalsW);
    rowY += isGrand ? 14 : 12;
  }

  // Informational GST breakdown — already included in the price above, not additive.
  rowY += 4;
  const gstNote = taxType === 'intra'
    ? `Includes GST — CGST ${INR(billing.cgst)} + SGST ${INR(billing.sgst)} (already part of the price above)`
    : `Includes GST — IGST ${INR(billing.igst)} (already part of the price above)`;
  doc.fontSize(6.5).font('Helvetica').fillColor('#888888')
     .text(gstNote, totalsX, rowY, { width: totalsW, align: 'left' });
  rowY += 10;

  /* ── FOOTER ──────────────────────────────────────────── */
  const footerY = 790;
  drawHLine(doc, footerY - 5);
  doc.fontSize(7).font('Helvetica').fillColor('#888888')
     .text('This is a computer-generated invoice and does not require a physical signature.', 40, footerY, {
       width: pageW, align: 'center'
     });

  doc.end();
  const buffer = await bufPromise;
  return buffer;
}

/* ═══════════════════════════════════════════════════════════
   GENERATE + UPLOAD + RETURN URL
═══════════════════════════════════════════════════════════ */
export async function generateAndUploadInvoice(order, store) {
  const buffer   = await generateInvoice(order, store);
  const publicId = `invoice_${order.orderNumber}`;
  const result   = await uploadPdf(buffer, publicId);
  return result.secure_url;
}
