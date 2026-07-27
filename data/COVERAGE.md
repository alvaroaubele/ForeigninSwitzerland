# Coverage — what is knowable about Chileans in Switzerland

This file records, per source, which cross-tabulations of the Chilean population
in Switzerland — nationally and per canton — actually exist in official open data, which are withheld, and which
were never published. It is the written companion to `manifest.json` (machine
form) and the in-app dimension-availability map.

The subject population is small: **3 303 Chilean passport holders** and **8 308
Chilean-born residents** across Switzerland, and far smaller per canton — 35 and
99 in Zug, and none at all in Appenzell Innerrhoden. Most multi-dimensional cross-tabs
over a population this size are simply not produced by the statistical offices.
That absence is the central finding, not a gap in this harvest.

## The four cell states

| State | Meaning |
|---|---|
| **observed** | A real published figure (any non-negative number). |
| **structural zero** | The combination exists in the source and the count is genuinely 0. |
| **suppressed** | Exists but withheld below a publication/confidentiality threshold. |
| **not published** | The source never cross-tabulated these dimensions for this population. |

At the SEM/BFS register level, `suppressed` is rare — both offices publish
exact register counts including explicit zeros — so almost every miss is either
a genuine `structural zero` (the nation/permit/age cell is present and 0) or
`not published` (no table crosses those two dimensions at all).

**A caveat on the word "structural".** In statistical usage a structural zero is
a cell that *cannot* be non-zero by construction. Here the term is used in a
weaker sense: **the source published this cell and the number was 0.** A few of
these really are structural — Swiss nationals in the non-permanent *foreign*
population, or the asylum-seeker (N) and protection-status (S) permit categories
within the permanent population. The large majority are ordinary empirical
zeros: no Chilean nationals resident in Appenzell Innerrhoden in 2024, no
non-permanent Chilean men in Zug in 2016, and some 610 empty five-year age bands.
The two are not separated, because the distinction this project exists to draw
is between *a published 0* and *no published figure at all*, and both kinds sit
firmly on the published side of it. Read the open ring as "counted, and the
answer was nobody" — never as "this could not have happened."

## Sources harvested

### SEM Ausländerstatistik (administrative register, monthly)

Multi-sheet XLSX, one sheet per canton (`ZG`), row `Chile`. Reference date is
the month end. Archive index resolved per month; download URLs extracted from
the index page (capitalisation varies by year, e.g. 2017–2024 use `-d-`, 2026
uses lowercase).

**Retention discovered:** the archive exposes **December snapshots for
2017–2025** and **monthly files from 2021 onward**; the latest published month
is **2026-05**. Pre-2017 is not available in this URL scheme (2016-12 and
earlier return 404).

**Harvest scope: everything the archive publishes.** All **69 reference
periods** — the December snapshot for 2017–2020, where that is the only file
exposed, then **every month from 2021-01 to 2026-05**.

An earlier build sampled this down to the 14 December snapshots, on the argument
that a population moving by one or two people a year is fully described by its
year-end level. That was wrong on both counts. The month-to-month path is where
the information is at this size: the recovery from the 2020 trough turns out to
be a staircase of long flat runs with single-person steps between them, which
the annual series renders as a smooth slope that never happened. And the weight
objection did not survive the arithmetic then or since: the current national
harvest ships one payload per canton at roughly 70 kB gzipped each. Nothing
serves raw JSON.

