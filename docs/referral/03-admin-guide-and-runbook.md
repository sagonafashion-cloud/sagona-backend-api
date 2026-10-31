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
