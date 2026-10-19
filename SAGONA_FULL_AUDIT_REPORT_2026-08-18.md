# SAGONA Full Codebase Audit — 2026-08-18

Scope: entire repository — `backend/`, `sagona-app/`, `frontend/`. Type: security + code quality + functional/UX. Approach: fix low-risk issues directly, flag anything higher-risk or contract-changing for a decision. Three parallel audits (one per directory), spot-checked below.

## Summary

| Area | Fixed | Flagged for decision | Info-only |
|---|---|---|---|
| `backend/` | 3 | 3 | — |
| `sagona-app/` | 5 | 3 | 3 |
| `frontend/` | ~14 (XSS escaping across 8 files + robots.txt) | 4 | — |

No critical, unfixed security holes were found. The strongest finding was a real, previously-unescaped stored-XSS surface in the admin bulk-upload preview/edit flow on the website — now fixed. No client-controlled pricing, loyalty, or authorization bypass exists anywhere in the checkout/order/return paths; all money and status logic is server-verified.

---

## 1. Backend (`backend/`)

**Fixed:**
- `orderController.js` — `getOrderById` ownership check now fails closed if `req.user` is ever missing (was fail-open in that edge case; not currently reachable since the route is always behind `protect`, but now hardened).
- `orderController.js` — `actionReturn` (admin approve/reject) now guards against acting on an order with no pending `returnRequest`, preventing an unguarded write + raw error leak.
- `sizingController.js` — `getAllFeedback` pagination params are now parsed/bounded (`page`, `limit` capped at 100), matching the convention used elsewhere.

**Flagged for a decision (not changed):**
- `createManualOrder` (admin-only) trusts client-supplied `billing.grandTotal` rather than recomputing server-side like the customer checkout path does. Low blast radius (super_admin/store_manager only) but worth an explicit call on whether GST/tax fields should still be recomputed server-side for admin-entered orders.
- `adminBulkImport` writes `req.body` directly via `insertMany` instead of the explicit field-whitelist pattern used elsewhere. Not exploitable (Mongoose schema is strict), but inconsistent with the codebase's own stated convention.
- `models/ActivityLog.js` is fully dead code — defined but never imported or written to anywhere. No admin-action audit trail currently exists (`createAdmin`, `updateOrderStatus`, `actionReturn`, `adminUpdateProduct`, etc. are not logged). Worth deciding whether to wire it up or delete it.

**Confirmed clean:** auth/authorization on every route (cross-checked route files against controllers), injection (global `mongoSanitize`+`hpp`, regex-escaping helper used everywhere), secrets/config (`.env` gitignored, env validation fails fast, no stack-trace leakage, CORS allowlist), data exposure (password/2FA secrets have `select:false`, rate limiting on all sensitive endpoints), the full money flow from cart → server-computed totals → Razorpay verification → loyalty points, file-upload magic-byte validation, SSRF guards on try-on image URLs, and HTML-escaping in outbound emails.

## 2. Mobile app (`sagona-app/`)

**Fixed:**
- Two screens (`TryOnModal.tsx`, `tryon-studio.tsx`) referenced an unregistered font weight (`PlayfairDisplay_600SemiBold`), silently falling back to the system font — corrected to the registered `700Bold`.
- `authStore.ts` — `logout()` now also clears the `sagi_session` SecureStore key, so a new login on a shared device can't inherit a previous account's chat session id (backend already guarded against replay, this is defense-in-depth).
- `_layout.tsx` — the guest-access guard was missing `size-guide` as an allowed top-level segment, so a guest tapping "Size Guide" from a product page (itself guest-accessible, and hitting only the public `GET /products/:id`) was bounced straight to login — a real navigation dead-end. Fixed.
- `account.tsx` — orders loading state now uses the same `ActivityIndicator` pattern as the rest of the app instead of a plain text string.

**Flagged — needs explicit go-ahead (touches a protected file):**
- `checkout/index.tsx`: no query-cache invalidation for `['myOrders']`/`['returnEligibleOrders']` after a successful order, so the Account tab can show a stale order list until app restart or manual refresh. Real UX bug, but `checkout/index.tsx` is on the do-not-touch list from prior phases — left unfixed pending your go-ahead.

**Flagged — needs a decision:**
- `api.ts` has no global 401 handler to force-logout on token expiry; a correct fix needs an architectural call (event emitter vs. lazy import) to avoid a circular dependency with `authStore.ts`.
- `checkout/index.tsx` doesn't integrate with Saved Addresses — feature gap, not a bug, flagged since the file is protected.