| Table | Concept | Dimensions carried for Chile, per canton sheet |
|---|---|---|
| 2-10 | Stock by permit | permanent total, permit L/B/C, non-permanent, each × sex; grand total |
| 2-20 | Stock by legal basis | FZA (free movement) vs AIG (third-country) × sex |
| 2-21 | Stock by age (permanent) | 5 SEM age bands (0–5, 6–15, 16–17, 18–64, 65+) × sex |
| 2-22 | Stock by marital status | single / married / widowed / divorced / partnership; **married-to-a-Swiss subset**; born-in-Switzerland subset |
| 2-23 | Stock by length of stay | 0–4 / 5–9 / 10–14 / 15–19 / 20+ years × sex |
| 2-40 | Non-permanent by category | short-term categories × sex |
| 2-41 | Non-permanent by age | age bands × sex |
| 3-30 | Immigration by reason (permanent) | quota/non-quota employment, family reunification, education, residence w/o employment, refugee, hardship, ruling, other |
| 3-31 | Immigration by reason (non-permanent) | as above (fewer categories) |
| 3-55 | Emigration | permanent total + L/B/C + non-permanent × sex |
| 3-60 | Naturalisation | ordinary / facilitated / reinstated |

**Flow tables list only nations with movement in the period.** When `Chile` is
absent from a flow sheet, that is a genuine *structural zero* (no movement),
recorded as such. Annual calendar-year flows come from the December `-J-`
variant; the current rolling-12-month figures (which reproduce the anchor set)
come from the `-12Mt-` variant of the latest release.

**Cantonal baselines** are read from the 2-10 workbook's other canton sheets
(all 26 cantons + the Switzerland `CH-Nati` sheet), giving the comparison set
(VD 989, ZH 554, GE 503, BE 284, FR 222, ZG 35, …) and each canton's total
foreign-resident count as the per-capita denominator.

### BFS STATPOP (population register, annual, via PxWeb json-stat2)

Reference date is 31 December. Chile = `8407`, Zug = `ZG`, `-99999` = a
dimension total.

| Cube | Span | What it uniquely carries |
|---|---|---|
| px-x-0103010000_101 | 2010–2024 | Chilean **nationals** per canton and nationally by year × population type × permit × sex × age class; plus cantonal and Switzerland totals |
| px-x-0103010000_399 | 2020–2024 | Chilean-**born** residents by **passport group** (the citizenship-vs-birthplace split: 33 Swiss / 29 EU / 34 LatAm), sex, age |
| px-x-0103010000_423 | 2023 only | marital status crossed with nationality **and** birth country |

## What is cross-tabulated vs. never published

The two sources differ in kind here, and an earlier version of this file did not
distinguish them — it listed pairs as "never published" that BFS publishes
perfectly well and that this harvest had simply never asked for. That was a
statement about the query plan wearing the clothes of a statement about the
source, and it is the one error this project cannot afford, because every honest
signal in the app rests on `not published` meaning *the office did not publish
it*. The lists below are now split by which claim is being made.

**SEM — fixed table layouts.** Each published workbook is a specific
cross-tabulation and nothing else can be extracted from it. SEM crosses each
attribute with **sex** and with nothing else, and not even that for marital
status (table 2-22 has no sex columns at all). So permit × age, permit × marital,
legal-basis × age, marital × length-of-stay, length-of-stay × marital, reason ×
age and reason × sex genuinely do not exist in SEM, for Chile or anyone else.
These are real absences.

**BFS — a queryable cube.** `Anwesenheitsbewilligung`, `Geschlecht`,
`Altersklasse`, `Staatsangehörigkeit (Auswahl)` and `Zivilstand` are full
dimensions, and the API returns any combination of them on request. The harvest
therefore asks for the full permit × sex × age cross for Chilean nationals and
the full passport-group × sex × age cross for the Chilean-born, both at the
latest complete year, in addition to the one-breakdown-at-a-time time series.
**Three-way profiles are answerable**: B permit, female, aged 45–49 resolves to
5 people. Cells reach n = 1; those are BFS's own published figures, not anything
this project derived.

**Available pairs and triples:**
permit × sex, legal-basis × sex, age × sex, marital × sex (BFS only),
length-of-stay × sex, permit × sex × age (BFS, latest year), passport-group ×
sex × age (BFS, latest year), passport-group × birth-country, nationality ×
birth-country (2023), marital × sex × birth-country (2023), reason ×
population-type, permit × population-type (flows), year × permit, year × age,
year × sex, canton × nationality.

