# Referral Programme: Phase 1 Test Report

Run from `backend/`:

```
node --test tests/referral/*.test.mjs      # 40 tests, no database needed
node tests/golden/golden_legacy.mjs        # legacy money path unchanged (6 cases)
```
UI test (needs `esbuild` and `jsdom`, which are not repo dependencies): `tests/referral/admin_ui.uitest.mjs` (13 checks).

## Results (this branch)
| Suite | Result |
|---|---|
| Unit: validators, crypto, rate selection, margin guard, settings, models, append-only | 15 / 15 pass |
| Handler + permission tests (database stubbed) | 25 / 25 pass |
| Golden snapshots of the existing tax + invoice output | 6 / 6 identical |
| Admin UI (jsdom) | 13 / 13 pass |
| Mutation check: break the activation gate on purpose | 2 tests failed as they should; code restored |

## Boot behaviour, checked by starting the real server
| Condition | Result |
|---|---|
| `REFERRAL_ENABLED` unset | `/api/referral/status`, `/api/admin/promoters/*` return **404**; no referral module loaded; no referral log lines |
| `REFERRAL_ENABLED=true`, no token | `/api/admin/promoters/*` return **401**; `/api/referral/status` returns `{enabled:false}`; boot warns if `REFERRAL_ENC_KEY` is missing but does not stop |
| Existing admin routes (e.g. `/api/admin/orders`) | unchanged (401 without a token) |

## What the tests prove
- PAN, bank account and GSTIN are stored encrypted; the API response, audit log and error paths contain none of the plaintext or the ciphertext.
- Missing encryption key gives 503, never plaintext storage.
- Duplicate mobile / PAN / bank account is refused; minors are refused; GSTIN check digit is verified (the store's own GSTIN validates).
- A promoter cannot be activated without verified KYC and a signed agreement; suspension pauses codes; reactivation restores only suspension-paused codes; terminated promoters stay terminated.
- Rate history is never overwritten; rate selection follows effective dates and the promoter > category > default order.
- Margin guard warns or blocks as configured.
- Revealing sensitive data writes the audit row first; if the audit write fails, no data is returned.
- Every admin route sits behind login and a role guard; all writes are super_admin only; other roles are refused; 2FA is enforced.

## Not tested yet (needs the staging database, see discovery report Q1)
- Real MongoDB behaviour: unique indexes, GridFS upload/download round trip, concurrent duplicate creation.
- Multer upload path end to end.
- Existing GST report and live checkout output (no database in the build sandbox). These are untouched in Phase 1; golden coverage is added when staging exists.

## Files changed in existing code (Phase 1)
`backend/server.js` (flag-gated dynamic import, 11 lines), `backend/utils/validateEnv.js` (warning only), `backend/.env.example`, `frontend/admin.html` (menu item + section), `frontend/nc_assets/js/admin.js` (section registration, null-safe section toggle, menu reveal).
No order, payment, tax, invoice, GST or analytics code was touched.
