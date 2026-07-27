# BFS Harvest Verification Report

_Generated 2026-07-27T12:05:29.190Z by `scripts/verify-bfs.ts` (independent re-fetch, no local cache)._

**Verdict: ATTENTION.** 9 discrepancy(ies) across 139389 cells, 9 anchors and 14 code-meaning claims. See the tables below.

## Summary

| Metric | Value |
| --- | --- |
| Eligible non-null BFS cells | 139389 |
| Cells re-fetched and reproduced | 139389 (100.0%) |
| Coordinates absent from the fresh response | 0 |
| BFS anchors reproduced | 0/9 |
| Code-meaning claims confirmed from metadata | 14/14 |
| HTTP requests issued | 22 (sequential, 6s apart) |

## Per-cube reproduction

| Cube | Cells checked | Reproduced |
| --- | --- | --- |
| `px-x-0103010000_101` | 57015 | 57015/57015 |
| `px-x-0103010000_399` | 80322 | 80322/80322 |
| `px-x-0103010000_423` | 2052 | 2052/2052 |

## Code meanings, confirmed against cube metadata

The harvest assigns meaning to bare numeric codes. These are the source's own labels for them, re-fetched fresh:

| Cube | Variable | Code | Harvest's meaning | Label published by BFS | |
| --- | --- | --- | --- | --- | --- |
| 101 | Staatsangehörigkeit | `8407` | Chile | Chile | OK |
| 101 | Kanton | `ZG` | Canton Zug | Zug | OK |
| 101 | Kanton | `8100` | Switzerland | Schweiz | OK |
| 101 | Bevölkerungstyp | `1` | permanent resident population | Ständige Wohnbevölkerung | OK |
| 101 | Bevölkerungstyp | `2` | non-permanent resident population | Nichtständige Wohnbevölkerung | OK |
| 101 | Geschlecht | `1` | male | Mann | OK |
| 101 | Geschlecht | `2` | female | Frau | OK |
| 101 | Anwesenheitsbewilligung | `2` | permit B | Aufenthalter (B) | OK |
| 101 | Anwesenheitsbewilligung | `3` | permit C | Niedergelassener (C) | OK |
| 399 | Geburtsstaat | `8407` | born in Chile | Chile | OK |
| 399 | Staatsangehörigkeit (Auswahl) | `1` | Swiss passport | Schweiz | OK |
| 399 | Staatsangehörigkeit (Auswahl) | `7` | Latin America & Caribbean passport | Lateinamerika und Karibik | OK |
| 423 | Zivilstand | `2` | married | Verheiratet, in eingetragener Partnerschaft | OK |
| 423 | Geburtsstaat | `8407` | born in Chile | Chile | OK |

## Query blocks re-issued

Each block is the per-dimension union of the coordinates of the cells that claim to come from it — reconstructed from the harvested data, not copied from the harvest's query definitions.

| Cube | Concept | Harvested cells | Cells returned fresh | |
| --- | --- | --- | --- | --- |
| 101 | Chilean nationals in Zug by year (permanent) | 15 | 15 | OK |
| 399 | Chilean-born residents of Zug by passport group | 24 | 24 | OK |
| 101 | All Chilean nationals in Switzerland by year (baseline) | 30 | 30 | OK |
| 101 | Chilean nationals by canton, 2024 (baseline) | 54 | 54 | OK |
| 101 | Total resident population by canton, 2024 (per-capita denominator) | 54 | 54 | OK |
| 423 | Chilean nationals in Zug born in Chile vs elsewhere, 2023 | 108 | 108 | OK |
| 399 | Chilean-born residents of Zug by sex and year | 810 | 810 | OK |
| 423 | Chilean nationals in Zug by marital status and sex, 2023 | 972 | 972 | OK |
| 423 | Chilean-born residents of Zug by marital status and sex, 2023 | 972 | 972 | OK |
| 101 | Zug total and Swiss population by year (foreign-total baseline) | 1620 | 1620 | OK |
| 101 | Chilean nationals in Zug by sex and year | 2430 | 2430 | OK |
| 399 | Chilean-born residents of Zug by passport group and year | 3240 | 3240 | OK |
| 399 | Chilean-born residents of Zug by 5-year age class and year | 5940 | 5940 | OK |
| 101 | Chilean nationals in Zug by permit category and year | 6480 | 6480 | OK |
| 399 | Chilean-born residents of Zug by passport group and sex | 9720 | 9720 | OK |
| 101 | Chilean nationals in Zug by 5-year age class and year | 17820 | 17820 | OK |
| 399 | Chilean-born residents of Zug by 5-year age class and sex | 17820 | 17820 | OK |
| 101 | Chilean nationals in Zug by permit, sex and age (latest year) | 28512 | 28512 | OK |
| 399 | Chilean-born residents of Zug by passport group, sex and age (latest year) | 42768 | 42768 | OK |

