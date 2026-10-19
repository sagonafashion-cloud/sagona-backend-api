# SAGONA — FIX ALL AUDIT FINDINGS (2026-08-10 AUDIT)
# Source: SAGONA_CODEBASE_AUDIT_2026-08-10.md — 65 findings across 5 review slices
# Fix everything in strict priority order. Prove before you fix. Re-test after every change.
# DO NOT touch checkout.js payment flow, cart.js, paymentController.js structure without
# following the special protocol in TIER 0 below.

---

## STANDING RULES (apply to every single fix below)

1. Read the exact file:line cited in the audit before changing anything — confirm the
   finding is still accurate against current code (things may have shifted).
2. Fix the minimum diff that resolves the finding. Do not refactor unrelated code.
3. After each fix, re-verify the feature it touches still works end-to-end.
4. Where the audit says "Notes: contrast with X, which does this correctly" — copy that
   existing correct pattern rather than inventing a new one.
5. Where multiple findings point at the same duplicated logic (see "Duplicate/Dead Code"
   section of the audit), fix the root shared file ONCE rather than patching every call site
   separately, then confirm every call site now uses the shared fixed version.
6. Work in the tiers below, in order. Do not skip ahead. Report completion of each tier
   before starting the next.

---

## TIER 0 — CRITICAL — REQUIRES HUMAN SIGN-OFF BEFORE DEPLOYING (do not skip this step)

### Finding 1 — Payment verification does not check amount or reuse

**Do this first, but STOP before deploying:**

1. Read `backend/controllers/paymentController.js` lines 82-138 (`verifyPayment`).
2. Read the CORRECT pattern already used in `createOrder`'s payment-intent flow and the
   webhook handler in the same file — both already call `razorpay.payments.fetch()` and
   verify amount server-side. Quote both correct implementations.
3. Write the fix: `verifyPayment` must additionally:
   - Call `razorpay.payments.fetch(paymentId)` to get the actual captured payment
   - Reject unless `captured.status === 'captured'`
   - Reject unless `captured.order_id` matches the Razorpay order tied to THIS order
   - Reject unless `captured.amount` (in paise) matches this order's `grandTotal * 100`
   - Reject if this `razorpayPaymentId` has already been used to mark any other order paid
     (add a unique index or an explicit lookup check)
4. Show me the diff. **Do not deploy this fix until I confirm.**
5. Separately: query the database for any order that was marked "paid" via `verifyPayment`
   where the linked payment amount does not match the order's grand total. Report any
   matches — this tells us if the gap has already been exploited and needs manual
   reconciliation (refund, cancel, or contact customer).

### Finding 2 — cart.html unescaped rendering (stored XSS on highest-traffic page)

1. Read `frontend/cart.html` lines 53-67 — the inline unescaped renderer.
2. Read how `frontend/nc_assets/js/cart.js` correctly does the same job using
   `escapeHtml()`/`sanitizeUrl()` from `config.js`.
3. Replace `cart.html`'s inline script to import and use the same `escapeHtml()`/
   `sanitizeUrl()` helpers — do not write a new escaping function, reuse the existing one.
4. Confirm: does `cart.html` need its own separate renderer at all, or should it just load
   `cart.js` like every other page does? If the latter is safe, prefer deleting the
   duplicate renderer entirely over patching it (ties into Finding 49 and the
   "three independent cart renderers" duplication note).
5. Test: add an item with a name containing `<img src=x onerror=alert(1)>` (via a test
   product, not live catalog) → confirm it renders as literal text, not executed, on
   `cart.html`.

---

## TIER 1 — HIGH — FIX THIS SPRINT

### Finding 3 — Admin login has no account-level lockout
- Add `loginAttempts` / `lockUntil` fields to `AdminUser.js`, mirroring the existing
  correct implementation already in `User.js` (`authController.js:85-121`).
- Enforce in `adminLogin`.
- Also key the rate limiter by email in addition to IP (IP-only is bypassable).

### Finding 4 — Cloudinary upload/delete routes missing role check
- Add `requireRole('super_admin', 'content_editor')` to both
  `POST` and `DELETE /api/admin/upload/image` in `uploadRoutes.js`, matching every
  sibling admin route.

### Finding 5 — No rollback on partial stock reservation failure
- Wrap `Order.create` + stock decrement loop in a Mongoose transaction (session), OR
  explicitly `$inc` back any already-reserved items if a later item fails before deleting
  the order. Prefer the transaction — it's the safer, more general fix.

