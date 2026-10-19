# SAGONA — Fixes for Remaining Audit Findings (2026-08-18)

Follow-up to `SAGONA_FULL_AUDIT_REPORT_2026-08-18.md`. All items executed exactly as scoped — no scope creep, no changes outside the sections below.

## Section 1 — Backend

**1a. `createManualOrder`** — no behavior change. Added the requested comment directly above the pricing-trust code in `orderController.js` documenting that admin-entered totals are intentional.

**1b. ActivityLog wired up.** New `backend/utils/activityLogger.js` (`logAdminActivity`) writes admin, action, target, before/after summary, IP, user-agent, timestamp — wrapped in try/catch so a logging failure can never break the real request. Existing `ActivityLog.js` schema needed no changes.

Now logged: `createAdmin`, order `createManualOrder`/`updateOrderStatus`/`adminInitiateReturn`/`actionReturn`, product `adminCreateProduct`/`adminUpdateProduct`/`adminArchiveProduct`/`adminBulkImport`/`adminUpdateInventory` (plus the legacy create/delete), `bulkUploadController`'s actual UI-facing bulk upload, store create/update/toggle/delete, homepage section create/update/delete/reorder, and admin image upload/delete — the last one was an unlogged admin write the agent found while auditing every `adminProtect` route, not on the original list.

Not built (as instructed): a viewer UI. For when you want one, it'll need: filter by admin, filter by action type, filter by target id, date range, pagination, and a detail view for the variable `details` blob.

**1c.** `adminBulkImport` now maps rows through an explicit field whitelist (mirroring `adminUpdateProduct`'s field set) before `insertMany`, instead of passing `req.body` straight through. Confirmed no legitimate field was dropped. Side note: the admin UI's actual bulk-upload path (`bulkUploadController.js`) already had its own whitelist and was never at risk — this fix closes the older, lower-level endpoint.

Files touched: `orderController.js`, `adminAuthController.js`, `productController.js`, `bulkUploadController.js`, `storeController.js`, `homepageController.js`, `uploadRoutes.js`, new `utils/activityLogger.js`. Nothing outside `backend/` touched.

## Section 2 — Mobile app

**2a.** Confirmed exact keys (`['myOrders']` in `account.tsx`, `['returnEligibleOrders']` in `return-request.tsx`) and added both invalidations in `checkout/index.tsx` right after the successful COD order call. Spot-checked the diff directly — limited to the `useQueryClient` import/hook and the two invalidation lines. Razorpay branch untouched (no order is created there in the current Expo Go build).

**2b.** New `src/lib/authEvents.ts` (dependency-free emitter) breaks the circularity. `api.ts`'s interceptor only fires `emitSessionExpired()` when the failing request actually carried an `Authorization` header AND isn't `/auth/login`/`/auth/register` — spot-checked this logic directly in the file. `authStore.ts` subscribes once, reuses `logout()`'s existing cleanup (including the `sagi_session` key from the prior audit pass), and redirects to `/auth/login`, with a re-entrancy guard since `logout()` itself makes one more authenticated call. Matched behavior against the website's own `api.js` 401 handler (read-only reference, not modified). A failed login can't trigger this because there's no token yet to attach as an Authorization header — confirmed by reading the request interceptor.

**2c.** Confirmed still in place — no `PlayfairDisplay_600SemiBold` references remain.

`login.tsx`, `cartStore.ts`, `bag.tsx` — not opened in this pass.

## Section 3 — Website

**3a. Blocked by an environment permission issue, not a code problem.** Every dead file was verified fully unreferenced and safe to delete:

| File | Verdict |
|---|---|
| `nc_assets/js/drawer.js` | Zero references — safe to delete |
| `drawer.html` | Zero references (and isn't even valid HTML — it's a bare JS template-literal snippet saved with an `.html` extension) — safe to delete |
| `nc_assets/js/app.js` | Zero references — safe to delete |
| `nc_assets/js/returns.js` | Zero references, `returns.html` doesn't script-tag it — safe to delete |
| `.card` (stray dotfile) | Zero references — safe to delete |

Separate finding, not deleted per instructions: `returns.html` is *not* dead — `index.html` links to it and it self-links from its footer. It's a live page that just doesn't use `returns.js`.

I could not execute the deletions myself — both the file-delete tool and the sandboxed shell reported the SAGONA folder's mount as inaccessible at the OS level (`operation not permitted`), independent of which agent tried it. **You'll need to delete these five files yourself**, or re-grant folder access and ask me to retry:

```
rm "/Users/neelam/Downloads/SAGONA/frontend/nc_assets/js/drawer.js" \
   "/Users/neelam/Downloads/SAGONA/frontend/drawer.html" \
   "/Users/neelam/Downloads/SAGONA/frontend/nc_assets/js/app.js" \
   "/Users/neelam/Downloads/SAGONA/frontend/nc_assets/js/returns.js" \
   "/Users/neelam/Downloads/SAGONA/frontend/.card"
```

**3b. Done.** `sizing.js` now escapes every previously-unescaped dynamic field going into `innerHTML` (`rec.size`, `confidenceLabel`, `fitType`, `warnings[]`, `fitNote`, `notes[]`, `alternative`/`safeToAvoid` size+reason, `allSizes[].size`, and the message/error branches), reusing the same `escapeHtml` already imported from `config.js` — no new helper written. Spot-checked directly: confirmed present at the `warnings`/`fitNote` call sites. For normal (non-malicious) server responses, output is byte-identical to before.

## Regression check

- Backend: `logAdminActivity` calls confirmed present across 8 files (31 call sites) via direct grep. `createManualOrder` pricing logic unchanged. Bulk import field parity verified by the agent against `adminUpdateProduct`.
- Mobile: confirmed both `invalidateQueries` calls present in `checkout/index.tsx`; confirmed the 401-handler's header/path guard logic directly in `api.ts`. `login.tsx`, `cartStore.ts`, `bag.tsx` untouched; `checkout/index.tsx` diff limited to the cache-invalidation addition.
- Website: `sizing.js` escaping confirmed in place. Dead-file deletion **not yet executed** — pending the manual step above.

## Still open

1. Run the five `rm` commands above (or re-grant folder access so I can retry).
2. Everything else from Section 1/2/3 is done; Section 4 items remain untouched as instructed.
