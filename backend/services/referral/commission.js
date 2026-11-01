// Pure commission maths (integer paise, no I/O).
import { splitInclusivePrice } from '../../utils/taxCalculator.js';
import { roundHalfUp } from './discount.js';

/**
 * Per-line commission base. Default NET_EX_GST = taxable value of the line AFTER the
 * customer discount, excluding GST and shipping. The taxable value is derived with
 * the same shared helper the invoice and GST reports use, so commission, invoice
 * and GST report agree to the paisa.
 */
export function commissionBasePaise({ rule = 'NET_EX_GST', listPaise, chargedPaise, gstSlab, taxType }) {
  const taxableOf = (paise) => Math.round(splitInclusivePrice(paise / 100, gstSlab, taxType).taxableAmt * 100);
  if (rule === 'LIST_EX_GST') return taxableOf(listPaise);
  if (rule === 'NET_INCL_GST') return chargedPaise;
  return taxableOf(chargedPaise);
}

/** commission = round-half-up(base x rate). rateBps: 1% = 100. */
export const commissionPaise = (basePaise, rateBps) => roundHalfUp((basePaise * (rateBps || 0)) / 10000);

/** Split a line's charged amount into taxable and GST (paise), via the shared helper. */
export function lineTaxPaise({ chargedPaise, gstSlab, taxType }) {
  const r = splitInclusivePrice(chargedPaise / 100, gstSlab, taxType);
  return { taxablePaise: Math.round(r.taxableAmt * 100), gstPaise: Math.round(r.gstAmount * 100) };
}