### Finding 6 — Non-variant products have no stock check at all
- Add an atomic top-level `stock` decrement path for products without size/colour
  variants: `Product.updateOne({_id, stock:{$gte:qty}}, {$inc:{stock:-qty}})`,
  mirroring the existing correct variant-product logic.

### Finding 7 — Order creation sequence has no transaction
- Wrap order creation → stock reservation → loyalty award → timeline/ETA assignment in
  one Mongoose transaction. Commit only when every step succeeds. (This can likely share
  the same transaction started for Finding 5 — do them together.)

### Finding 8 — AI chat tool vulnerable to regex DoS
- In `chatController.js` (`executeTool`/`search_products`), import and use the existing
  `escapeRegex()` helper already in `productController.js`. Do not write a new one.

### Finding 9 — returns.html is a non-functional fake success page
- First confirm: is `returns.html` linked anywhere in live navigation, or orphaned?
  Check every HTML file for a link to it.
- If linked: wire it to the real endpoint `POST /orders/:id/return-request` exactly as
  `account.js`'s working `submitReturnRequest()` already does — reuse that function's
  logic rather than reimplementing.
- If orphaned: delete the file and confirm nothing references it.

---

## TIER 2 — MEDIUM — FIX THIS MONTH

Work through these in the order listed. Many share root causes — group them as noted.

**Auth cluster (10, 11, 12, 13, 14):**
- #10: Shorten admin JWT TTL to 1-8h; add a revocation check (`tokenVersion` field bumped
  on password change/forced logout) in `adminProtect`.
- #11: Require 2FA enrollment for `super_admin`/`finance_manager` roles, or block
  sensitive routes until `twoFactorEnabled === true`.
- #12: Raise customer password minimum from 6 to 8+ characters in `validate.js`.
- #13: Replace `Math.random()` with `crypto.randomInt(100000, 999999)` for password-reset
  OTP generation in `authController.js:166`.
- #14: Add `{algorithms:['HS256']}` to the one `jwt.verify` call in
  `adminAuthController.js:81` (`verifyTwoFactor`) that's missing it.

**GST/timezone (15):**
- Before fixing, ask me: what timezone does the Render server actually run in? (Run
  `node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)"` on the
  deployed instance, or check Render dashboard settings.)
- Once confirmed, pass `{timeZone:'Asia/Kolkata'}` explicitly to every customer-facing
  and GST-compliance date calculation across `invoiceGenerator.js`, `gstController.js`,
  `emailService.js`, `deliveryController.js`, `orderTimeline.js`.

**Regex DoS, second instance (16):**
- Same fix pattern as Finding 8 — apply `escapeRegex()` to admin order search
  (`orderController.js:217,220-224`) too.

**Bulk upload cluster (17, 18):**
- #17: Re-run the real `validateProduct()` server-side inside the commit step of
  `bulkUploadProducts` — do not trust a client-echoed `valid` flag.
- #18: Replace the sequential per-row `findOne`+`create`/`update` loop with the efficient
  `$in`-based pre-fetch (already implemented correctly at preview time — reuse it) plus
  `bulkWrite`/`insertMany`.

**Public data exposure (19):**
- Restrict `GET /api/stores?includeInactive=true` to admin-authenticated requests only.
- Project out `gstin` and other non-customer-facing fields from the public stores response.

**Unbounded queries (20, 21):**
- #20: Add pagination/limit to `getInventoryAlerts`, matching the pattern already used
  correctly in `getTopProducts` in the same file.
- #21: Add a MongoDB `$text` index on `name`/`description`/`tags`/`fabric` in `Product.js`.

**Support form abuse (22):**
- Add a dedicated per-target-email rate limit (not just per-IP) to the contact form
  auto-reply in `supportRoutes.js`.

**Mobile cluster (23, 24, 25, 26):**
- #23: Wire biometric login success in `login.tsx` to actually call `hydrate()`/`login()`
  and navigate — currently shows "Success" and does nothing.
- #24: Standardize the env var name — pick either `EXPO_PUBLIC_API_URL` or
  `EXPO_PUBLIC_API_BASE_URL`, use it consistently in `api.ts` and all `.env*` files.
- #25: Replace empty `catch {}` blocks in `TryOnModal.tsx`, `tryon-studio.tsx`, and
  `cartStore.ts` with Sentry logging (already integrated) + non-blocking user feedback.
- #26: First check — does a backend endpoint exist to unregister a push token? Grep
  backend routes for `pushToken`/`expoPushToken`. If yes, call it in `logout()`. If no,
  ask me before building a new endpoint.

