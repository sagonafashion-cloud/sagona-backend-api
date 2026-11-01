# Referral Programme: Admin Guide and Runbook (Phase 1)

## A. What you can do in Phase 1
Manage promoters, their KYC and agreement status, referral codes, commission rates and programme settings, with a full audit trail. **Customers cannot use codes yet** (that is Phase 2), and no commission is calculated yet.

## B. Turning the module on (one-time, on a staging copy first)

1. **Back up first:** take a manual MongoDB Atlas snapshot.
2. On Render, add two environment variables (this restarts the service):
   - `REFERRAL_ENC_KEY`: a random 64-character hex string. Create one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. **Store a copy in your password manager. If it is lost, encrypted PAN/bank details and KYC files cannot be recovered. If it is changed, existing encrypted data becomes unreadable.**
   - `REFERRAL_ENABLED=true`
3. Wait for the deploy to go live; the Render log shows `[referral] module loaded`.
4. Upload the three changed admin files to sagona.in (`admin.html`, `nc_assets/js/admin.js`, `nc_assets/js/admin-referral.js`).
5. Log in to the admin panel as **super_admin** (2FA on). A **Promoters** menu item appears. If it does not, the env flag is off, the files are old, or your role is not super_admin / finance_manager.
6. In **Settings**, leave "Programme enabled" off for now. Turn it on only when Phase 2 (checkout) is deployed and tested.

## C. Everyday tasks

**Add a promoter:** Promoters, Add Promoter. Required: name, mobile, date of birth (18+). Add PAN and bank details (account name must match the promoter). Open the promoter, upload KYC documents (PAN, bank proof, ID), then set **KYC: verify**. Record the signed agreement (**Agreement: signed**, enter the version). Then press **Activate**. Activation is refused until both are done.

**Create a code:** Referral Codes, New Code. Enter a percent or flat discount, optional cap and minimum order, dates, usage limits and categories. Leave "Exclude already-discounted items" ticked. The margin guard warns (or blocks, if set to block) when discount % plus commission % is above your limit.

**Set commission rates:** Commission Rates. Add a rate per category (or one fallback for all). Changing a rate means adding a new row with a new "effective from" date; the old rows stay as history. A promoter-specific override beats the default.

**Suspend a promoter:** open the promoter, Suspend, enter a reason. Their active codes pause immediately. Re-activating restores only the codes that were paused by the suspension.

**Reveal full PAN / bank number:** open the promoter, Reveal. You must give a reason; every reveal is recorded in the Audit Log with your name, time and IP.

## D. Who can do what
| Role | Access |
|---|---|
| super_admin | Everything |
| finance_manager | View promoters, codes, rates, settings, audit (no changes, no documents, no reveal) |
| store_manager, content_editor, viewer | No access |

## E. Rollback
1. Fastest: set `REFERRAL_ENABLED` to `false` on Render. The module stops loading, all `/api/admin/promoters` and `/api/referral` URLs return 404, and the Promoters menu item disappears. The website, checkout, invoices and GST reports are unaffected (they never depended on this module in Phase 1).
2. Data stays in the database untouched. Re-enable later to continue.
3. Full removal (rarely needed): drop the six collections and the `promoter_docs` GridFS bucket after taking a backup.

## F. Monitoring checklist (weekly)
- Audit Log: look for unexpected `sensitive.reveal` or `document.download` entries.
- Promoters: any "active" promoter with a red "PAN missing" or a "bank name mismatch" warning.
- Render logs: lines starting `[referral]`.

## G. Known limits in Phase 1
- No customer-facing discount, no commission calculation, no payouts or reports (Phases 2-4).
- Append-only protection is enforced by the application, not by database permissions.
- KYC documents are limited to PDF/JPEG/PNG up to 5 MB each.
- Tax rates and thresholds are settings, not facts; confirm them with your CA before enabling TDS or GST-on-commission.

---

## Phase 2 runbook

**New settings (Promoters > Settings):** `commission_base` (NET_OF_GST default), `return_window_days` (10), `reevaluate_gst_slab` (off), `slab_threshold_paise`, `slab_low_rate`, `slab_high_rate`. Confirm tax-related ones with your CA before enabling.

**Decisions to be aware of**
- Free-shipping threshold is evaluated on the **list value (before referral discount)**, so a code never takes a shopper below free shipping. Change in `orderCalculator` if you prefer otherwise.
- Existing quirk (not introduced by this work): checkout shows the birthday discount in the summary differently from what the server computes. Reported separately; untouched.
- Commission sweeper runs every 6h (first run 90s after boot), only when `REFERRAL_ENABLED=true`. It is idempotent; safe to restart. Manual run: restart the service.

