# Referral Programme: Data Model (Phase 1)

MongoDB collections, all new. No existing collection was changed in Phase 1.
Units: money in **paise** (integers), percentages in **basis points** (1% = 100 bps). The admin UI converts from rupees and percent.

| Collection | Purpose | Mutable? |
|---|---|---|
| `promoters` | Promoter profile, KYC and agreement state | Yes (audited) |
| `promoterdocuments` | Metadata of encrypted KYC/agreement files (bytes live in GridFS bucket `promoter_docs`) | Insert-only in practice |
| `referralcodes` | Codes and their discount rules | Yes (audited) |
| `commissionrates` | Rate history per category / promoter | **Append-only** (enforced in code) |
| `referralsettings` | Setting history; the newest row per key is current | **Append-only** |
| `referralauditlogs` | Who did what, with scrubbed before/after | **Append-only** |

"Append-only" is enforced by Mongoose hooks that reject update, delete and re-save. It protects against buggy code paths; it does not stop someone with direct database access, so keep database credentials tight.

## promoters
`name, mobile (unique), email, address{line1,line2,city,pincode}, stateCode, dob, gstRegistered, bankIfsc, bankHolderName, socialHandles[], audienceSize, notes, status, kycStatus, kycNotes, agreementStatus, agreementVersion, agreementSignedAt, agreementAcceptance{method,recordedBy,ip,userAgent}, agreementFileRef, tdsApplicable, gstOnCommissionApplicable, strikes[], createdBy`

Sensitive fields (never returned by the API, `select:false`):
- `panEnc`, `gstinEnc`, `bankAccountEnc`: AES-256-GCM ciphertext (`v1:<base64 iv|tag|ciphertext>`).
- `panLast4`, `gstinLast4`, `bankLast4`: the only clear-text parts, used for masked display.
- `panHash`, `bankHash`: keyed HMAC-SHA256 "blind index" for duplicate detection (unique, sparse). Not reversible.

Status values: `status` pending / active / suspended / terminated; `kycStatus` pending / verified / rejected; `agreementStatus` not_sent / sent / signed / expired.
Rule: `active` requires `kycStatus = verified` AND `agreementStatus = signed`. A terminated promoter cannot be reactivated.

## referralcodes
`code (unique, uppercase), promoterId, status (active|paused|expired), pausedReason, discountType (percent|flat), discountValue (bps | paise), discountCapPaise, minOrderPaise, validFrom, validTo, usageLimitTotal, usageLimitPerCustomer, categoryScope[], excludeSaleItems (default true), combinable (default false), timesUsed, createdBy`

Code alphabet: `A-Z` without `I, L, O` and `2-9` (no `0`, `1`), 4-20 characters. `timesUsed` is a denormalised counter; the source of truth will be the order-referral rows added in Phase 2.
Suspending or terminating a promoter pauses their active codes (`pausedReason = promoter_suspended`); re-activating restores only those.

## commissionrates
`category (kids|women|men|accessories, absent = all), promoterId (absent = everyone), rateBps (0-10000), effectiveFrom, note, createdBy`

Lookup order for an order on date D: promoter+category override, promoter all-categories, category default, global default; within each tier the latest `effectiveFrom <= D` wins. No match means no commission (0) and the order will be flagged in Phase 2.

## referralsettings keys and defaults
`enabled=false, return_window_days=10, min_payout_paise=50000, payout_day=5, commission_base=NET_EX_GST, margin_guard_max_pct=40, margin_guard_mode=warn, tds_enabled=false, tds_section="", tds_rate_bps=0, tds_annual_threshold_paise=0, gst_on_commission_bps=1800, reevaluate_gst_slab=false, fraud_velocity_orders_24h=5, fraud_return_rate_alert_pct=40, agreement_template_version=v1, agreement_grace_days=30, terms_url, support_contact`

TDS and slab re-evaluation ship **off** and zero until the CA confirms.

## referralauditlogs
`actorId, actorName, role, action, entity, entityId, before, after, reason, ip, userAgent, createdAt`. `before/after` are scrubbed: keys ending `Enc` or `Hash`, and anything named password/secret/token, never appear. Sensitive reveals and document downloads write the audit row **first**; if that write fails, no data is returned.

## Planned in later phases (not created yet)
`order_referrals`, `order_referral_lines`, `commission_ledger`, `payout_batches`, `payout_items`, `referral_fraud_flags`, `referral_clicks`, plus an optional `items[].referralDiscount` field on orders (see the discovery report, section 8.1).

## Rollback
Setting `REFERRAL_ENABLED` to false (or removing it) stops the module from loading. The collections remain and are harmless. To remove entirely, drop the six collections and the GridFS bucket `promoter_docs`.

---

## Phase 2 additions (money path)

All amounts are integer **paise**; rates are **bps**. Everything below is additive; no existing collection is altered except optional fields.

