# Sagona Mobile App — Audit & UX Gap Report

Date: 2026-08-13
Scope: `sagona-app/` (React Native / Expo Router) only. `backend/` and `frontend/` (sagona.in website) were referenced only to note where a capability already exists server-side or on web but is missing from the app. No code was changed in this phase.

---

## Step 1 — What exists in sagona-app/ today

Architecture: Expo Router (file-based routing) with a tab stack for the authenticated app, a separate auth stack (login/register/forgot), and modal-style stacks for product detail, checkout, and orders. State is Zustand (`authStore`, `cartStore`) with SecureStore for tokens and AsyncStorage for cart persistence. API access goes through a single Axios client (`src/lib/api.ts`) with automatic Bearer-token injection. A small shared UI kit (`Button`, `Input`, `ProductCard`) sits under `src/components/ui/`.

| Screen / feature | Exists? | Working? | File path |
|---|---|---|---|
| Login | Yes | Yes | `app/auth/login.tsx` |
| Register | Yes | Yes | `app/auth/register.tsx` |
| Forgot password (OTP) | Yes | Yes | `app/auth/forgot.tsx` |
| Biometric login | Yes | Yes | `app/auth/login.tsx` (now calls `hydrate()` + redirects — see Finding 23 below) |
| Home (banner, categories, new arrivals) | Yes | Yes | `app/(tabs)/index.tsx` |
| Shop / browse (grid, search, filters) | Yes | Yes | `app/(tabs)/shop.tsx` |
| Product detail (images, size/colour, description) | Yes | Yes | `app/product/[id].tsx` |
| AI virtual try-on (modal) | Yes | Yes | `src/components/TryOnModal.tsx` |
| Try-on studio (photo upload/manage) | Yes | Yes | `app/tryon-studio.tsx` |
| Shopping bag / cart | Yes | Yes | `app/(tabs)/bag.tsx` |
| Checkout | Yes | **Partial — COD only** | `app/checkout/index.tsx` |
| Order detail | Yes | Yes (status text, no visual timeline) | `app/orders/[id].tsx` |
| Account (profile, loyalty points, order history, logout) | Yes | Yes | `app/(tabs)/account.tsx` |
| SAGi AI chat assistant | Yes | Yes | `app/(tabs)/chat.tsx` |
| Push notifications | Yes | Yes | `src/hooks/usePushNotifications.ts` |

### Prior audit findings (Aug 10) — current status

| # | Finding | Status now |
|---|---|---|
| 23 | Biometric login showed "Success" but never logged the user in | **Fixed.** `login.tsx` now calls `hydrate()` and redirects on success. |
| 24 | Env var mismatch (`EXPO_PUBLIC_API_URL` vs `EXPO_PUBLIC_API_BASE_URL`) | **Not an issue.** Both code and `.env` use `EXPO_PUBLIC_API_URL`; no mismatch. |
| 26 | Push token never unregistered on logout | **Fixed.** `authStore.ts` best-effort clears the token server-side before wiping local session. |
| 35 | Unused `@anthropic-ai/sdk` dependency | **Not present.** Not in current `package.json`; original finding appears to have been inaccurate. |
| 36 | Chat screen re-reads token independently of shared store | **Not an issue.** `chat.tsx` reads via `useAuthStore.getState().token` — the shared store, not a separate SecureStore read. |
| 53 | Razorpay `key_id` (publishable) in mobile `.env` | **Confirmed, no action needed** — public key, safe to bundle. |

All six mobile findings from the prior audit are resolved or were non-issues. No open security/correctness findings remain in `sagona-app/`.

### Verified independently (spot-checked, not just agent-reported)
`app/checkout/index.tsx` currently defines `type PaymentMethod = 'COD'` — the payment-method list only ever renders COD, and the Razorpay branch shows `Alert.alert('Online payment', 'Razorpay SDK integration requires native build.\nUse COD for now in Expo Go.')`. So **online payment is not actually selectable in the app today**, even though the backend and web checkout both support it. Grepping `app/` also confirmed there is no wishlist screen and no return/exchange screen anywhere in the mobile codebase, despite both existing on the web (`account.js` → `/orders/:id/return-request`) and in the backend.

---

## Step 2 — Reference apps

### Myntra (India's leading fashion app, ~60-70% share of premium online fashion in India)
- **Navigation:** bottom tab bar — Home, Categories, Wishlist, Profile — with a persistent, prominent search bar.
- **PDP:** high-quality visuals, quick size selection, "similar products" rail. Known weak point: the search bar disappears on the PDP, forcing users to back out to search again.
- **Cart/checkout:** linear Cart → Address → Delivery → Summary → Payment → Confirm flow with saved addresses and multiple payment options; reviewers describe it as feeling like "paperwork," and promotional upsells during checkout are a recurring complaint.
- **Standout pattern:** Myntra has evolved into a shopping-plus-content "super-app" (styling content, community, AI-assisted recommendations) layered on top of commerce — a longer-term direction, not an immediate borrow for Sagona's stage.

