/* ── shared layout ── */
const layout = (title, body) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F8F6F3;font-family:'Inter',Arial,sans-serif;color:#0A0A0A;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr><td align="center" style="padding:40px 16px;">

      <table width="600" cellpadding="0" cellspacing="0" role="presentation"
             style="background:#ffffff;border-radius:4px;overflow:hidden;max-width:600px;width:100%;">

        <!-- HEADER -->
        <tr>
          <td style="background:#0A0A0A;padding:28px 40px;">
            <span style="color:#C9A84C;font-size:22px;letter-spacing:5px;font-weight:700;
                         font-family:'Playfair Display',Georgia,serif;">SAGONA</span>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:40px;">
            ${body}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#F8F6F3;padding:24px 40px;text-align:center;
                     font-size:12px;color:#999990;border-top:1px solid #E8E5E0;">
            © ${new Date().getFullYear()} SAGONA. All rights reserved.<br>
            <a href="https://sagona.in" style="color:#C9A84C;text-decoration:none;">sagona.in</a>
            &nbsp;·&nbsp;
            <a href="mailto:care@sagona.in" style="color:#C9A84C;text-decoration:none;">care@sagona.in</a>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

const INR  = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const h2   = (t) => `<h2 style="font-size:20px;font-weight:600;margin:0 0 8px;color:#0A0A0A;">${t}</h2>`;
const p    = (t) => `<p style="font-size:14px;line-height:1.7;color:#555550;margin:0 0 16px;">${t}</p>`;
const btn  = (label, url) =>
  `<a href="${url}" style="display:inline-block;background:#C9A84C;color:#fff;
    font-size:13px;letter-spacing:1px;padding:14px 32px;text-decoration:none;
    border-radius:2px;font-weight:500;margin-top:8px;">${label}</a>`;
const divider = `<hr style="border:none;border-top:1px solid #E8E5E0;margin:28px 0;">`;

const itemsTable = (items = []) => `
<table width="100%" cellpadding="0" cellspacing="0" role="presentation"
       style="font-size:13px;border-collapse:collapse;margin:20px 0;">
  <thead>
    <tr style="background:#F8F6F3;">
      <th style="text-align:left;padding:10px 12px;color:#555550;font-weight:500;border-bottom:1px solid #E8E5E0;">Item</th>
      <th style="text-align:center;padding:10px 8px;color:#555550;font-weight:500;border-bottom:1px solid #E8E5E0;">Qty</th>
      <th style="text-align:right;padding:10px 12px;color:#555550;font-weight:500;border-bottom:1px solid #E8E5E0;">Price</th>
    </tr>
  </thead>
  <tbody>
    ${items.map((item) => `
    <tr>
      <td style="padding:12px;border-bottom:1px solid #E8E5E0;color:#0A0A0A;">
        ${item.name}
        ${item.size   ? `<span style="color:#999990;font-size:12px;"> · ${item.size}</span>` : ''}
        ${item.colour ? `<span style="color:#999990;font-size:12px;"> / ${item.colour}</span>` : ''}
      </td>
      <td style="padding:12px;border-bottom:1px solid #E8E5E0;text-align:center;">${item.qty}</td>
      <td style="padding:12px;border-bottom:1px solid #E8E5E0;text-align:right;color:#C9A84C;">
        ${INR(item.unitPrice * item.qty)}
      </td>
    </tr>`).join('')}
  </tbody>
</table>`;

const billingBlock = (billing = {}, taxType = 'intra') => `
<table width="100%" cellpadding="0" cellspacing="0" role="presentation"
       style="font-size:13px;border-collapse:collapse;">
  <tr>
    <td style="padding:6px 0;color:#555550;">Subtotal</td>
    <td style="padding:6px 0;text-align:right;">${INR(billing.subtotal)}</td>
  </tr>
  ${billing.shippingCharge > 0 ? `
  <tr>
    <td style="padding:6px 0;color:#555550;">Shipping</td>
    <td style="padding:6px 0;text-align:right;">${INR(billing.shippingCharge)}</td>
  </tr>` : `
  <tr>
    <td style="padding:6px 0;color:#555550;">Shipping</td>
    <td style="padding:6px 0;text-align:right;color:#16a34a;">Free</td>
  </tr>`}
  ${taxType === 'intra' ? `
  <tr>
    <td style="padding:6px 0;color:#555550;">CGST</td>
    <td style="padding:6px 0;text-align:right;">${INR(billing.cgst)}</td>
  </tr>
  <tr>
    <td style="padding:6px 0;color:#555550;">SGST</td>
    <td style="padding:6px 0;text-align:right;">${INR(billing.sgst)}</td>
  </tr>` : `
  <tr>
    <td style="padding:6px 0;color:#555550;">IGST</td>
    <td style="padding:6px 0;text-align:right;">${INR(billing.igst)}</td>
  </tr>`}
  <tr style="border-top:2px solid #0A0A0A;">
    <td style="padding:10px 0;font-weight:700;font-size:15px;">Grand Total</td>
    <td style="padding:10px 0;text-align:right;font-weight:700;font-size:15px;color:#C9A84C;">
      ${INR(billing.grandTotal)}
    </td>
  </tr>
</table>`;

