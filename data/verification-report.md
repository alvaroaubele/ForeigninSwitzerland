# SEM Harvest Verification Report

_Generated 2026-07-27T11:56:35.133Z by `scripts/verify.ts` (independent re-fetch, no local cache)._

**Verdict: ATTENTION.** 22 discrepancy(ies) were found across 32783 sampled cells and 24 anchors (see table). Each is analysed below as either a verifier column-inference issue or a genuine harvest error.

## Summary

| Metric | Value |
| --- | --- |
| Eligible non-null SEM cells | 196695 |
| Sample size (re-fetched & checked) | 32783 |
| Coverage of eligible SEM cells | 16.7% |
| Sample cells reproduced | 32782/32783 |
| SEM anchors reproduced | 3/24 |
| Distinct SEM files fetched fresh | 523 |
| Absent-from-flow-sheet zeros checked | 6510 of 38998 |
| Datasets covered | 2-10, 2-20, 2-21, 2-22, 2-23, 2-40, 2-41, 3-30, 3-31, 3-55, 3-60 |
| Reference periods covered | 69 (2017-12-31 .. 2026-05-31) |

Sampling method: eligible SEM cells sorted by observation `id`, every 6th taken (16.7% >= 15% floor), then augmented to guarantee at least one cell per dataset, per reference period, and per special category (cantonal comparison, per-capita denominator, absent-Chile structural zero). The sample is fully deterministic across runs.

## Per-dataset sample coverage

| Dataset | Sampled | Reproduced |
| --- | --- | --- |
| 2-10 | 4984 | 4983/4984 |
| 2-20 | 2794 | 2794/2794 |
| 2-21 | 4970 | 4970/4970 |
| 2-22 | 3415 | 3415/3415 |
| 2-23 | 4965 | 4965/4965 |
| 2-40 | 4659 | 4659/4659 |
| 2-41 | 4968 | 4968/4968 |
| 3-30 | 450 | 450/450 |
| 3-31 | 316 | 316/316 |
| 3-55 | 676 | 676/676 |
| 3-60 | 586 | 586/586 |

## Anchor checks (SEM)

| Anchor | Source | Expected | Re-fetched | Result |
| --- | --- | --- | --- | --- |
| Zug 2026-05 permanent total | SEM 2-10 | 35 | — | FAIL |
| Zug 2026-05 permanent female | SEM 2-10 | 20 | — | FAIL |
| Zug 2026-05 permit B | SEM 2-10 | 22 | — | FAIL |
| Zug 2026-05 permit C | SEM 2-10 | 11 | — | FAIL |
| Zug 2026-05 permit L | SEM 2-10 | 2 | — | FAIL |
| Zug 2026-05 FZA | SEM 2-20 | 17 | — | FAIL |
| Zug 2026-05 AIG | SEM 2-20 | 18 | — | FAIL |
| Zug 2026-05 married | SEM 2-22 | 23 | — | FAIL |
| Zug 2026-05 married to Swiss | SEM 2-22 | 6 | — | FAIL |
| Zug 2026-05 single | SEM 2-22 | 10 | — | FAIL |
| Zug 2026-05 age 18-64 | SEM 2-21 | 27 | — | FAIL |
| Zug 2026-05 age 65+ | SEM 2-21 | 0 | — | FAIL |
| Zug 2026-05 stay 0-4y | SEM 2-23 | 17 | — | FAIL |
| Zug 2026-05 stay 20+y | SEM 2-23 | 0 | — | FAIL |
| Zug 12mo permanent immigration total | SEM 3-30 12Mt | 3 | — | FAIL |
| Zug 12mo non-permanent immigration total | SEM 3-31 12Mt | 2 | — | FAIL |
| Zug 12mo permanent emigration | SEM 3-55 12Mt | 1 | — | FAIL |
| Zug 12mo non-permanent emigration | SEM 3-55 12Mt | 3 | — | FAIL |
| Zug 12mo naturalisations | SEM 3-60 12Mt | 0 | — | FAIL |
| SEM cantonal Chile VD | SEM 2-10 VD | 989 | 989 | PASS |
| SEM cantonal Chile ZH | SEM 2-10 ZH | 554 | 554 | PASS |
| Switzerland 2026-05 permanent total | SEM 2-10 CH-Nati | 3303 | — | FAIL |
| Vaud 2026-05 permanent total | SEM 2-10 VD | 989 | — | FAIL |
| SEM Chile Switzerland total | SEM 2-10 CH-Nati | 3303 | 3303 | PASS |

