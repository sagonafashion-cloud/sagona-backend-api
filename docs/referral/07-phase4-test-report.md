# Phase 4 test report

Environment: sandbox, no live database (models faked in memory). Run 2026-11-04.

| Suite | Result |
|---|---|
| `node --test tests/referral/*.test.mjs` | 120 pass / 0 fail (20 new in `phase4.test.mjs`) |
| Golden legacy snapshots | 6/6 identical |
| Admin UI (jsdom) incl. fraud queue + reports | 38 pass / 0 fail |

Mutation checks caught: ignoring the scan result in the sweeper (flagged order would have become payable), velocity `>` changed to `>=`, return-rate counting removed.

Covered: each fraud rule and its boundaries, idempotent flag creation (incl. duplicate-key race), hold in the real sweeper (flagged + past return window stays unpaid; control order is released), clear/confirm semantics (last-flag-releases-hold, double-resolve refused, single clawback), liability/summary/GST/performance/profit arithmetic, each of 8 reconciliation checks failing when its data is corrupted, role matrix.

**Not covered (needs staging):** report speed and memory on a large order history (reports load all referral rows; fine for thousands, revisit before tens of thousands), real-database concurrency of the sweeper, false-positive rate of the rules on real traffic (start by watching the queue for a few weeks).
