# SAGONA App — Phase 6 Report: Closing the Three Remaining Shells

Scope: `sagona-app/` only. `login.tsx`, `cartStore.ts`, `checkout/index.tsx`, `bag.tsx` were not opened for editing.

## 1. Return / Exchange (`return-request.tsx`)

Rebuilt from the Phase 2 shell into a working screen, reusing the exact backend flow already live on the website — no new endpoint.

- **Endpoint reused:** `POST /orders/:id/return-request` (`initiateReturn` in `backend/controllers/orderController.js`), same request body shape as `frontend/nc_assets/js/account.js`'s `submitReturnRequest`: `{returnType, reason, replacementProductId, replacementProductName}`.
- **Order lookup:** linked directly from Order Detail (`orders/[id].tsx`) via a new "Return or Exchange" row, passing `?orderId=`. If opened without an id, the screen falls back to a picker listing the user's delivered orders (`GET /orders/my`, filtered client-side to `status === 'delivered'`), matching the "let the user pick which order" requirement for any other entry point.
- **Real form:** Return/Exchange type toggle, reason text field, and — for Exchange — a replacement-product search that mirrors the website's `showReplacementSelector`/`loadReplacementProducts` (debounced `GET /products?status=active&limit=12&search=`), with a selected-product confirmation chip.
- **Server-side rules mirrored client-side:** the backend only allows a request when `order.status === 'delivered'`, and submitting flips the order to `return_requested` (so a second submission is blocked). The screen reflects this directly: if `order.returnRequest` already exists, it shows a status card (type, reason, status, admin note if any) instead of the form; if the order isn't delivered yet, it explains that instead of showing a dead form.
- Uses `ErrorState` (fetch failures) and `EmptyState` (no eligible orders / no size chart, in the next section) — no new one-off error UI.

## 2. Size Guide (`size-guide.tsx`)

**Gap found and reported as instructed, then resolved without inventing data:** there is no general age/height → size chart anywhere in the backend. The only structured measurement data is `Product.garmentMeasurements` — a per-product, admin-populated array (`size, chestWidth, waistWidth, hipWidth, shoulderWidth, sleeveLength, garmentLength, inseam, neckWidth`), the same field the AI Size Finder's `POST /sizing/recommend` reads internally. So the original placeholder concept (a static age table) doesn't correspond to anything real in the backend, and I did not build it.

Instead, Size Guide is now **product-specific**:

- **Data source reused:** `GET /products/:id`, which returns the full product document with no field restriction — confirmed directly in `productController.js` (`getProductById` has no `.select()`), so `garmentMeasurements` is already exposed with zero backend changes needed.
- **Linked from the PDP:** a "Size Guide" link now sits next to "Find My Size" on the product detail screen, passing `?productId=`.
- Renders the product's real measurement table, plus `fitType`/`fitNote`/`sizeUpNote` when populated. Columns with no data anywhere in the chart are hidden rather than shown as a wall of dashes.
- If a specific product has no `garmentMeasurements` populated yet (a real, per-product data gap — some products may not have this filled in), the screen says so honestly via `EmptyState` and points to the AI Size Finder instead, rather than fabricating measurements.

## 3. Loyalty (`loyalty.tsx`)

- **Data reused, not reinvented:** the same `User.loyaltyPoints` field Account already displays, fetched fresh via `GET /auth/me` on open (falls back to the cached auth-store value instantly, then refreshes) so a balance change from an order placed since last login shows up without requiring a fresh login.
- **Earn-rule copy corrected against actual code, not the website:** the website's `account.html` currently displays "1 point per ₹10 spent" and "100 points = ₹10 off at checkout." Neither matches the backend. The real logic (`orderController.js`, order creation): `Math.floor(billing.grandTotal / 100)` points, credited transactionally — i.e. **1 point per ₹100 spent**. That's what the app now shows. There's no backend config endpoint for this rate (it's a hardcoded literal in the controller), so this is a direct, verified reflection of current code rather than the website's copy — flagging this since the website itself should probably be corrected too, but that's outside this phase's scope (`sagona-app/` only).
- **Redemption is not shown as functional**, because it isn't: nothing in the backend applies points as a discount anywhere (checkout only ever displays the balance). The "Redeem" section says "Coming soon" instead of presenting fake redeemable rewards.
- **Linked from Account:** the existing loyalty-points row is now tappable (added a chevron) and opens this screen.

## 4. Gaps found (surfaced, not silently patched over)

- No backend config source for the loyalty earn rate — it's a literal in `orderController.js`. If that number ever changes, `loyalty.tsx`'s copy needs a manual update; there's no single source of truth to point at instead.
- No redemption feature exists in the backend at all, for loyalty points.
- Size chart data is populated per-product by admins — some products may currently have an empty `garmentMeasurements` array, which the Size Guide screen surfaces per-product rather than a single global gap.
- Razorpay online payment remains out of scope for this phase (unchanged from Phase 5 — still blocked on a native/EAS build, not something these screens touch).

## 5. Files touched

- `app/return-request.tsx` — rebuilt (was Phase 2 shell)
- `app/size-guide.tsx` — rebuilt (was Phase 2 shell)
- `app/loyalty.tsx` — rebuilt (was Phase 2 shell)
- `app/orders/[id].tsx` — added a "Return or Exchange" link (button + two new styles); rest of the screen unchanged
- `app/product/[id].tsx` — added a "Size Guide" link next to "Find My Size"; rest of the screen unchanged
- `app/(tabs)/account.tsx` — loyalty-points row is now tappable (added `TouchableOpacity` + chevron); rest of the screen unchanged
- `src/types/index.ts` — additive only: `GarmentMeasurement` interface, `Product.garmentMeasurements`/`fitType`/`fitNote`/`sizeUpNote` (all optional), `ReturnRequest` interface, `Order.returnRequest` (optional). No existing fields changed.

## 6. Regression check

`login.tsx`, `cartStore.ts`, `checkout/index.tsx`, and `bag.tsx` were not opened for editing in this phase — the only touches to already-working screens were the two small additive link insertions above (`orders/[id].tsx`, `product/[id].tsx`, `account.tsx`), which add new UI without changing any existing logic, queries, or state. This is a code-level review, not a live device/simulator run — recommend an on-device smoke test of the return flow, size guide, and loyalty screen before shipping, same caveat as the Phase 5 report.