## Anchor checks (BFS)

| Anchor | Source | Expected | Re-fetched | Result |
| --- | --- | --- | --- | --- |
| Zug BFS 2024 Chilean nationals (perm) | BFS 101 | 33 | — | FAIL |
| Zug BFS 2017 Chilean nationals (perm) | BFS 101 | 34 | — | FAIL |
| Zug BFS 2020 Chilean nationals (perm) | BFS 101 | 20 | — | FAIL |
| Zug BFS 2024 Chilean-born (perm) | BFS 399 | 99 | — | FAIL |
| Zug BFS 2024 Chilean-born Swiss passport | BFS 399 | 33 | — | FAIL |
| Zug BFS 2024 Chilean-born LatAm passport | BFS 399 | 34 | — | FAIL |
| Zug BFS 2024 Chilean-born EU passport | BFS 399 | 29 | — | FAIL |
| Zug BFS 2023 Chilean nationals born in Chile | BFS 423 | 27 | — | FAIL |
| Switzerland BFS 2024 Chilean nationals (perm) | BFS 101 CH | 3394 | — | FAIL |

## Discrepancies

| Kind | Cube/Source | Dim/Label | Expected (harvest) | Got (fresh) | Note |
| --- | --- | --- | --- | --- | --- |
| anchor | BFS 101 | `Zug BFS 2024 Chilean nationals (perm)` | 33 | — | no independent predicate written for this anchor |
| anchor | BFS 101 | `Zug BFS 2017 Chilean nationals (perm)` | 34 | — | no independent predicate written for this anchor |
| anchor | BFS 101 | `Zug BFS 2020 Chilean nationals (perm)` | 20 | — | no independent predicate written for this anchor |
| anchor | BFS 399 | `Zug BFS 2024 Chilean-born (perm)` | 99 | — | no independent predicate written for this anchor |
| anchor | BFS 399 | `Zug BFS 2024 Chilean-born Swiss passport` | 33 | — | no independent predicate written for this anchor |
| anchor | BFS 399 | `Zug BFS 2024 Chilean-born LatAm passport` | 34 | — | no independent predicate written for this anchor |
| anchor | BFS 399 | `Zug BFS 2024 Chilean-born EU passport` | 29 | — | no independent predicate written for this anchor |
| anchor | BFS 423 | `Zug BFS 2023 Chilean nationals born in Chile` | 27 | — | no independent predicate written for this anchor |
| anchor | BFS 101 CH | `Switzerland BFS 2024 Chilean nationals (perm)` | 3394 | — | no independent predicate written for this anchor |

## Method notes

- Every request was a fresh HTTPS call to `www.pxweb.bfs.admin.ch`; the harvest's `data/raw/` cache was never read.
- This script imports nothing from `scripts/harvest/`. The json-stat2 decoder computes row-major strides explicitly (a different formulation from the harvest's successive-remainder walker), and the dimension→code map is the inverse direction of the one the harvest uses, so a stride or mapping error in either would surface as a mismatch rather than cancel out.
- Requests were issued one at a time, spaced, by `curl` with its default User-Agent. Both matter: the WAF in front of the host rejects unrecognised User-Agents and Node's TLS fingerprint outright, and answers a burst of rejections with a short connection-level ban. A block page aborts this script instead of being retried.
- A null cube value is compared as 0, matching the harvest's rule that an absent register figure at this level is a structural zero rather than a suppression.
