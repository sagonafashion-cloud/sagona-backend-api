# Referral Code and Promoter System: Phase 0 Discovery Report

Branch: `feature/referral-promoters` (cut from `main` at `73cfd5c`). No production code has been changed. Phase 0 added only this report and a golden-snapshot test harness.

## 0. Summary of what matters most

1. **The database is MongoDB (Mongoose), not SQL.** The brief says "tables", "columns" and "migrations". Here that means new collections, new optional fields and new indexes. There is no migration tool; Mongoose creates indexes on boot. "Down" migrations become "drop the new collections".
2. **Money is stored as JavaScript Numbers in rupees, rounded to 2 decimals per line.** It is not integer paise. Prices are GST-inclusive and tax is derived backwards from the price.
3. **Invoice, GST reports and analytics do not read the order totals. They recompute from `item.unitPrice × item.qty`.** A referral discount stored only in `billing` would silently leave the invoice and every GST report at the undiscounted value, which is a compliance error. The discount therefore has to be stored per line and read through one helper. This is the only unavoidable edit to the money path.
4. **There is no coupon system, no credit-note model, no automated refund, no per-item partial return, no scheduler, no tests and no CI today.** Each of these shapes the design (sections 2, 6 and 9).
5. **Hosting split:** the backend auto-deploys from `main` to Render. The storefront and admin panel are static files uploaded by hand to cPanel. Backend changes go live on push; frontend changes only when the owner uploads them.

---

## 1. Stack

| Layer | Finding |
|---|---|
| Backend | Node 22 (Render default), Express 4, ESM (`"type": "module"`), Mongoose 8, MongoDB Atlas (transactions already used in `createOrder`). Entry `backend/server.js`. |
| Auth (customers) | JWT signed with `JWT_SECRET`. `protect`, `guestOrAuth` middleware. Guest checkout auto-creates a passwordless `User`. |
| Auth (admin) | Separate JWT (`JWT_ADMIN_SECRET`), `tokenVersion` revocation, account lockout, TOTP 2FA (`speakeasy`). `requireRole(...)` forces 2FA for `super_admin` and `finance_manager`. |
| Roles | `super_admin`, `finance_manager`, `store_manager`, `content_editor`, `viewer` (enum on `AdminUser`). |
| Storefront | Plain HTML pages with ES-module JS (`frontend/*.html`, `frontend/nc_assets/js/*.js`). No framework. Hosted separately (LiteSpeed/cPanel), uploaded manually. |
| Admin panel | One page, `frontend/admin.html` + `nc_assets/js/admin.js` (2,873 lines). Sections are `data-section` sidebar items and a `SECTIONS` array. |
| Mobile app | Expo / React Native in `sagona-app/`, uses the same `/api` endpoints, including `POST /api/orders`. |
| Email | Resend HTTPS API (`utils/emailService.js`). |
| Files | Cloudinary. Product images work. Public delivery of raw PDFs is blocked on this account (the reason invoices are served from the backend). **Not suitable for KYC documents unless switched to authenticated delivery.** |
| Hosting | Render web service `sagona-backend-api` (single instance, free-tier-style keep-alive self-ping). `render.yaml` defines production only. No staging service exists. |
| Errors / logs | Optional Sentry, `morgan('dev')`, `console.*`. |
| Rate limiting | `express-rate-limit`: global `/api` (100 per 15 min), `/api/admin` (50 per 15 min), plus `orderCreateLimiter`, `paymentLimiter` in `middleware/rateLimiters.js`. |

Housekeeping note: the root `package.json` is stale (Express 5, Mongoose 9, no scripts). The real backend manifest is `backend/package.json`. Nothing needs to change, but it is a trap for anyone running `npm install` at the root.

## 2. Order flow, end to end