**Info-only, no action needed:** two dead leftover Expo-init template files (`App.tsx`, `index.ts` — not part of the actual app, which runs via `expo-router/entry`); `reviews.tsx` is an intentionally unlinked placeholder; minor duplicate-cache-key inefficiency between `account.tsx` and `return-request.tsx` (both fetch `/orders/my` under different query keys).

**Confirmed clean:** token storage/attachment, no PII/token logging, all shared UI components, TypeScript strict mode, and — cross-checked against the backend — checkout price/return-eligibility/authorization are all server-verified regardless of client state.

## 3. Website (`frontend/`)

**Fixed — XSS (the most significant finding of this audit):**
- `admin.js`: unescaped user/admin-entered data was being rendered via `innerHTML` in the bulk-product-upload preview/result view, the product editor, the product list thumbnails, the store-settings modal, and the entire homepage-section manager. All now HTML-escaped or have sanitized `src` attributes. The bulk-upload path was the most exploitable (untrusted file content rendered pre-confirmation).
- `account.js`: order-timeline entries (label/status/description/location — admin-entered, rendered to customers), shipment courier/tracking fields, and replacement-product images are now escaped/sanitized.
- `checkout.js`, `wishlist.js`: cart item names/sizes, saved-address fields, and product images escaped/sanitized.
- `robots.txt`: `admin.html` is no longer crawlable.

**Fixed — copy accuracy:**
- `account.html`'s loyalty section previously claimed "1 point per ₹10 spent" and "100 points = ₹10 off, applied automatically at checkout" — neither matches the backend (`Math.floor(grandTotal/100)`, no redemption logic anywhere). Corrected to "1 point per ₹100 spent" and an honest "redemption not available yet," now consistent with the app's loyalty screen from Phase 6. Spot-checked and confirmed in place.

**Flagged for a decision (not changed):**
- Four dead/orphaned files with no filesystem-delete access from this session: `drawer.js` + `drawer.html` (unwired duplicate cart renderer with zero escaping — would be a real stored-XSS risk if it were ever linked in), `app.js` (stale unused init hooks), `returns.js` (operates on fake legacy localStorage keys unrelated to the real return-request API), and a stray `.card` dotfile. Recommend manually deleting these.
- Auth tokens live in `localStorage`/`sessionStorage` rather than httpOnly cookies — architecturally sound given Bearer-header auth (no CSRF exposure) but still JS-readable if XSS ever lands elsewhere; migrating is a backend+frontend architecture change, not a quick edit.
- CSP allows `'unsafe-inline'` for scripts, required by the codebase's pervasive inline `onclick=` pattern; removing it needs a broader event-delegation refactor.
- `sizing.js` renders a few `/sizing/recommend` response fields via `innerHTML` unescaped — traced to confirm they're all hardcoded server strings (never admin/user free text), so not exploitable today, but inconsistent with the rest of the codebase's defensive posture.

**Confirmed clean:** all core storefront scripts (`main.js`, `product.js`, `cart.js`, `config.js`, `chatbot.js`), server-side price verification, no hardcoded secrets, admin 2FA + inactivity auto-logout, `.htaccess` security headers.

---

## Regression check

Fixes were scoped per-directory to avoid cross-audit conflicts (backend agent touched only `backend/`, mobile agent only `sagona-app/`, website agent only `frontend/`, with the backend read-only for the website agent's verification). Spot-checked a sample from each area directly against the file contents:

- `orderController.js` — confirmed the fail-closed ownership check and the return-approval guard are both in place as reported.
- `_layout.tsx` — confirmed `size-guide` is now in the guest-allowed segment list.
- `account.html` — confirmed the loyalty copy now reads "1 point per ₹100 spent" and "not available yet" for redemption, matching the app.
- `admin.js` — confirmed 63 `escapeHtml` call sites now present (was the primary XSS fix).

No protected files (`login.tsx`, `cartStore.ts`, `checkout/index.tsx`, `bag.tsx`) were modified — both bugs found in `checkout/index.tsx` (stale order cache, no saved-address integration) were flagged rather than fixed, per standing instruction.

## Open decisions for you

1. Should `createManualOrder` (admin) recompute tax/GST server-side, or is client-supplied pricing intentional for that path?
2. Wire up or delete the dead `ActivityLog` model (currently no admin-action audit trail exists at all).
3. Delete four dead/orphaned frontend files (`drawer.js`, `drawer.html`, `app.js`, `returns.js`, `.card`) — flagged as a real latent XSS risk if `drawer.js` is ever wired in.
4. Go-ahead needed to fix the stale-order-list cache bug in `checkout/index.tsx` (currently protected).
5. Architectural call on a global 401/session-expiry handler in `sagona-app/src/lib/api.ts`.
