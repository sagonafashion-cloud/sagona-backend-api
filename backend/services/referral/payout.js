// Pure payout maths: no I/O, fully unit-testable. All amounts are integer paise, rates in bps.
//
// Tax treatment (rates/applicability are CONFIGURABLE and default OFF; confirm with your CA):
//  - GST on commission: charged ON TOP of the commission (the promoter invoices it), so
//      gst = round(commission * gst_on_commission_bps / 10000), only for promoters flagged
//      gstOnCommissionApplicable. Same state as the store => CGST+SGST, else IGST.
//  - TDS: deducted on the commission EXCLUDING GST (GST shown separately on the invoice).
//      With an annual threshold, only the part of this payout that takes the financial-year
//      total above the threshold is subject to TDS.
//  - net paid to the promoter = commission + GST - TDS.
// Nothing here changes any customer invoice, GST return of the store or turnover.

const IST_MS = 5.5 * 3600 * 1000;

/** Financial year (Apr-Mar, IST) containing `date`. */
export function financialYear(date = new Date()) {
  const ist = new Date(new Date(date).getTime() + IST_MS);
  const y = ist.getUTCFullYear();
  const startYear = ist.getUTCMonth() >= 3 ? y : y - 1;
  const start = new Date(Date.UTC(startYear, 3, 1) - IST_MS);
  const end = new Date(Date.UTC(startYear + 1, 3, 1) - IST_MS);
  return { label: `${startYear}-${String(startYear + 1).slice(-2)}`, start, end };
}

const roundHalfUp = (n) => Math.floor(n + 0.5);

/**
 * @param promoter  {status,kycStatus,agreementStatus,bankLast4,bankIfsc,bankHolderName,panLast4,
 *                   gstRegistered,gstOnCommissionApplicable,tdsApplicable,stateCode}
 * @param settings  referral settings
 * @param payablePaise  current payable-bucket balance
 * @param ytdGrossPaise commission already paid/approved to this promoter in the same financial year
 */
export function planPayout({ promoter, settings, payablePaise, ytdGrossPaise = 0 }) {
  const blockers = [];
  const p = promoter || {};
  if (p.status !== 'active') blockers.push('Promoter is not active');
  if (p.kycStatus !== 'verified') blockers.push('KYC not verified');
  if (p.agreementStatus !== 'signed') blockers.push('Agreement not signed');
  if (!(p.bankLast4 && p.bankIfsc && p.bankHolderName)) blockers.push('Bank details missing');
  if (!(payablePaise > 0)) blockers.push('Nothing payable');
  else if (payablePaise < settings.min_payout_paise) blockers.push('Below minimum payout');

  const gross = Math.max(0, payablePaise | 0);

  // GST on commission
  let gst = 0, cgst = 0, sgst = 0, igst = 0;
  const gstApplies = !!p.gstOnCommissionApplicable && settings.gst_on_commission_bps > 0;
  if (gstApplies) {
    if (!p.gstRegistered) blockers.push('GST applies but promoter has no GSTIN on file');
    if (!p.stateCode) blockers.push('GST applies but promoter state is missing');
    gst = roundHalfUp((gross * settings.gst_on_commission_bps) / 10000);
    if (p.stateCode && String(p.stateCode) === String(settings.store_state_code)) {
      cgst = Math.floor(gst / 2); sgst = gst - cgst;
    } else igst = gst;
  }

  // TDS
  let tds = 0, tdsBase = 0;
  const tdsApplies = !!settings.tds_enabled && !!p.tdsApplicable && settings.tds_rate_bps > 0;
  if (tdsApplies) {
    if (!p.panLast4) blockers.push('TDS applies but PAN is missing');
    const threshold = settings.tds_annual_threshold_paise || 0;
    tdsBase = threshold > 0 ? Math.max(0, ytdGrossPaise + gross - Math.max(ytdGrossPaise, threshold)) : gross;
    tds = roundHalfUp((tdsBase * settings.tds_rate_bps) / 10000);
  }

  return {
    eligible: blockers.length === 0,
    blockers,
    grossPaise: gross, gstPaise: gst, cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst,
    tdsPaise: tds, tdsBasePaise: tdsBase, tdsRateBps: tdsApplies ? settings.tds_rate_bps : 0, tdsSection: tdsApplies ? settings.tds_section : '',
    netPaise: gross + gst - tds
  };
}

/** Promoter statement from ledger rows (already filtered to one promoter). No customer data. */
export function buildStatement(rows, from, to) {
  const f = new Date(from).getTime(), t = new Date(to).getTime();
  const s = { openingPaise: 0, accruedPaise: 0, reversedPaise: 0, adjustedPaise: 0, paidOutPaise: 0, closingPaise: 0, pendingClosingPaise: 0, payableClosingPaise: 0 };
  for (const r of rows) {
    const at = new Date(r.eventAt).getTime();
    if (at >= t) continue;
    s.closingPaise += r.amountPaise;
    if (r.bucket === 'pending') s.pendingClosingPaise += r.amountPaise; else s.payableClosingPaise += r.amountPaise;
    if (at < f) { s.openingPaise += r.amountPaise; continue; }
    if (r.entryType === 'accrual_pending') s.accruedPaise += r.amountPaise;
    else if (r.entryType.startsWith('reversal_')) s.reversedPaise += r.amountPaise;
    else if (r.entryType === 'adjustment') s.adjustedPaise += r.amountPaise;
    else if (r.entryType === 'payout' || r.entryType === 'payout_void') s.paidOutPaise += r.amountPaise;
    // release_pending / accrual_eligible only move money between buckets: net zero overall
  }
  return s;
}

/** CSV with formula-injection protection (cells starting = + - @ are prefixed with '). */
export function toCsv(headers, rows) {
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n') + '\r\n';
}

export const rupees = (paise) => (Math.round(paise) / 100).toFixed(2);