1. **Cart:** localStorage cart in the browser (`cart.html`, `storage.js`). The app keeps its own cart.
2. **Pricing (server):** `utils/orderCalculator.js → computeOrderTotals(items, shippingAddress)` reloads each product, takes `product.price`, checks stock and variants, and calls `calculateTax`. Shipping is ₹0 at or above ₹999 (`FREE_SHIPPING_THRESHOLD`), else ₹99. The client never supplies a price.
3. **Tax:** `utils/taxCalculator.js`. `splitInclusivePrice(lineTotal, gstSlab, taxType)` gives taxable value = price ÷ (1 + rate), then GST. Intra/inter is decided by comparing the first item's store state with `shippingAddress.state` (case-insensitive string match). Each line is rounded with `round2` (ordinary rounding of rupees, not half-up on paise).
4. **Payment, online:** `POST /api/payment/create-order` recomputes the total and creates a Razorpay order (`Math.round(grandTotal*100)` paise). It also writes a `PendingCheckout` snapshot (added in the QA pass). The browser pays, then calls `POST /api/orders` with the Razorpay ids. `createOrder` verifies the signature, fetches the payment from Razorpay, and requires the captured amount to equal the recomputed total. **Orders are created by the browser, not the webhook.** The reconciler (flag `PAYMENT_RECONCILER`) is the safety net for the "paid but no order" case.
5. **Payment, COD:** the same `createOrder`, `payment.method='COD'`, status `pending`.
6. **Order creation:** inside one Mongo transaction (with order-number retry): `Order.create`, atomic stock decrement, loyalty points (1 point per ₹100 of `grandTotal`), timeline and ETA.
7. **After commit (non-blocking):** invoice PDF is generated and uploaded (`generateInvoiceForOrder`), then the confirmation email is sent.
8. **Status machine** (`Order.status`): `placed → confirmed → packed → shipped → out_for_delivery → delivered`, plus `return_requested`, `returned`, `cancelled`. Cancelled and returned are final. Admin changes status in `updateOrderStatus`. Customers cancel (`cancelOrder`) or request a return (`initiateReturn`, only after delivered). Admin approves or rejects in `actionReturn` or initiates directly in `adminInitiateReturn`.
9. **Delivery date:** there is no courier integration. "Delivered" exists only when an admin sets the status. It is recorded in `timeline[]` and `shipments[].deliveredAt`. There is no top-level `deliveredAt`.
10. **Returns and refunds:** returns apply to the **whole order**. There is no per-item or partial return. **No Razorpay refund API is called anywhere in the code**: refunds are done manually in the Razorpay dashboard. The `payment.status` enum has `refunded`, but nothing sets it.
11. **Stock effects:** cancel before dispatch restocks automatically. Returned or post-dispatch cancelled stock is "held" for inspection (Phase 5).
12. **Notifications:** email only (Resend). No WhatsApp sending code.

### Coupons and discounts today

**None.** `Order.billing.discount` exists but means "savings versus MRP" (`Σ (mrp − unitPrice) × qty`, shown on the invoice as "Savings vs MRP"). It is not a coupon and not deducted from anything. To avoid confusion, the new field must have a different name (`referralDiscount`), and the existing field must not be reused.

## 3. How prices, GST and money are stored

- Type: JS `Number`, rupees, usually 2 decimals. Razorpay amounts convert with `Math.round(x * 100)`.
- **GST-inclusive** pricing (confirmed by `taxCalculator.js` and the pricing commit history). Customer pays `unitPrice × qty` plus shipping; CGST/SGST/IGST is informational.
- Per line: `gstSlab` (enum 0, 5, 12, 18, 28, 40) and `hsnCode` are snapshotted on `order.items[]`.
- **Existing rounding drift (measured by the golden test):** for 3 × ₹333 at 5% plus 7 × ₹199 at 18%, `taxableAmount 2131.94 + cgst 130.04 + sgst 130.04 = 2392.02` against a charged subtotal of `2392.00`. Per-line rounding makes `taxable + tax` differ from the charged total by up to a couple of paise. This is pre-existing and is not touched. The new module must not make it worse; section 8 describes how.
- **Slab on discounted value:** `gstSlab` is a static property of the product. There is **no per-piece-value slab logic** anywhere (for example, 5% up to ₹2,500 per piece, 18% above). The brief requires evaluating the slab on the discounted per-piece value. The store does not do this even without discounts. See open question Q2.

### Places that read `unitPrice × qty` directly (all must see the discounted amount)