**Deploy order (Phase 2)**
1. Staging first (separate Render service + Atlas DB + Razorpay test keys). Place COD and online test orders with a code; verify invoice, GST report, ledger.
2. Merge backend (flag still off) -> confirm legacy checkout unchanged.
3. Upload `checkout.html`, `checkout.js`, `admin.html`, `admin.js`, `admin-referral.js` (cache-bust strings are already bumped).
4. Set `REFERRAL_ENC_KEY`, then `REFERRAL_ENABLED=true`, enable in Settings, create a test code.

**Rollback:** set `REFERRAL_ENABLED=false` (or the in-panel switch). Existing referred orders and ledger rows are kept untouched; legacy paths run byte-identically (golden test).

---

## Phase 3 runbook: paying promoters

1. **Settings first (with your CA):** `tds_enabled`, `tds_section`, `tds_rate_bps`, `tds_annual_threshold_paise`, `gst_on_commission_bps`, `store_state_code`, `min_payout_paise`. On each promoter set "TDS applicable" and "GST on commission applicable" as advised. All ship OFF/zero.
2. **Payouts tab > Ready to pay now.** Anyone ineligible shows the reason. Fix the cause (KYC, agreement, bank details, PAN/GSTIN) and refresh.
3. **Create draft batch.** Nothing is reserved yet; you can cancel freely.
4. **Approve.** Commission is deducted from payable balances. If a balance dropped meanwhile (return/adjustment) that item is dropped, not overpaid; create a new batch for it.
5. **Download bank file**, upload it to your bank (the file holds account numbers: delete it afterwards). Bank transfer happens outside Sagona; the system never moves money.
6. **Mark paid** with each UTR. If the bank rejects one, click **Failed** with the reason: funds return to the promoter's payable balance.
7. **Month end:** download Payouts CSV for your accountant; TDS CSV for the TDS return working; send promoters their statement (Statements section).

**Rollback / safety:** a draft or approved batch can be cancelled (funds returned by `payout_void`). A paid batch cannot be cancelled; correct it with a ledger adjustment and note.

---

## Phase 4 runbook: fraud review and month-end checks

**Fraud Review tab.** An order with an open flag is **on hold**: the commission stays pending and cannot be paid. For each flag:
- *Clear* if it is a false alarm (add a note). When the last open flag on that order is cleared the hold lifts and the normal lifecycle continues.
- *Confirm fraud* if it is real. The commission is clawed back, the referral is voided and the note is audited. Consider suspending the promoter from the Promoters tab.
The customer's order and discount are not touched by either action.

**Reports tab, monthly:**
1. Check **Data checks** shows All OK. Anything else: note the sample ids and ask me/your developer before paying out.
2. **What you owe promoters** is the figure for your books (pending + payable + approved-but-unpaid payouts).
3. **GST effect of the discount** shows how much lower your reported taxable value and GST are because of referral discounts. Give this to your CA.
4. **Margin after commission** (super_admin only) uses each product's buying cost; sales for products with no cost on file are shown as excluded.

**Tuning:** if flags are noisy, raise `fraud_velocity_orders_24h` or `fraud_return_rate_alert_pct` in Settings. Rules never delay a customer's order.

---

## Phase 5 runbook

**Turn-on order:** deploy backend (flag still off) -> upload frontend files -> staging test -> then in Settings enable the programme, and separately `portal_enabled` when you want promoters to log in. Both are off until you switch them on.

**Links:** give each promoter `https://sagona.in/?ref=THEIRCODE` (the portal shows it with a Copy button). Reports > Link performance shows clicks, orders and conversion. Clicks are approximate (one per browser session, no visitor tracking).

**Promoter emails** (new order with their code, commission payable, commission reversed after cancel/return, payout paid) go out from the existing Resend setup every 6 hours, grouped into one email per type. They contain amounts only. Fraud flags and confirmed-fraud reversals are never emailed. If `RESEND_API_KEY` is missing the events stay queued and retry, up to 5 times. Promoters can switch emails off in their dashboard; you can switch all of them off with `notifications_enabled`.

**Promoter portal:** promoters need an **email address on their record** (Promoters tab) to log in. They sign in with a code emailed to them. They see only their own numbers. To change bank/PAN details they contact you. To lock someone out, suspend them: it takes effect immediately.

**Mobile app:** the checkout screen shows a referral box when the programme is on. This needs a new app build and store release; until then the app behaves as before. The app still estimates GST locally; when a code is applied it shows the server's total.

**Upload list:** `promoter.html`, `nc_assets/js/promoter.js`, `nc_assets/js/config.js`, `nc_assets/js/checkout.js`, `checkout.html`, `admin.html`, `nc_assets/js/admin.js`, `nc_assets/js/admin-referral.js`.
