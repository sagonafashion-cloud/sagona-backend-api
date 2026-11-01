# Referral Programme: API Reference (Phase 1)

Base: `/api`. Everything below exists **only when `REFERRAL_ENABLED=true`**; otherwise every path returns 404.
Responses use the existing shape `{ success, data, ... }` or `{ success:false, message }`.

## Public

| Method | Path | Notes |
|---|---|---|
| GET | `/referral/status` | `{ data:{ enabled } }`. True only when the env flag AND the `enabled` setting are on. The storefront uses it to show or hide the code field. Reveals nothing else. |

(`POST /referral/validate` and `/referral/clear` arrive in Phase 2.)

## Admin (`/admin/promoters/...`)

All routes require an admin JWT. **Read** = `super_admin`, `finance_manager`. **Write** = `super_admin`. Both roles must have 2FA enabled (existing rule). `store_manager`, `content_editor` and `viewer` get 403. The admin limiter (50 requests per 15 minutes) applies.

### Meta, settings, audit
| Method | Path | Role | Body / query |
|---|---|---|---|
| GET | `/ping` | read | `{ programmeEnabled, encryptionConfigured, role, canWrite }` |
| GET | `/settings` | read | current values and defaults |
| PUT | `/settings` | write | partial object of known keys; only changed keys are stored; invalid values give 422 |
| GET | `/audit` | read | `entity, action (prefix), entityId, from, to, page, limit` |

### Commission rates (insert-only)
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/rates` | read | `promoterId?, category?`; newest first |
| GET | `/rates/effective` | read | `category?, promoterId?, at?` returns the rate that applied on that date, or null |
| POST | `/rates` | write | `{ category?, promoterId?, rateBps, effectiveFrom?, note? }`; margin guard may warn (200 plus `warnings`) or block (422) |

### Referral codes
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/codes` | read | `promoterId?, status?, q?, page, limit` |
| POST | `/codes` | write | `{ promoterId, code?, discountType, discountValue, discountCapPaise?, minOrderPaise?, validFrom?, validTo?, usageLimitTotal?, usageLimitPerCustomer?, categoryScope?, excludeSaleItems?, combinable? }`. Blank `code` generates a random one. |
| POST | `/codes/bulk` | write | same fields plus `count` (1-200) and `prefix` (<=8) |
| PUT | `/codes/:id` | write | partial update; the code text itself cannot change |
| POST | `/codes/:id/pause` `/resume` `/expire` | write | resume needs an active promoter and an unexpired code |

### Promoters
| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/` | read | `q, status, kycStatus, gstRegistered, page, limit`; masked fields only |
| POST | `/` | write | name, mobile, dob (18+) required; PAN, GSTIN (with check digit), bank account + IFSC + holder name validated; duplicates (mobile, PAN, bank) give 409 |
| GET | `/:id` | read | profile, codes, document metadata |
| PUT | `/:id` | write | same validation; re-encrypts changed sensitive fields |
| POST | `/:id/status` | write | `{ status, reason }`; `active` needs KYC verified and agreement signed; suspend/terminate need a reason and pause the codes |
| POST | `/:id/kyc` | write | `{ kycStatus, kycNotes? }`; refused while the promoter is active unless setting `verified` |
| POST | `/:id/agreement` | write | `{ agreementStatus, agreementVersion?, signedAt?, method?, documentId? }`; `signed` needs a version and records admin, IP and user agent |
| POST | `/:id/strike` | write | `{ reason }` |
| POST | `/:id/reveal` | write | `{ fields:['pan','gstin','bankAccount'], reason }`; audit row written first; response is `no-store` |
| POST | `/:id/documents` | write | multipart: `type` (pan, bank_proof, gst_certificate, id_proof, agreement), `file` (PDF/JPEG/PNG, 5 MB, signature-checked); stored encrypted |
| GET | `/:id/documents/:docId` | write | decrypted download; audit row written first |

### Error codes
401 not logged in; 403 role or 2FA; 404 not found; 409 conflict (duplicate, invalid state change); 422 validation; 503 encryption key not configured.

---

## Phase 2 endpoints

### Public
`POST /api/referral/validate` — rate limited (20 / 10 min / IP). Body `{ code, items:[{productId,qty,size?}], customer?:{phone,email} }`.
Success `200 { success:true, data:{ code, discount, newTotal } }` (rupees). **Any** failure returns `400 { success:false, message:"This code is not valid for this order" }`: the response never reveals whether a code exists, expired, hit a limit, or is the buyer's own. Precise reason is logged server-side only. Programme off -> `404`.

### Checkout integration
- `POST /api/payment/create-order` and `POST /api/orders` accept optional `referralCode`. Stale/invalid at order time -> `409 { referralInvalid:true, message }`; the checkout page clears the code and asks the shopper to review the new total.
- Responses/orders add `billing.referralDiscount`, `billing.referralCode` only when a code was applied.

### Admin (`/api/admin/promoters/...`, reads: super_admin + finance_manager, writes: super_admin)
| Method | Path | Purpose |
|---|---|---|
| GET | `/orders` | Referred orders (customer masked), filters promoter/code/date |
| GET | `/ledger` | Ledger entries, filters promoter/bucket/type/date |
| GET | `/ledger/balances` | Pending / payable per promoter |
| POST | `/ledger/adjust` | Manual adjustment `{promoterId, amountPaise (signed), bucket, reason}`; reason mandatory; audit-logged |

---

## Phase 3 endpoints (`/api/admin/promoters/...`)

Reads: super_admin + finance_manager. Writes and the bank file: super_admin only.

| Method | Path | Purpose |
|---|---|---|
| GET | `/payouts/preview` | Per promoter: commission, GST, TDS, net, eligibility and the exact blockers. Writes nothing |
| GET | `/payouts` | Batches (latest 100) |
| POST | `/payouts` | Create a DRAFT batch from eligible promoters. Optional `{promoterIds[], note}` |
| GET | `/payouts/:id` | Batch with items |
| POST | `/payouts/:id/approve` | Reserve funds in the ledger. Items whose balance dropped since drafting are cancelled, never overpaid |
| POST | `/payouts/:id/paid` | `{payments:[{itemId, utr}]}`; UTR 6-40 chars |
| POST | `/payouts/:id/cancel` | Draft or approved batches; returns reserved funds |
| GET | `/payouts/:id/bank-file` | CSV with full account numbers (approved batch only; strictly audited) |
| POST | `/payout-items/:itemId/fail` | `{reason}` (min 5 chars); returns funds to payable |
| GET | `/statements/:promoterId?from&to` | Opening, earned, reversals, adjustments, paid out, closing (pending/payable). No customer data |
| GET | `/exports/payouts?fy&status` | Accounting CSV (masked PAN/GSTIN) |
| GET | `/exports/tds?fy` | TDS working CSV with full PAN (strictly audited) |

A promoter is payable only if: active, KYC verified, agreement signed, bank details present, payable >= `min_payout_paise`, not already in an open batch, GSTIN + state present when GST applies, PAN present when TDS applies.
All CSV cells starting with `= + - @` are prefixed with `'` to block spreadsheet formula injection.
