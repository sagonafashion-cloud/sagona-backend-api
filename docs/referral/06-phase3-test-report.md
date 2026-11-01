# Phase 3 test report

Environment: sandbox, no live database (models faked in memory), no bank. Run 2026-11-03.

| Suite | Result |
|---|---|
| `node --test tests/referral/*.test.mjs` | 100 pass / 0 fail (22 new in `phase3_payout.test.mjs`) |
| Golden legacy snapshots | 6/6 identical |
| Admin UI (jsdom), incl. 11 new Payouts checks | 28 pass / 0 fail |

Mutation checks (each break was caught by a failing test): removing the approve-time balance re-check, changing the TDS threshold rule, flipping TDS sign in the net.

Covered: financial-year boundaries (IST), GST intra/inter-state and odd-paisa split, TDS with/without threshold, all eligibility blockers, draft->approve->paid, double approve, balance drop after drafting, open-batch exclusion, fail/cancel refunds without double refund, UTR/reason validation, bank-file gating and audit, CSV formula injection, statement arithmetic, role matrix.

**Not covered (needs staging + CA):** real Mongo concurrency (two admins approving at once; guarded by idempotency keys but untested on a real DB), real bank file acceptance by your bank's format, correctness of tax settings.
