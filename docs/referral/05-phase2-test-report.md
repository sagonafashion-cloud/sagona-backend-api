# Phase 2 test report

Run date: 2026-11-01. Environment: sandbox, no live database, no Razorpay. Mongoose model statics are stubbed.

| Suite | Result |
|---|---|
| `node --test tests/referral/*.test.mjs` (Phase 1 + 2) | 78 pass / 0 fail |
| Golden legacy snapshots (flag off) | 6/6 byte-identical |
| Checkout UI (jsdom) | 16 pass |
| Admin UI (jsdom, incl. Referred Orders, Ledger, adjustment, read-only role) | all pass, 0 fail |

Covered: trade-discount GST maths and rounding, per-line allocation, slab re-evaluation, commission base rules, rate precedence, atomic usage limit, snapshot honouring, non-enumerating errors, ledger idempotency and sweeper (eligible/reversal), invoice/GST/analytics use of charged amounts, COD stale-code 409.

**Not covered (needs staging):** real Mongo transactions, real Razorpay payment + webhook, email rendering in a mail client, PDF invoice visual check. Do not enable the flag in production before these pass.
