import PDFDocument from 'pdfkit';
import { v2 as cloudinary } from 'cloudinary';

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

/* ── Drawing helpers ── */
const INR = (n) => `₹${Number(n || 0).toFixed(2)}`;
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
  doc.fontSize(22).font('Helvetica-Bold').fillColor('#111111').text('SAGONA', 40, 40);
  doc.fontSize(8).font('Helvetica').fillColor('#555555');
  if (store) {
    doc.text(store.name, 40, 66);
    doc.text([store.address, store.city, store.state, store.pincode].filter(Boolean).join(', '), 40, 78);
    if (store.gstin) doc.text(`GSTIN: ${store.gstin}`, 40, 90);
    if (store.phone) doc.text(`Ph: ${store.phone}`,    40, 100);
  }

  /* Invoice meta — right column */
  doc.fontSize(14).font('Helvetica-Bold').fillColor('#111111')
     .text('TAX INVOICE', 360, 40, { width: 195, align: 'right' });
  doc.fontSize(8).font('Helvetica').fillColor('#555555');
  doc.text(`Invoice No: ${order.orderNumber}`,          360, 62, { width: 195, align: 'right' });
  doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, 360, 74, { width: 195, align: 'right' });
  doc.text(`Order Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, 360, 86, { width: 195, align: 'right' });

  const hdrBottom = 115;
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

  /* Payment info — right column */
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#333333').text('PAYMENT', 360, hdrBottom + 8, { width: 195, align: 'right' });
  doc.fontSize(8).font('Helvetica').fillColor('#555555');
  doc.text(`Method: ${order.payment?.method || 'COD'}`, 360, hdrBottom + 20, { width: 195, align: 'right' });
  doc.text(`Status: ${order.payment?.status || 'pending'}`, 360, doc.y,   { width: 195, align: 'right' });

  const addrBottom = Math.max(doc.y, hdrBottom + 80) + 10;
  drawHLine(doc, addrBottom);

  /* ── ITEMS TABLE ─────────────────────────────────────── */
  const COL_W = [20, 130, 45, 40, 55, 40, 55, 40, 55, 35];
  // Sr | Description | HSN | Qty | Unit Price | CGST%/IGST% | CGST/IGST | SGST% | SGST | Total
  const taxType = order.taxType || 'intra';
  const headers = taxType === 'intra'
    ? ['#', 'Description', 'HSN', 'Qty', 'Unit Price', 'CGST%', 'CGST', 'SGST%', 'SGST', 'Total']
    : ['#', 'Description', 'HSN', 'Qty', 'Unit Price', 'IGST%', 'IGST', '', '', 'Total'];

  const tableTop = addrBottom + 8;

  // Header row background
  doc.rect(40, tableTop, pageW, 16).fill('#f0f0f0');
  tableRow(doc, headers, tableTop, COL_W, true);
  doc.fillColor('#111111');

  let rowY = tableTop + 16;
  let srNo = 1;

  for (const item of order.items || []) {
    const gstSlab = item.gstSlab || 0;
    let cgstRate = 0, sgstRate = 0, igstRate = 0;
    let cgstAmt = 0, sgstAmt = 0, igstAmt = 0;

    if (taxType === 'intra') {
      cgstRate = gstSlab / 2;
      sgstRate = gstSlab / 2;
      cgstAmt  = item.cgst || ((item.unitPrice * item.qty * cgstRate) / 100);
      sgstAmt  = item.sgst || cgstAmt;
    } else {
      igstRate = gstSlab;
      igstAmt  = item.igst || ((item.unitPrice * item.qty * igstRate) / 100);
    }

    const total = item.unitPrice * item.qty + cgstAmt + sgstAmt + igstAmt;

    const cols = taxType === 'intra'
      ? [srNo, `${item.name}${item.size ? ` (${item.size})` : ''}${item.colour ? ` / ${item.colour}` : ''}`,
         item.hsnCode || '', item.qty, INR(item.unitPrice), pct(cgstRate), INR(cgstAmt), pct(sgstRate), INR(sgstAmt), INR(total)]
      : [srNo, `${item.name}${item.size ? ` (${item.size})` : ''}${item.colour ? ` / ${item.colour}` : ''}`,
         item.hsnCode || '', item.qty, INR(item.unitPrice), pct(igstRate), INR(igstAmt), '', '', INR(total)];

    if (rowY > 720) { doc.addPage(); rowY = 40; }

    tableRow(doc, cols, rowY, COL_W);
    rowY += 16;
    drawHLine(doc, rowY, 40, 555);
    srNo++;
  }

  /* ── TOTALS ──────────────────────────────────────────── */
  const billing   = order.billing || {};
  const totalsX   = 370;
  const totalsW   = 185;
  rowY += 10;

  const totalsData = [
    ['Subtotal',    INR(billing.subtotal    || billing.taxableAmount)],
    ['Shipping',    INR(billing.shippingCharge || 0)],
    ...(taxType === 'intra'
      ? [['CGST', INR(billing.cgst)], ['SGST', INR(billing.sgst)]]
      : [['IGST', INR(billing.igst)]]
    ),
    ...(billing.discount ? [['Discount', `-${INR(billing.discount)}`]] : []),
    ['Grand Total', INR(billing.grandTotal)]
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

  /* ── FOOTER ──────────────────────────────────────────── */
  const footerY = 790;
  drawHLine(doc, footerY - 5);
  doc.fontSize(7).font('Helvetica').fillColor('#888888')
     .text('This is a computer-generated invoice. No signature required.', 40, footerY, {
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