/* ══════════════════════════════════════════════════════════
   1. ORDER CONFIRMATION
══════════════════════════════════════════════════════════ */
export const orderConfirmationTemplate = (order) => {
  const addr = order.shippingAddress || {};
  const addrLine = [addr.line1, addr.line2, addr.city, addr.state, addr.pincode]
    .filter(Boolean).join(', ');

  const body = `
    ${h2('Order Confirmed')}
    ${p(`Thank you, ${order.customer?.name || 'Valued Customer'}! Your order has been placed successfully.`)}

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="background:#F8F6F3;border-radius:4px;padding:16px 20px;margin-bottom:24px;font-size:13px;">
      <tr>
        <td style="color:#555550;padding:4px 0;">Order Number</td>
        <td style="text-align:right;font-weight:600;color:#0A0A0A;">${order.orderNumber}</td>
      </tr>
      <tr>
        <td style="color:#555550;padding:4px 0;">Payment</td>
        <td style="text-align:right;">${order.payment?.method || 'COD'}</td>
      </tr>
      <tr>
        <td style="color:#555550;padding:4px 0;">Deliver to</td>
        <td style="text-align:right;">${addrLine || '—'}</td>
      </tr>
    </table>

    ${itemsTable(order.items)}
    ${billingBlock(order.billing, order.taxType)}

    ${order.invoiceUrl ? `${divider}
    <p style="font-size:13px;color:#555550;margin:0 0 16px;">Your tax invoice is ready:</p>
    ${btn('Download Invoice', order.invoiceUrl)}` : ''}

    ${divider}
    ${p('We will notify you when your order is dispatched. Questions? Reply to this email or visit <a href="https://sagona.in" style="color:#C9A84C;">sagona.in</a>.')}
  `;

  return layout(`Order ${order.orderNumber} Confirmed — SAGONA`, body);
};

/* ══════════════════════════════════════════════════════════
   2. ORDER STATUS UPDATE
══════════════════════════════════════════════════════════ */
const STATUS_LABELS = {
  confirmed: 'Order Confirmed',
  packed:    'Order Packed',
  shipped:   'Out for Delivery',
  delivered: 'Delivered',
  returned:  'Return Initiated',
  cancelled: 'Order Cancelled'
};

const STATUS_ICONS = {
  confirmed: '✓',
  packed:    '📦',
  shipped:   '🚚',
  delivered: '🎉',
  returned:  '↩',
  cancelled: '✕'
};

