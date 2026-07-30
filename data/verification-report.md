# SEM Harvest Verification Report

_Generated 2026-07-30T11:22:12.267Z by `scripts/verify.ts` (independent re-fetch, no local cache)._

**Verdict: PASS.** An independent re-fetch of 343752 SEM cells (16.7% of the 2063205 eligible non-null SEM observations) and all 4 SEM anchors was performed directly against the recorded provenance URLs on www.sem.admin.ch, with no use of the local data/raw cache and without importing the harvest's extraction code. Column positions were derived independently from the SEM header rows. Every sampled value and every anchor reproduced exactly, so the SEM portion of the harvest faithfully reflects the published source files.

## Summary

| Metric | Value |
| --- | --- |
| Eligible non-null SEM cells | 2063205 |
| Sample size (re-fetched & checked) | 343752 |
| Coverage of eligible SEM cells | 16.7% |
| Sample cells reproduced | 343752/343752 |
| SEM anchors reproduced | 4/4 |
| Distinct SEM files fetched fresh | 169 |
| Absent-from-flow-sheet zeros checked | 91330 of 658408 |
| Datasets covered | 2-10, 2-20, 2-21, 2-22, 2-23, 2-40, 2-41, 3-30, 3-31, 3-55, 3-60 |
| Reference periods covered | 69 (2017-12-31 .. 2026-05-31) |

Sampling method: eligible SEM cells sorted by observation `id`, every 6th taken (16.7% >= 15% floor), then augmented to guarantee at least one cell per dataset, per reference period, and per special category (cantonal comparison, per-capita denominator, absent-Chile structural zero). The sample is fully deterministic across runs.

## Per-dataset sample coverage

| Dataset | Sampled | Reproduced |
| --- | --- | --- |
| 2-10 | 159435 | 159435/159435 |
| 2-20 | 12953 | 12953/12953 |
| 2-21 | 23044 | 23044/23044 |
| 2-22 | 15842 | 15842/15842 |
| 2-23 | 23034 | 23034/23034 |
| 2-40 | 21584 | 21584/21584 |
| 2-41 | 23063 | 23063/23063 |
| 3-30 | 14395 | 14395/14395 |
| 3-31 | 10095 | 10095/10095 |
| 3-55 | 21595 | 21595/21595 |
| 3-60 | 18712 | 18712/18712 |

## Anchor checks (SEM)

| Anchor | Source | Expected | Re-fetched | Result |
| --- | --- | --- | --- | --- |
| Zug 2026-05 permanent total | SEM 2-10 | 35 | 35 | PASS |
| Zug 2026-05 permit B | SEM 2-10 | 22 | 22 | PASS |
| Switzerland 2026-05 permanent total | SEM 2-10 CH-Nati | 3303 | 3303 | PASS |
| Vaud 2026-05 permanent total | SEM 2-10 VD | 989 | 989 | PASS |

## Discrepancies

None. Every re-fetched sample cell and every SEM anchor matched.

## Method notes

- Every file was fetched with a fresh HTTP GET against `www.sem.admin.ch`; the harvest's `data/raw/` disk cache was never read. Requests were bounded to <=4 concurrent with a stagger delay and retry-on-failure backoff.
- The ZG sheet (or the recorded canton sheet for cantonal baselines) was parsed fresh; the "Chile" row was matched whitespace-tolerantly, "Gesamttotal" for the per-capita denominator, and Chile-absence confirmed for flow structural-zero totals.
- Column indices were resolved by an independent map in this script, written from a direct reading of the SEM header rows (rows 2-4) and cross-checked against `scripts/harvest/sem.ts`. This script does not import or execute the harvest extraction code.
- BFS observations and BFS anchors are out of scope here and `pxweb.bfs.admin.ch` was never contacted; they are verified separately by `scripts/verify-bfs.ts`, which reports to `data/verification-bfs.md`.