| File | Line | Use |
|---|---|---|
| `utils/invoiceGenerator.js` | 149 | Invoice line total, taxable value, GST split |
| `controllers/gstController.js` | 185 | HSN rows (feeds GSTR-1, HSN summary, exports) |
| `controllers/gstController.js` | 337 | Nil-rated vs taxable split (GSTR-1 summary) |
| `utils/emailTemplates.js` | 93 | Line total in the confirmation email |
| `controllers/analyticsController.js` | 82, 128, 231 | Store revenue, top products, tax-by-product |

Plus 16 reads of `billing.cgst / sgst / igst / taxableAmount / grandTotal` across controllers, including the GSTR-3B/2 aggregates and the "B2C large" test (`billing.grandTotal > 100000`). Those continue to work if `billing` is written correctly at order time.

## 4. Admin panel

- Sections: Dashboard, Orders, Returns, Products, Stores, Homepage, Analytics, GST Reports, Purchase Invoices, Admin Users. Add a **Promoters** group by adding a sidebar item, a `SECTIONS` entry and a render function.
- Permission model: per-route `requireRole(...)`. No fine-grained permission table. Mapping for this module (no new role needed): `super_admin` = everything, `finance_manager` = read, reports, payout export, statements (this is the brief's "accountant"; 2FA already enforced), `store_manager` and `viewer` = no promoter access.
- UI library: none. Hand-written HTML strings with `escapeHtml`. The new screens should go in a **new lazily loaded file** (`nc_assets/js/admin-referral.js`) rather than growing `admin.js`.
- Existing GST report: `gstController.js` (1,017 lines). Endpoints: `gstr1`, `gstr3b`, `hsn-summary`, `invoices`, `export`, `consolidated`, plus four "summary" endpoints. Output is built from a signed order set (`getPeriodOrders`) with a cross-period credit-note substitute and `isVoidedBeforeFiling`.
- Audit trail: `ActivityLog` (`logAdminActivity(req, action, {targetType, targetId, details})`). It is fire-and-forget, free-form and mutable by anyone with DB access. The referral module needs its own append-only audit collection (before/after values, reveal events). Reuse the helper's pattern, not the collection.

## 5. Existing collections and migration tooling

Collections: `users`, `adminusers`, `products`, `orders`, `pendingcheckouts`, `purchaseinvoices`, `stores`, `pincodemaps`, `homepagesections`, `sizingfeedbacks`, `chatsessions`, `activitylogs`. No migration framework. Indexes are created by Mongoose at boot. New collections and indexes are safe to add. Rollback = flag off, and the collections can sit unused or be dropped.

Product categories are a fixed enum: `kids`, `women`, `men`, `accessories` (and empty). Commission rates by category map directly to these four values.

## 6. Tests, CI, env, logging

- **Tests:** none in the repository. The root `npm test` is a placeholder. The standalone checks from the QA pass live outside the repo. This phase adds `backend/tests/golden/` (below).
- **CI:** none (no `.github`).
- **Integration-testing limit:** I have no MongoDB in the sandbox (binary downloads are blocked). Pure-function and mocked tests run here. Anything needing a real database (checkout, reports, payouts) needs a **staging database**, which does not exist yet (Q1).
- **Env validation:** `utils/validateEnv.js`, with required vars (crash on boot) and recommended vars (warn). New vars go into the **recommended/optional** list only. `.env.example` exists and will be updated.
- **Scheduler:** none. The only background job is the payment reconciler, a `setInterval` inside the web process. Render may sleep or restart the instance, so jobs must be idempotent and self-healing (Q4).

## 7. Golden snapshots (done in this phase)

`backend/tests/golden/golden_legacy.mjs` captures `calculateTax` output, the derived `billing`, and the extracted text of the generated invoice PDF for 6 sample orders: intra-state, inter-state, multi-line with mixed 0/5/18% slabs, nil-rated, odd-paise rounding, and free/paid shipping. Run `node tests/golden/golden_legacy.mjs` from `backend/`. It passed against current `main` (6/6 identical).

**Not yet captured:** the GST report outputs and the live checkout totals, because both need a database. Plan: a seed script plus the same compare-mode test, run on the staging database in Phase 1.

## 8. Proposed design on this codebase (the least invasive option)

### 8.1 How the discount reaches invoice and GST

- Add one optional field on each order line: `items[].referralDiscount` (rupees, default 0).
- Add one helper in `taxCalculator.js`: `chargedLineAmount(item) = unitPrice × qty − (item.referralDiscount || 0)`.
- Replace the raw `unitPrice * qty` at the 5 places in section 3 with the helper. **With the field absent the result is identical**, and the golden test proves it.
- On the order: `billing.subtotal` stays the list total; new optional `billing.referralDiscount`; `billing.grandTotal = subtotal − referralDiscount + shipping`; `taxableAmount/cgst/sgst/igst` are computed on the discounted lines.
- Invoice gets two extra rows ("Referral discount (CODE)") only when a discount exists.
- Commission, promoters, ledger and payouts live entirely in **new collections**. `orders` gets no commission data.

### 8.2 Discount arithmetic

Computed server-side in integer paise inside the new module (largest-remainder allocation so line discounts sum exactly to the order discount), then written back to the order in rupees with 2 decimals. The legacy per-line `round2` drift (section 3) is left alone.

### 8.3 Lifecycle events without touching status code

Instead of adding hooks to `updateOrderStatus`, `cancelOrder`, `actionReturn` and `adminInitiateReturn`, a **daily idempotent sweeper job** reads each referred order's status and timeline and writes the matching ledger entries (eligible after the window, reversal on cancel/return). Idempotency keys make re-runs safe and let it self-heal after Render restarts. Cost: up to a day's delay, which is fine for monthly payouts. This keeps edits to existing order code at **zero** for the lifecycle.

### 8.4 Order creation hook

One small optional block in `createOrder`, inside the existing transaction: if the flag is on and a code was sent, resolve and persist the referral rows. If the flag is off, the code path is skipped entirely. The same recomputation must be applied in `createRazorpayOrder` (so the Razorpay amount includes the discount) and stored in `PendingCheckout` so the reconciler recreates the order identically.

### 8.5 Files I expect to touch

New files only (the bulk): `models/Promoter*.js`, `ReferralCode.js`, `CommissionRate.js`, `OrderReferral*.js`, `CommissionLedger.js`, `PayoutBatch.js`, `ReferralSetting.js`, `ReferralAuditLog.js`; `services/referral/*`; `routes/referral*Routes.js`; `controllers/referral*.js`; `utils/referralCrypto.js`, `referralJobs.js`; `frontend/nc_assets/js/admin-referral.js`; `frontend/referral-terms.html`.

Existing files with a one-line to small hook:

| File | Change | Risk |
|---|---|---|
| `server.js` | mount new routers, start job (flag-gated) | low |
| `controllers/orderController.js` (`createOrder`) | optional referral block inside the transaction | medium (money path) |
| `controllers/paymentController.js` (`createRazorpayOrder`) | include discount in the amount; snapshot code | medium (payment path) |
| `utils/paymentReconciler.js`, `models/PendingCheckout.js` | carry the code through recovery | medium |
| `utils/taxCalculator.js` | add `chargedLineAmount` | low (golden-tested) |
| `utils/invoiceGenerator.js` | use helper; add discount rows | low (golden-tested) |
| `controllers/gstController.js` | use helper at 2 spots; optional referral filter/columns | medium |
| `controllers/analyticsController.js` | use helper at 3 spots | low |
| `utils/emailTemplates.js` | use helper; discount line | low |
| `middleware/validate.js` | allow optional `referralCode` | low |
| `utils/validateEnv.js`, `.env.example` | optional vars | low |
| `frontend/checkout.html`, `nc_assets/js/checkout.js`, `order-success.html` | optional code field | medium (manual upload) |
| `frontend/admin.html`, `nc_assets/js/admin.js` | sidebar item + section hook | low |
| `sagona-app/app/checkout/index.tsx` | optional field (Phase 5) | low |

## 9. Gaps between the brief and this system

| Brief assumes | Reality here | Handling |
|---|---|---|
| SQL tables, migrations with `down` | MongoDB, no tool | Collections + indexes; rollback = flag off (data stays) |
| Money in paise or decimal | Float rupees | Paise inside new module; rupees at the boundary |
| Credit notes for returns | No credit-note model; reversals derived from order status | Commission reversal keyed to order status, matching `reversalEventDate` and `isVoidedBeforeFiling` |
| Partial returns / exchanges | Whole-order returns only | Whole-order commission reversal. Partial support would need a returns redesign (out of scope) |
| Courier delivery event | Admin marks "delivered" | Return window starts from that timeline entry |
| Razorpay refunds tracked | Manual refunds, status never set | Chargebacks/refunds not detectable automatically. Admin marks the return; commission reversal follows |
| Scheduler | none | In-process job + lease lock + idempotent sweeper (Q4) |
| Private file storage | Cloudinary public | Decision needed (Q3) |
| Staging environment | none | Needed before Phase 2 can be tested (Q1) |
| Device fingerprint / IP on orders | not captured | Store a hashed IP at validate time; fingerprint rule starts weaker |
| Role `accountant` | not present | Use `finance_manager` |

## 10. Open questions for the owner (defaults in bold; I proceed with the default unless told otherwise)

- **Q1 Staging:** create a separate Render service, a separate Atlas database (free tier is enough) and Razorpay **test** keys. **Default: required before Phase 2. Phase 1 can proceed without it.**
- **Q2 GST slab after discount:** re-evaluate the slab per piece on the discounted price (needs a tax-rules table and the CA's confirmation of the threshold). **Default: build the rules table and the code path, ship it OFF, keep each product's own slab until the CA confirms.** This is the biggest compliance risk. A ₹2,600 piece at 18% discounted to ₹2,450 may legally need 5%.
- **Q3 KYC document storage:** Cloudinary with *authenticated* delivery and signed URLs, or MongoDB GridFS (encrypted, no new service). **Default: GridFS with AES-256-GCM (no third-party exposure of PAN/bank proofs).**
- **Q4 Job runner:** in-process job with a database lease lock, or a Render Cron Job (separate paid-tier feature). **Default: in-process + lease + idempotent sweeper.**
- **Q5 Admin UI file:** new `admin-referral.js` loaded on demand. **Default yes.**
- **Q6 Return window anchor:** the admin's "delivered" timestamp, 10 days. **Default yes.**
- **Q7 Promoter payout invoices/TDS/GST-on-commission:** all rates, thresholds and applicability flags stay configurable and unfilled until the CA confirms. **Default: no hard-coded values.**
- **Q8 Code scope:** one code per order, stackable with nothing else (there are no other discounts today). **Default yes.**

## 11. Risk register

| # | Risk | Mitigation |
|---|---|---|
| R1 | Invoice/GST silently ignores the discount | Per-line `referralDiscount` + one helper + golden tests (section 8.1) |
| R2 | Checkout amount differs from Razorpay amount | Same pure function used by `createRazorpayOrder`, `createOrder` and the reconciler; test that all three agree |
| R3 | Order with discount created, referral rows fail | Same transaction; failure aborts before payment capture is confirmed |
| R4 | No staging, so no realistic test of payments/reports | Q1 |
| R5 | Whole-order returns only | Documented; commission reversal is whole-order |
| R6 | Sleeping Render instance misses a scheduled run | Sweeper is idempotent and catches up on the next run |
| R7 | Frontend is a manual upload, so a partial upload can break checkout | Backend ignores unknown fields; storefront field hidden unless the flag endpoint says the programme is on; upload checklist in the runbook |
| R8 | Pre-existing 2-paise rounding drift | Not worsened; reported in the reconciliation page as informational |

## 12. Next step

Per the brief, I stop here. Phase 1 (collections, settings, promoter/KYC fields, codes, commission rates, audit log, RBAC, flag) starts after the owner reviews the answers to Q1–Q8. Phase 1 touches only `server.js`, `validateEnv.js`, `.env.example` and `admin.html`/`admin.js` in existing files, and the flag is off by default.