export const statusUpdateTemplate = (order) => {
  const statusLabel = STATUS_LABELS[order.status] || order.status;
  const icon        = STATUS_ICONS[order.status]  || '•';
  const trackingInfo = order.shipments?.find((s) => s.trackingId);

  const body = `
    ${h2(`${icon} ${statusLabel}`)}
    ${p(`Your order <strong>${order.orderNumber}</strong> has been updated.`)}

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="background:#F8F6F3;border-radius:4px;padding:16px 20px;margin-bottom:24px;font-size:13px;">
      <tr>
        <td style="color:#555550;padding:4px 0;">Order</td>
        <td style="text-align:right;font-weight:600;">${order.orderNumber}</td>
      </tr>
      <tr>
        <td style="color:#555550;padding:4px 0;">Status</td>
        <td style="text-align:right;color:#C9A84C;font-weight:600;">${statusLabel}</td>
      </tr>
      ${trackingInfo ? `
      <tr>
        <td style="color:#555550;padding:4px 0;">Tracking ID</td>
        <td style="text-align:right;">${trackingInfo.trackingId} (${trackingInfo.courier || ''})</td>
      </tr>` : ''}
    </table>

    ${btn('View Order', `https://sagona.in/order-success.html`)}

    ${order.invoiceUrl && order.status === 'delivered' ? `
    ${divider}
    ${p('Your invoice is available for download:')}
    ${btn('Download Invoice', order.invoiceUrl)}` : ''}

    ${divider}
    ${p('Need help? Contact us at <a href="mailto:care@sagona.in" style="color:#C9A84C;">care@sagona.in</a>')}
  `;

  return layout(`Order Update: ${statusLabel} — SAGONA`, body);
};

/* ══════════════════════════════════════════════════════════
   3. WELCOME EMAIL
══════════════════════════════════════════════════════════ */
export const welcomeTemplate = (user) => {
  const body = `
    ${h2(`Welcome to SAGONA, ${user.name}!`)}
    ${p('We\'re delighted to have you. SAGONA is a premium Indian kidswear and lifestyle brand, crafted with care for modern families.')}

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="margin:24px 0;">
      ${[
        ['Shop new arrivals', 'https://sagona.in/shop.html'],
        ['Explore collections', 'https://sagona.in/shop.html'],
        ['My Account', 'https://sagona.in/login.html']
      ].map(([label, url]) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #E8E5E0;">
          <a href="${url}" style="color:#C9A84C;font-size:14px;text-decoration:none;">
            → ${label}
          </a>
        </td>
      </tr>`).join('')}
    </table>

    ${btn('Start Shopping', 'https://sagona.in/shop.html')}

    ${divider}
    ${p('Your loyalty journey starts now. Earn 1 point for every ₹100 spent and redeem them on future purchases.')}
  `;

  return layout('Welcome to SAGONA', body);
};

/* ══════════════════════════════════════════════════════════
   4. PASSWORD RESET (OTP)
══════════════════════════════════════════════════════════ */
export const passwordResetTemplate = (user, otp) => {
  const body = `
    ${h2('Reset Your Password')}
    ${p(`Hi ${user.name}, we received a request to reset your SAGONA account password.`)}

    <div style="background:#F8F6F3;border-radius:4px;padding:28px;text-align:center;margin:24px 0;">
      <p style="font-size:12px;color:#999990;margin:0 0 8px;letter-spacing:1px;text-transform:uppercase;">
        Your OTP (valid for 15 minutes)
      </p>
      <p style="font-size:36px;font-weight:700;letter-spacing:10px;color:#0A0A0A;margin:0;">
        ${otp}
      </p>
    </div>

    ${p('Enter this code on the password reset page. <strong>Do not share this code with anyone.</strong>')}
    ${p('If you did not request a password reset, please ignore this email — your password will not change.')}
    ${divider}
    ${p('<span style="font-size:12px;color:#999990;">This OTP expires in 15 minutes.</span>')}
  `;

  return layout('Password Reset — SAGONA', body);
};

/* ══════════════════════════════════════════════════════════
   5. RESTOCK ALERT
══════════════════════════════════════════════════════════ */
export const restockAlertTemplate = (user, product) => {
  const image = product.images?.[0] || product.image || '';
  const price = INR(product.price);
  const mrp   = product.mrp && product.mrp > product.price ? INR(product.mrp) : null;

  const body = `
    ${h2('Back in Stock!')}
    ${p(`Good news, ${user.name}! An item on your wishlist is available again.`)}

    ${image ? `<img src="${image}" alt="${product.name}"
      style="width:100%;max-height:300px;object-fit:cover;border-radius:4px;margin:0 0 24px;">` : ''}

    <h3 style="font-size:17px;font-weight:600;margin:0 0 6px;">${product.name}</h3>
    <p style="font-size:15px;margin:0 0 4px;color:#C9A84C;font-weight:600;">${price}
      ${mrp ? `<span style="font-size:12px;color:#999990;text-decoration:line-through;margin-left:6px;">${mrp}</span>` : ''}
    </p>
    ${product.category ? `<p style="font-size:12px;color:#999990;margin:0 0 24px;text-transform:capitalize;">${product.category}</p>` : ''}

    ${btn('Shop Now', `https://sagona.in/product.html?id=${product._id}`)}

    ${divider}
    ${p('<span style="font-size:12px;color:#999990;">Popular items sell out quickly. Order soon to avoid disappointment.</span>')}
  `;

  return layout(`Back in Stock: ${product.name} — SAGONA`, body);
};
