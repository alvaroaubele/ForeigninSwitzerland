# SEM Harvest Verification Report

_Generated 2026-07-25T16:00:53.934Z by `scripts/verify.ts` (independent re-fetch, no local cache)._

**Verdict: PASS.** An independent re-fetch of 1205 SEM cells (16.7% of the 7228 eligible non-null SEM observations) and all 22 SEM anchors was performed directly against the recorded provenance URLs on www.sem.admin.ch, with no use of the local data/raw cache and without importing the harvest's extraction code. Column positions were derived independently from the SEM header rows. Every sampled value and every anchor reproduced exactly, so the SEM portion of the harvest faithfully reflects the published source files.

## Summary

| Metric | Value |
| --- | --- |
| Eligible non-null SEM cells | 7228 |
| Sample size (re-fetched & checked) | 1205 |
| Coverage of eligible SEM cells | 16.7% |
| Sample cells reproduced | 1205/1205 |
| SEM anchors reproduced | 22/22 |
| Distinct SEM files fetched fresh | 468 |
| Absent-from-flow-sheet zeros checked | 11 of 113 |
| Datasets covered | 2-10, 2-20, 2-21, 2-22, 2-23, 2-40, 2-41, 3-30, 3-31, 3-55, 3-60 |
| Reference periods covered | 69 (2017-12-31 .. 2026-05-31) |

Sampling method: eligible SEM cells sorted by observation `id`, every 6th taken (16.7% >= 15% floor), then augmented to guarantee at least one cell per dataset, per reference period, and per special category (cantonal comparison, per-capita denominator, absent-Chile structural zero). The sample is fully deterministic across runs.

## Per-dataset sample coverage

| Dataset | Sampled | Reproduced |
| --- | --- | --- |
| 2-10 | 198 | 198/198 |
| 2-20 | 108 | 108/108 |
| 2-21 | 177 | 177/177 |
| 2-22 | 126 | 126/126 |
| 2-23 | 206 | 206/206 |
| 2-40 | 180 | 180/180 |
| 2-41 | 144 | 144/144 |
| 3-30 | 17 | 17/17 |
| 3-31 | 14 | 14/14 |
| 3-55 | 23 | 23/23 |
| 3-60 | 12 | 12/12 |

## Anchor checks (SEM)

| Anchor | Source | Expected | Re-fetched | Result |
| --- | --- | --- | --- | --- |
| SEM 2026-05 permanent total | SEM 2-10 | 35 | 35 | PASS |
| SEM 2026-05 permanent female | SEM 2-10 | 20 | 20 | PASS |
| SEM 2026-05 permit B | SEM 2-10 | 22 | 22 | PASS |
| SEM 2026-05 permit C | SEM 2-10 | 11 | 11 | PASS |
| SEM 2026-05 permit L | SEM 2-10 | 2 | 2 | PASS |
| SEM 2026-05 FZA | SEM 2-20 | 17 | 17 | PASS |
| SEM 2026-05 AIG | SEM 2-20 | 18 | 18 | PASS |
| SEM 2026-05 married | SEM 2-22 | 23 | 23 | PASS |
| SEM 2026-05 married to Swiss | SEM 2-22 | 6 | 6 | PASS |
| SEM 2026-05 single | SEM 2-22 | 10 | 10 | PASS |
| SEM 2026-05 age 18-64 | SEM 2-21 | 27 | 27 | PASS |
| SEM 2026-05 age 65+ | SEM 2-21 | 0 | 0 | PASS |
| SEM 2026-05 stay 0-4y | SEM 2-23 | 17 | 17 | PASS |
| SEM 2026-05 stay 20+y | SEM 2-23 | 0 | 0 | PASS |
| SEM 12mo permanent immigration total | SEM 3-30 12Mt | 3 | 3 | PASS |
| SEM 12mo non-permanent immigration total | SEM 3-31 12Mt | 2 | 2 | PASS |
| SEM 12mo permanent emigration | SEM 3-55 12Mt | 1 | 1 | PASS |
| SEM 12mo non-permanent emigration | SEM 3-55 12Mt | 3 | 3 | PASS |
| SEM 12mo naturalisations | SEM 3-60 12Mt | 0 | 0 | PASS |
| SEM cantonal Chile VD | SEM 2-10 VD | 989 | 989 | PASS |
| SEM cantonal Chile ZH | SEM 2-10 ZH | 554 | 554 | PASS |
| SEM Chile Switzerland total | SEM 2-10 CH-Nati | 3303 | 3303 | PASS |

## Discrepancies

None. Every re-fetched sample cell and every SEM anchor matched.

## Method notes

- Every file was fetched with a fresh HTTP GET against `www.sem.admin.ch`; the harvest's `data/raw/` disk cache was never read. Requests were bounded to <=4 concurrent with a stagger delay and retry-on-failure backoff.
- The ZG sheet (or the recorded canton sheet for cantonal baselines) was parsed fresh; the "Chile" row was matched whitespace-tolerantly, "Gesamttotal" for the per-capita denominator, and Chile-absence confirmed for flow structural-zero totals.
- Column indices were resolved by an independent map in this script, written from a direct reading of the SEM header rows (rows 2-4) and cross-checked against `scripts/harvest/sem.ts`. This script does not import or execute the harvest extraction code.
- BFS observations and BFS anchors are out of scope here and `pxweb.bfs.admin.ch` was never contacted; they are verified separately by `scripts/verify-bfs.ts`, which reports to `data/verification-bfs.md`.