**Existing collections, new optional fields (no defaults, absent on legacy orders)**
- `orders.items[].referralDiscount` (rupees) — customer trade discount allocated to the line.
- `orders.billing.referralDiscount`, `orders.billing.referralCode`.
- `pendingcheckouts.referral` `{codeId, code, discountPaise, lineDiscountsPaise[]}` — the discount agreed at `create-order`, honoured when the paid order is created (webhook/verify/reconciler), even if the code changed meanwhile.

**New collections**
- `orderreferrals` — one per referred order: code, promoter, discount total, commission total, `commissionBaseRule`, hashed `customerKeys` (for per-customer limits; never shown to promoters), `flags` (`noRate`, `slabReevaluated`, `fraudHold`), `status` (`applied` / `void`).
- `orderreferrallines` (append-only) — per item snapshot: gross, discount, charged, taxable, GST, HSN, rate bps and rate source used, commission base and amount.
- `commissionledger` (append-only, signed paise) — buckets `pending` / `payable`; entry types `accrual_pending`, `eligible` (pending -> payable after the return window), `reversal_*` (cancel/return), `adjustment` (manual, reason required). Unique `idempotencyKey` makes every writer safe to retry.
- `referraljobstates` — lease lock + last result for the sweeper.

**Invariants**
1. Invoice / GST taxable value = list price - referral discount (true trade discount). Commission never reduces invoice, GST or turnover.
2. A balance is always the sum of ledger rows; nothing is updated in place.
3. Whole-order returns only; return window starts at the admin-marked "delivered" timeline entry (default 10 days, setting `return_window_days`).

---

## Phase 3 additions (payouts)

- `payoutbatches` — `batchNo` (`PB/<FY>/0001`), `fy`, `status` draft -> approved -> paid (or cancelled), totals, who created/approved/cancelled.
- `payoutitems` — one per promoter per batch: `voucherNo` (`SAG/PO/<FY>/0001`, the payout voucher / self-invoice number), snapshot of commission, GST (CGST/SGST/IGST), TDS (base, rate, section), net, `status` draft/approved/paid/failed/cancelled, `utr`, `paidAt`, `failureReason`. Only masked PAN/GSTIN (last 4) are stored here.
- `referralcounters` — atomic sequences for batch and voucher numbers, per financial year.
- `commissionledger` gains entry type `payout_void` (+, payable) which returns funds when an approved payout fails or is cancelled. `payout` (-, payable) is written when a batch is **approved**.
- New setting `store_state_code` (default `05`) decides CGST+SGST (same state) vs IGST.

**Money flow:** draft (nothing reserved) -> approve (ledger `payout` debit per item, after re-checking the live balance) -> bank transfer outside the system -> mark paid with UTR. Failure/cancel before payment writes `payout_void`. Every step is idempotent (`<itemId>:payout`, `<itemId>:void`).

**Tax maths** (all configurable, default OFF; confirm with your CA): net paid = commission + GST on commission - TDS. TDS is computed on commission excluding GST; with an annual threshold only the part of the payout that takes the financial-year total over the threshold is taxed. Payouts never touch customer invoices, store GST returns or turnover.

---

## Phase 4 additions (fraud, reports)

- `referralfraudflags` — `key` (unique; `<orderReferralId>:<rule>` or `promoter:<id>:<rule>:<YYYY-MM>`), promoter, optional order, `rule`, `severity` low/medium/high, `detail`, `status` open/cleared/confirmed, resolver, note.
- `orderreferrals.flags` gains `fraudScanned` (order checked once) and `fraudHold` (set when any flag was raised; cleared only when the last open flag is cleared) and `fraudConfirmed`.
- Ledger entry `reversal_fraud` shares the idempotency key `<lineId>:reversal` with cancel/return reversals, so one order can never be reversed twice.

**Rules (they only flag and hold; they never block a shopper at checkout):**
| Rule | Severity | Fires when |
|---|---|---|
| `self_referral` | high | buyer phone/email, or the delivery phone, matches the promoter |
| `address_match` | high | delivery address and pincode equal the promoter's own |
| `velocity` | medium | more than `fraud_velocity_orders_24h` orders with one code in 24h |
| `repeat_customer` | medium | same buyer used the promoter's codes 3+ times in 30 days |
| `return_rate` | medium | promoter-level: at least 5 orders in 30 days and cancel/return share >= `fraud_return_rate_alert_pct`; alert only, no hold |

Scanning runs inside the existing 6-hourly sweeper, before an order could be made payable, so a flagged order is held in the same pass.

---

## Phase 5 additions (links, notifications, portal)

- `referralclickdays` — one counter row per code per IST day (`clicks`). No IP, no visitor id, nothing personal is stored.
- `promoternotifications` — email outbox. Unique `key` per underlying event (`led:<ledgerId>` / `pay:<payoutItemId>`), `status` pending/sent/failed/skipped, `attempts` (gives up after 5). `data` holds amounts only.
- `promoterlogincodes` — hashed one-time login codes (HMAC), `attempts`, `used`, TTL-expiring after 10 minutes.
- `promoters.notifyEmail` (default true) — the promoter's own opt-out.
- New settings: `portal_enabled` (default **off**), `notifications_enabled` (default on).