**Frontend escaping cluster (27, 28, 29, 30):**
- #27: Before fixing — grep `orderController.js` and `Order.js` for `discount` to confirm
  whether the birthday discount field is trusted from the client or recomputed
  server-side. Report what you find, then fix only if it's actually trusted client-side.
- #28: In `admin.js`'s `checkAuth`, only clear `admin_token` on 401/403, not on every
  thrown error (500, network blip) — mirror the correct pattern already in `api.js`.
- #29: Wrap the two unescaped interpolation sites in `admin.js` (lines 886, 1478) with
  the `escapeHtml()` already used everywhere else in the same file.
- #30: Same fix across `account.js`, `sizing.js`, `tryOn.js` — replace quote-only
  escaping with the shared `escapeHtml()` from `config.js` wherever HTML-text/attribute
  content is rendered, not just `onclick` string arguments.

---

## TIER 3 — LOW — BATCH THESE TOGETHER, LOWER URGENCY

Group and fix in one pass since most are small and mechanical:

- #31: Make registration return a generic response regardless of whether the email
  already exists (prevent account-existence enumeration).
- #32: Extract a shared `makeLimiter({windowMs, max, ...})` factory in
  `rateLimiters.js`; rebuild all limiters from it.
- #33: Add `.isEmail()` to `adminLoginRules` in `validate.js`.
- #34: Bump bcrypt cost factor to 12 in both `authController.js` and
  `adminAuthController.js`.
- #35: Confirm whether `@anthropic-ai/sdk` in `sagona-app/package.json` is actually used
  anywhere. If not, remove it. Report what you find either way.
- #36: Route the chat-related mobile screen's token reads through the shared
  `api.ts`/`authStore` accessor instead of reading SecureStore independently.
- #37: Confirm whether `couponCode`/`billing.discount` schema fields have any real
  validation logic behind them anywhere. Report findings — do not silently remove
  fields without confirming they're truly dead first.
- #38: Consolidate order status-transition rules into one shared function used by both
  the generic admin order route and the delivery-specific controller.
- #39: Escape interpolated values in `emailTemplates.js`.
- #40: Replace the N independent `updateOne` calls in `reorderSections` with one
  `Model.bulkWrite()`.
- #41: Add pagination to the public homepage/store list endpoints.
- #42: Manually verify the `getOrderAnalytics` groupBy label actually matches the field
  it's grouping — fix if mismatched.
- #43: Add a Cloudinary-domain allowlist check before saving a try-on result image URL.
- #44: Cap decompressed size on bulk-upload zip/spreadsheet ingestion; reject oversized
  archives before parsing.
- #45: Add an explicit allowlist/`pick()` when saving child-profile fields in
  `sizingController.js`.
- #46: Delete duplicate local `sanitizeUrl()` implementations; always import from
  `config.js`.
- #47: Set a real default Open Graph image across HTML files (cosmetic — low priority,
  do last).
- #48: Standardize 401-handling across `account.js`'s fetch call sites to consistently
  redirect, matching the correct existing pattern in `api.js`.
- #49: Fix `cart.html`'s listener re-attachment (do this alongside Finding 2 since it's
  the same file — use event delegation on a stable container).

Do NOT action the INFO-tier items (50-65) — they are confirmed non-issues or accepted
patterns per the audit. Skip them.

---

## AFTER ALL TIERS — VERIFICATION PASS

Run this regression check across every flow touched by the fixes above:

```
□ Guest and logged-in checkout — COD and online payment — both still work
□ Payment verification now rejects a mismatched-amount replay attempt (test in staging
  with a small real transaction, not production)
□ cart.html renders a test XSS payload as literal text, not executed
□ Admin login locks after 5 failed attempts, same as customer login
□ A "viewer"-role admin token gets 403 on image delete/upload
□ Placing an order that partially fails on stock does not leave stock permanently stuck
□ A non-variant product's stock actually decrements and blocks oversell
□ Chat search with a pathological regex pattern does not hang the server
□ returns.html either works end-to-end or is removed with no dead links
□ npm audit run successfully this time (confirm sandbox/tool issue is resolved) — report
  any high/critical dependency CVEs found
```

## REPORT BACK

For each tier, give me:
- What was fixed (file + one-line summary)
- What you found when investigating the "confirm before fixing" items (#9, #15, #26,
  #27, #35, #37, #42)
- Any finding where the audit's description no longer matches current code
- Regression test results
