# BFS Harvest Verification Report

_Generated 2026-07-24T23:10:54.080Z by `scripts/verify-bfs.ts` (independent re-fetch, no local cache)._

**Verdict: PASS.** All 1649 non-null BFS cells (100% — not a sample) and all 8 BFS anchors were re-fetched directly from `www.pxweb.bfs.admin.ch` and reproduced exactly. Queries were reconstructed by inverting the harvested dimensions back to PxWeb codes with a map written in this script; json-stat2 was decoded by a decoder written in this script; the harvest's fetcher, walker, and query definitions were not imported. Each cube's metadata was also re-fetched and the source's own labels confirm the code meanings the harvest relied on.

## Summary

| Metric | Value |
| --- | --- |
| Eligible non-null BFS cells | 1649 |
| Cells re-fetched and reproduced | 1649 (100.0%) |
| Coordinates absent from the fresh response | 0 |
| BFS anchors reproduced | 8/8 |
| Code-meaning claims confirmed from metadata | 14/14 |
| HTTP requests issued | 19 (sequential, 6s apart) |

## Per-cube reproduction

| Cube | Cells checked | Reproduced |
| --- | --- | --- |
| `px-x-0103010000_101` | 1203 | 1203/1203 |
| `px-x-0103010000_399` | 394 | 394/394 |
| `px-x-0103010000_423` | 52 | 52/52 |

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
| 423 | Chilean nationals in Zug born in Chile vs elsewhere, 2023 | 4 | 4 | OK |
| 423 | Chilean-born residents of Zug by marital status, 2023 | 12 | 12 | OK |
| 101 | Chilean nationals in Zug by year (permanent) | 15 | 15 | OK |
| 399 | Chilean-born residents of Zug by passport group | 24 | 24 | OK |
| 101 | All Chilean nationals in Switzerland by year (baseline) | 30 | 30 | OK |
| 399 | Chilean-born residents of Zug by sex and year | 30 | 30 | OK |
| 423 | Chilean nationals in Zug by marital status and sex, 2023 | 36 | 36 | OK |
| 101 | Chilean nationals by canton, 2024 (baseline) | 54 | 54 | OK |
| 101 | Total resident population by canton, 2024 (per-capita denominator) | 54 | 54 | OK |
| 101 | Zug total and Swiss population by year (foreign-total baseline) | 60 | 60 | OK |
| 101 | Chilean nationals in Zug by sex and year | 90 | 90 | OK |
| 399 | Chilean-born residents of Zug by passport group and year | 120 | 120 | OK |
| 399 | Chilean-born residents of Zug by 5-year age class and year | 220 | 220 | OK |
| 101 | Chilean nationals in Zug by permit category and year | 240 | 240 | OK |
| 101 | Chilean nationals in Zug by 5-year age class and year | 660 | 660 | OK |

## Anchor checks (BFS)

| Anchor | Source | Expected | Re-fetched | Result |
| --- | --- | --- | --- | --- |
| BFS 2024 Chilean nationals (perm) | BFS 101 | 33 | 33 | PASS |
| BFS 2017 Chilean nationals (perm) | BFS 101 | 34 | 34 | PASS |
| BFS 2020 Chilean nationals (perm) | BFS 101 | 20 | 20 | PASS |
| BFS 2024 Chilean-born (perm) | BFS 399 | 99 | 99 | PASS |
| BFS 2024 Chilean-born Swiss passport | BFS 399 | 33 | 33 | PASS |
| BFS 2024 Chilean-born LatAm passport | BFS 399 | 34 | 34 | PASS |
| BFS 2024 Chilean-born EU passport | BFS 399 | 29 | 29 | PASS |
| BFS 2023 Chilean nationals born in Chile | BFS 423 | 27 | 27 | PASS |

## Discrepancies

None. Every re-fetched cell, every anchor, and every code meaning matched.

## Method notes

- Every request was a fresh HTTPS call to `www.pxweb.bfs.admin.ch`; the harvest's `data/raw/` cache was never read.
- This script imports nothing from `scripts/harvest/`. The json-stat2 decoder computes row-major strides explicitly (a different formulation from the harvest's successive-remainder walker), and the dimension→code map is the inverse direction of the one the harvest uses, so a stride or mapping error in either would surface as a mismatch rather than cancel out.
- Requests were issued one at a time, spaced, by `curl` with its default User-Agent. Both matter: the WAF in front of the host rejects unrecognised User-Agents and Node's TLS fingerprint outright, and answers a burst of rejections with a short connection-level ban. A block page aborts this script instead of being retried.
- A null cube value is compared as 0, matching the harvest's rule that an absent register figure at this level is a structural zero rather than a suppression.
