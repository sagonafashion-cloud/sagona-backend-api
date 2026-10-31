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