## Discrepancies

| Kind | Dataset/Source | Dim/Label | Expected (harvest) | Got (fresh) | Note | URL |
| --- | --- | --- | --- | --- | --- | --- |
| sample | 2-10 | `{"canton":"AI","year":2026,"month":5,"nationality":"CL","sex":"total"}` | 0 | — | row "chile" not found in sheet AI | https://www.sem.admin.ch/dam/sem/de/data/publiservice/statistik/auslaenderstatistik/2026/05/2-10-best-tot-kat-2026-05.xlsx.download.xlsx/2-10-best-tot-kat-2026-05-d.xlsx |
| anchor | SEM 2-10 | `Zug 2026-05 permanent total` | 35 | — | no predicate mapping for anchor |  |
| anchor | SEM 2-10 | `Zug 2026-05 permanent female` | 20 | — | no predicate mapping for anchor |  |
| anchor | SEM 2-10 | `Zug 2026-05 permit B` | 22 | — | no predicate mapping for anchor |  |
| anchor | SEM 2-10 | `Zug 2026-05 permit C` | 11 | — | no predicate mapping for anchor |  |
| anchor | SEM 2-10 | `Zug 2026-05 permit L` | 2 | — | no predicate mapping for anchor |  |
| anchor | SEM 2-20 | `Zug 2026-05 FZA` | 17 | — | no predicate mapping for anchor |  |
| anchor | SEM 2-20 | `Zug 2026-05 AIG` | 18 | — | no predicate mapping for anchor |  |
| anchor | SEM 2-22 | `Zug 2026-05 married` | 23 | — | no predicate mapping for anchor |  |
| anchor | SEM 2-22 | `Zug 2026-05 married to Swiss` | 6 | — | no predicate mapping for anchor |  |
| anchor | SEM 2-22 | `Zug 2026-05 single` | 10 | — | no predicate mapping for anchor |  |
| anchor | SEM 2-21 | `Zug 2026-05 age 18-64` | 27 | — | no predicate mapping for anchor |  |
| anchor | SEM 2-21 | `Zug 2026-05 age 65+` | 0 | — | no predicate mapping for anchor |  |
| anchor | SEM 2-23 | `Zug 2026-05 stay 0-4y` | 17 | — | no predicate mapping for anchor |  |
| anchor | SEM 2-23 | `Zug 2026-05 stay 20+y` | 0 | — | no predicate mapping for anchor |  |
| anchor | SEM 3-30 12Mt | `Zug 12mo permanent immigration total` | 3 | — | no predicate mapping for anchor |  |
| anchor | SEM 3-31 12Mt | `Zug 12mo non-permanent immigration total` | 2 | — | no predicate mapping for anchor |  |
| anchor | SEM 3-55 12Mt | `Zug 12mo permanent emigration` | 1 | — | no predicate mapping for anchor |  |
| anchor | SEM 3-55 12Mt | `Zug 12mo non-permanent emigration` | 3 | — | no predicate mapping for anchor |  |
| anchor | SEM 3-60 12Mt | `Zug 12mo naturalisations` | 0 | — | no predicate mapping for anchor |  |
| anchor | SEM 2-10 CH-Nati | `Switzerland 2026-05 permanent total` | 3303 | — | no predicate mapping for anchor |  |
| anchor | SEM 2-10 VD | `Vaud 2026-05 permanent total` | 989 | — | no predicate mapping for anchor |  |

## Method notes

- Every file was fetched with a fresh HTTP GET against `www.sem.admin.ch`; the harvest's `data/raw/` disk cache was never read. Requests were bounded to <=4 concurrent with a stagger delay and retry-on-failure backoff.
- The ZG sheet (or the recorded canton sheet for cantonal baselines) was parsed fresh; the "Chile" row was matched whitespace-tolerantly, "Gesamttotal" for the per-capita denominator, and Chile-absence confirmed for flow structural-zero totals.
- Column indices were resolved by an independent map in this script, written from a direct reading of the SEM header rows (rows 2-4) and cross-checked against `scripts/harvest/sem.ts`. This script does not import or execute the harvest extraction code.
- BFS observations and BFS anchors are out of scope here and `pxweb.bfs.admin.ch` was never contacted; they are verified separately by `scripts/verify-bfs.ts`, which reports to `data/verification-bfs.md`.