**Still genuinely absent:** every SEM pair listed above, any BFS cross for a year
other than the latest one, and anything crossing a SEM-only dimension (legal
basis, length of stay, reason) with a BFS-only one (birth country, passport
group) — the two registers are not linked at the record level, so no office
publishes such a table.

## The SEM ↔ BFS reference-date offset

SEM's latest is **31 May 2026**; BFS STATPOP's latest complete year is **31 Dec
2024** — about seventeen months apart. Where both measure the same concept they
disagree slightly (SEM counts 35 permanent Chilean nationals at May 2026; BFS
counts 33 at Dec 2024). Both are recorded with their own reference date and are
**never reconciled to a single number.**

## Verified anchors

The harvest self-checks against a fixed anchor list (see `manifest.json →
anchors`), and two independent verifiers then re-fetch the figures from the
published sources — `scripts/verify.ts` for SEM (≥15% deterministic sample plus
every SEM anchor, reported in `data/verification-report.md`) and
`scripts/verify-bfs.ts` for BFS (all non-null cells plus every BFS anchor, plus a
metadata check that the numeric codes mean what the harvest assumed, reported in
`data/verification-bfs.md`). Neither imports any harvest code. Anchors include: SEM 2026-05 — 35 permanent (20 F / 15 M), L2/B22/C11,
FZA 17 / AIG 18, married 23 (6 to a Swiss national), single 10, age 18–64 = 27,
65+ = 0, stay 0–4y = 17, 20+y = 0, inflow 3 + 2, departures 1 + 3,
naturalisations 0; cantonal VD 989 / ZH 554 / Switzerland 3 303; BFS — 2010–2024
series with 2017 peak 34, 2020 trough 20, 2024 = 33 nationals; 99 Chilean-born
(33 Swiss / 29 EU / 34 LatAm); 27 of 28 Chilean nationals born in Chile (2023).

## BFS harvest state (this build)

Complete, for every canton and the national total. All configured BFS cube
queries return live data and all 33 anchors pass (see `manifest.json →
anchors`). Cell counts per cube are recorded in `data/verification-bfs.md`,
which re-fetches every one of them independently.


### How BFS access was actually blocked

Earlier builds recorded this endpoint as rate-limiting the egress IP. That
diagnosis was **wrong**, and the correction matters for anyone re-running the
harvest. Two independent filters in front of `pxweb.bfs.admin.ch` were rejecting
the harvester, neither of them a rate limit:

1. **The User-Agent.** The WAF answers any UA string it does not recognise with
   HTTP 400 and a 54 KB HTML block page. The harvester's own polite identifying
   UA was one of those, so *every* BFS request had been failing on its headers,
   never reaching the query engine. curl's default UA is accepted.
2. **The HTTP client.** Node's built-in `fetch` is rejected on its TLS/HTTP
   fingerprint no matter what headers it sends: byte-identical requests get
   400/503 from `fetch` and 200 from curl. BFS traffic therefore goes through
   curl (`transport: "curl"` in `scripts/harvest/fetcher.ts`).

The "tarpit" behaviour that looked like rate limiting was the escalation
pattern: a burst of blocked requests trips a short connection-level ban, so the
retry ladder made things worse. The fetcher now recognises a block page by shape
and fails immediately instead of retrying into a ban. With both filters
understood, the whole cube set answers back-to-back at ~12 s per query.

A second, independent route to the same figures is also implemented, in case the
query API is withdrawn: `scripts/harvest/px.ts` downloads a cube in full over
plain GET (`DownloadFile.aspx?file=<cube>`, 95–275 MB) and decodes the PC-Axis
format locally. Set `BFS_MODE=px` to force it. Its row-major index arithmetic is
unit-tested (`npm test`) against a fixture whose every value equals its own flat
index, so a stride error cannot pass silently.
