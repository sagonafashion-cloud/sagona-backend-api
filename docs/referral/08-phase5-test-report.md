# Phase 5 test report

Environment: sandbox, no live database, no email provider, no device. Run 2026-11-05.

| Suite | Result |
|---|---|
| `node --test tests/referral/*.test.mjs` | 137 pass / 0 fail (17 new in `phase5.test.mjs`) |
| Golden legacy snapshots | 6/6 identical |
| Admin UI (jsdom) | 39 pass / 0 fail |
| Checkout UI (jsdom) incl. 8 new link checks | 24 pass / 0 fail |
| Promoter portal + `?ref=` capture (jsdom, new) | 27 pass / 0 fail |
| Mobile app type-check (`tsc`) | no errors in the changed screen (2 older errors in `account.tsx` and `_layout.tsx` already existed) |

Mutation checks caught: dropping the token audience check, un-scoping the orders query from the logged-in promoter, removing the 5-attempt lockout, announcing fraud reversals by email.

Covered: click endpoint answers 204 for everything and counts only active codes; link report; which events become emails, grouping, idempotency, opt-out/inactive/no-email skipping, retry and give-up; login anti-enumeration, hashed single-use expiring codes, lockout; token isolation between customer/admin/promoter; every portal query scoped to the logged-in promoter and free of customer fields; `?ref=` validation, 30-day expiry, one click per session, silent drop of dead codes, link forgotten after the order.

**Not covered (needs staging / device):** real email delivery and the look of the emails in Gmail; real Mongo behaviour of TTL expiry on login codes; the Expo app on a phone (UI layout, keyboard behaviour); promoter portal on mobile browsers.