### Zara
- **Navigation:** minimal, grid-first browsing with light category chrome — the product imagery does the work.
- **PDP:** single scrollable image stack, colour swatches, one primary "Add" action; some usability critique that colour selection sits below the CTA rather than above it.
- **Cart/checkout:** breadcrumb progress indicator, guest checkout, explicit shipping speed/cost choices up front.
- **Standout pattern worth borrowing:** an "added to bag" confirmation (toast/modal) immediately after tapping Add, with a direct shortcut to checkout — removes the uncertainty of "did that actually work?" and cuts a step for buyers who already know what they want.

### ASOS
- **Navigation/search:** prominent global search with type-ahead; faceted filters reload near-instantly.
- **PDP/save:** items saved to bag or wishlist persist for 60 days even for signed-out users, and stay in sync across web and app.
- **Cart/checkout:** straightforward, guest-friendly, social sign-in supported; known friction point is that items can't be edited mid-checkout.
- **Standout pattern worth borrowing:** persistent, cross-device, login-optional saved items. Directly informs how Sagona should design a future wishlist — local-first, then merged into the account on login, not gated behind auth from the start.

---

## Step 3 — Prioritized gap list (scoped to Sagona's actual stage)

This list is deliberately short — it's what a premium Indian kidswear D2C app at Sagona's current catalog size and stage should close next, not a checklist of everything Myntra/Zara/ASOS do.

### P0 — blocks revenue or core post-purchase trust
1. **Online payment in-app.** Checkout only offers COD; the Razorpay branch is a stub alert. Both the backend and the web checkout already support Razorpay end-to-end — this is a wiring gap, not new infrastructure. Highest-priority item: COD-only checkout caps conversion and increases fraud/return risk relative to prepaid orders.
2. **Return/exchange request flow in-app.** Exists on the web (`account.js`) and backend (`/orders/:id/return-request`) but has no mobile screen. For kidswear specifically, size-related returns/exchanges are routine (kids' measurements change fast, gifting mis-sizes) — parents expect to self-serve this from their phone without switching to the website.
3. **Size guide / fit guide screen.** The backend already has a sizing-feedback endpoint (`/sizing/feedback`, used by the web app's fit-feedback flow) but the app has no user-facing size chart or age/height-to-size guidance on the PDP. This is a well-known return-rate lever for kidswear specifically and the closest thing to a category-specific must-have in this list.

### P1 — retention and conversion
4. **Wishlist / favorites.** Standard expectation for browsing-heavy, gifting-driven kidswear shopping (parents/grandparents saving items across sessions). None exists today. When built, follow the ASOS pattern: local-first save, no login wall, merge into account on sign-in.
5. **Visual order-tracking timeline.** Order detail currently shows status as text only; a step tracker (Placed → Packed → Shipped → Out for delivery → Delivered) reduces "where's my order" support load, which matters more for a small team than for a large one.
6. **Loyalty points — earn/redeem UI.** Points already display in Account, but there's no way to see how they were earned or spend them. Low engineering lift relative to the retention value, since the underlying data already exists.

### P2 — trust-building, moderate effort
7. **Product reviews/ratings.** No review UI exists, and this needs backend collection work first (not purely a mobile task). Valuable for a D2C brand where parents buy apparel for kids sight-unseen, but sequence behind P0/P1.
8. **Recently viewed products.** Cheap to add (client-side, using data already fetched for PDPs) and reinforces the browsing loop — reasonable to bundle alongside wishlist work.

### P3 — explicitly deprioritize for now
9. **Guest checkout.** Only worth doing if signup drop-off data actually shows it's costing conversions — no evidence of that yet, and Sagona's repeat-purchase/loyalty model leans toward account-based shopping anyway.
10. **Social login.** Convenience only; low priority at current user volume.
11. **Push notification settings screen.** Defer until notification volume becomes a stated complaint.
12. **Product comparison.** Not a natural shopping behavior for kidswear (small basket sizes, fast decisions) — skip.
13. **Live human support / ticketing.** SAGi (AI chat) likely covers current support volume; revisit only if support tickets outgrow what the assistant can resolve.

---

## Summary

The app itself is in solid shape — all six mobile findings from the August 10 audit are resolved or were non-issues, and the core browsing → PDP → try-on → cart → COD-checkout → order-history loop works end-to-end. The real gap isn't broken code, it's **incomplete parity with what the backend and web frontend already support** (Razorpay, returns/exchanges) plus a small set of category-appropriate additions (size guide, wishlist, order tracking, loyalty redemption) that punch above their engineering cost for a kidswear D2C brand.

Awaiting your review and scope approval before Phase 2 (implementation) begins.
