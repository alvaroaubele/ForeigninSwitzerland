# Progress — Chileans in Canton Zug data explorer

## Phase 0 — Source reconnaissance (2026-07-24)
- Repo empty at start; branch claude/chilean-zug-data-explorer-vr2kmr. Node 22, tsx, xlsx installed.
- SEM archive reachable. Retention: December snapshots 2017-2025; monthly from 2021-06; 2026 months 01-05 (latest = 2026-05). Pre-2017 unavailable in this URL scheme (2016/12 and earlier 404).
- SEM URL capitalisation varies by year (2017-2024 use `-d-`, 2026 lowercase). Links resolved from each month's archive index page, never constructed.
- BFS PxWeb reachable. Cubes enumerated:
  - 101: Jahr(2010-2024) x Kanton x Bevölkerungstyp(2) x Anwesenheitsbewilligung(12) x Geschlecht(3) x Altersklasse(22) x Staatsangehörigkeit(203). Chile=8407, ZG present.
  - 399: Jahr(2020-2024) x Kanton x Bevölkerungstyp(2) x Nationalitätsgruppe(12) x Geburtsstaat(202,incl Chile) x Geschlecht x Altersklasse. Birth-country cube.
  - 423: Jahr(2023) x Kanton x Bevölkerungstyp(2) x Staatsangehörigkeit(199,incl Chile) x Geburtsstaat(203,incl Chile) x Geschlecht x Zivilstand(6). Marital cube.
- ANCHORS REPRODUCED at source: SEM 2-10 ZG Chile 2026-05 = 35 perm (20F/15M), L2/B22/C11, nonperm 2, total 37. BFS 101 series 2010-2024 = [10,14,10,19,24,20,30,34,25,24,20,23,26,28,33] (2017 peak 34, 2020 trough 20, 2024=33). BFS 399 ZG born-Chile 2024 perm = 99 (33 CH / 29 EU / 34 LatAm / 1 NAmer / 2 Ozeanien).

## Phase 0 — SEM table structures decoded (2026-07-24)
- Stock tables (2-x) always list Chile row; sub-column 0 = structural zero.
  - 2-10 perm total+L/B/C+nonperm+grand; 2-20 FZA/AIG; 2-21 age bands; 2-22 marital+married-to-Swiss+born-in-CH; 2-23 length-of-stay; 2-40/2-41 non-permanent cat/age.
- Flow tables (3-x) list ONLY nations with movement -> absent nation = structural-zero flow. Confirmed Chile absent from YTD-2026 inflow.
- Flow anchors reproduce with rolling 12-month variant (-12Mt-): 3-30=3 perm inflow, 3-31=2 nonperm, 3-55=1 perm+3 nonperm emigration, 3-60 absent=0 naturalisations. Annual calendar-year flows come from December "-J-" releases.
- Harvest scope decided: SEM stock = Decembers 2017-2025 (annual) + all 2026 months (monthly, latest 2026-05); SEM flows = Dec "-J-" (annual per year) + 2026-05 "-12Mt-" (current). BFS = strategic marginal+2-way slices of cubes 101/399/423 covering all app dimensions + cantonal baselines. Rationale: population ~35, monthly deltas <=2; documented in COVERAGE.md.

## Phase 2 — Application built (2026-07-24)
- SEM harvest complete: 1772 observations, 22/30 anchors pass (all SEM; cantonal baselines VD 989/ZH 554/CH 3303 reproduce). BFS pending (endpoint blocked).
- Next.js 15.5.21 App Router, TS strict. `next build` succeeds: 0 type errors, 0 lint errors, static export, 124 kB first load.
- Components: Header, PassportBirthplace (hero contrast), Trend (2010-2024 series), CrossFilter (4-state resolver + drop-filter), Baselines (cantons/per-capita/index), AvailabilityMatrix, Method, Footer, Explorer (URL state + CSV/JSON export).
- Charting: custom SVG over d3-scale (straight segments, per-point state markers) — chosen for 4-state honesty and no false-precision smoothing.
- Visual direction built against "Federal Register" (recommended); token-based so swappable. Four directions to be presented for choice.
- BLOCKER: pxweb.bfs.admin.ch POST endpoint blocked after harvest burst (~since 16:08). Gentle 3-min poller running; app handles missing BFS via not_published state.

## Phase 2 — Adversarial review + fixes (2026-07-24)
- Ran a 5-dimension adversarial review workflow (17 agents). 10 findings confirmed after independent verification; all fixed:
  - HIGH: absent-Chile flow structural zeros now run through the same extractor over a zero row -> carry nationality:CL + correct populationType/concept (reachable by app queries, no longer mis-read as not_published). 113 such cells corrected.
  - MED: chart points now expose hover provenance (SVG <title> with source+refdate); Baselines figures wrapped in ProvenanceTip; national figure uses latestSemMonth not hardcoded date; CSV/JSON export no longer substitutes a parent aggregate for an empty view.
  - LOW: fetcher honours cached 404 markers; 2-22 "born in Switzerland" no longer tagged birthCountry:other; removed dead double-counting sumMatching/sumOver; removed unused d3-shape/d3-array deps + fixed README.
  - Bonus (found while verifying): naturalisation metric now uses populationType "total" in the cross-filter (was unqueryable).
- SEM harvest regenerated: 1876 obs (1094 observed, 782 structural_zero), 22/22 SEM anchors still pass. tsc + next build clean.

## Phase 2 — BFS headline data seeded (2026-07-24)
- pxweb POST endpoint stayed rate-limited through the session (GET works; POST tarpitted, >40min silence didn't clear). Live long-wait recovery task still running as a floor.
- Committed two genuinely-fetched BFS json-stat2 responses (captured pre-rate-limit) under data/bfs-seed/; runBfsSeed() emits 39 real BFS cells -> hero split (99: 33/29/34) + full 2010-2024 trend. 29/30 anchors pass (only cube-423 2023=27 pending live).
- Fixed stacked-bar flex rendering (ProvenanceTip now accepts style/className). Verified hero + trend render correctly via headless Chromium. tsc + build clean.

## Phase 2 — pxweb deep-harvest: definitive blocker (2026-07-24, 19:20)
- Long-wait recovery probed at 18:03/18:29/18:54/19:20 — all timed out. Immediately after, one manual small POST (q101, 15 cells) returned HTTP 200 — a fleeting window.
- Ran full harvest at 19:21 while endpoint was briefly up: all 13 live BFS queries failed (retryable 400/503/empty over 40 min of 50s-spaced attempts + backoff). A follow-up tiny probe timed out again — the burst re-blocked it.
- Conclusion: pxweb POST is intermittently but persistently blocked for this egress IP (1 success in ~3.5h; re-blocks on any burst). Deep BFS breakdowns (101 permit/sex/age, 399 sex/age, cube 423 marital) remain BLOCKED. Reached the run's stop condition (endpoint stays down / disproportionate cost). Headline BFS views (trend + hero split) remain served from the committed real-data seed; 29/30 anchors. `npm run harvest` completes the deep BFS whenever pxweb is reachable.

## Phase 2 — BFS blocker diagnosed and cleared (2026-07-24, 22:30)
- The "pxweb POST rate limit" recorded in every earlier entry was a MISDIAGNOSIS. Two filters in front of the host, neither a rate limit: (1) the WAF answers any unrecognised User-Agent with HTTP 400 + a 54 KB HTML block page — our own polite identifying UA was blocked, so no BFS request had ever reached the query engine; (2) Node's built-in fetch is rejected on its TLS/HTTP fingerprint regardless of headers (byte-identical request: fetch 400/503, curl 200).
- Proof: same POST body, curl default UA -> 200; curl + harvest UA -> 400 + block page. Node fetch with curl UA / browser UA / bare -> 503 every time. The "tarpit on bursts" was the escalation to a short connection-level ban that repeated block pages trigger.
- Fix: fetcher gained a selectable transport; BFS uses curl with no UA override. Block pages are detected by shape and fail fast (retrying them is what caused the bans). Cached absence markers now honour only 404/410 — four stale 400 markers from the broken UA were short-circuiting the cube-101 queries into empty bodies.
- Result: all 13 BFS queries live, ~12s each. 3525 observations (was 1876+39 seed). 30/30 anchors pass, including the previously unreachable cube-423 anchor (2023: 27 of 28 Chilean nationals in Zug born in Chile).
- Also added scripts/harvest/px.ts — a PC-Axis reader + full-cube GET downloader (95–275 MB/cube) as an independent second route, unit-tested (npm test, 6 cases) against a fixture whose every value equals its own flat index so stride errors can't pass silently. BFS_MODE=px forces it. Built before the real cause was found; kept as a fallback if the query API is ever withdrawn.
- tsx moved into devDependencies (harvest/test scripts had only worked via an ambient npx cache — not reproducible from a clean checkout).
- tsc + next lint + next build all clean; app re-rendered headless with zero console errors.

## Phase 2 — independent verification of both sources (2026-07-24, 23:0x)
- Gap found on review: the spec requires that harvesting agents not validate their own output, but only SEM had an independent verifier, and its report was stale — generated against 1772 eligible cells when commit 5f0d47f had since raised the harvest to 1876. 104 SEM cells had never been re-checked by anything.
- Wrote scripts/verify-bfs.ts (~480 lines, imports nothing from scripts/harvest/): inverts each harvested BFS observation's dimensions back into PxWeb codes, groups them into minimal query blocks, re-POSTs via curl at 6s spacing, and decodes json-stat2 with its own row-major stride arithmetic. Also re-reads each cube's metadata and asserts 14 code claims against BFS's own German labels (8407 -> /chile/i, ZG -> /zug/i, Bevölkerungstyp 1 -> /ständige/i, …) — the bare numeric codes being exactly where a silent mapping error would hide.
- VERIFY_BFS_PLAN=1 proves the inversion offline before spending network: 1649 eligible -> 1649 coordinates -> 0 unmappable -> 15 blocks -> exactly 1649 cells requested. No over-fetch, no gaps, so the harvested cells form clean rectangles. 100% BFS coverage costs 18 requests, cheaper than sampling.
- TWO STALE STRING CONSTANTS found in scripts/verify.ts, both from harvest labels that had been reworded after the verifier was written:
  1. Silent: the absence marker had become "Chile (absent from flow table = 0)" vs the verifier's exact "Chile (absent = 0)". 113 cells (3-31, 3-55, 3-60) matched zero, fell through to the ordinary column path, and would have failed as "row chile not found" — a correct structural zero turned into a fake discrepancy. Fixed with a prefix match plus explicit sampled/total reporting so the class can never silently drop to zero again.
  2. Loud: 2-22's "Born in Switzerland" had become "Born in Switzerland (of Chilean nationality)"; 14 cells reported as unmapped columns (4 of them sampled). Fixed with a prefix match.
- Added VERIFY_PLAN=1 to scripts/verify.ts: resolves EVERY eligible cell (not just the sampled 16.7%) through the column rules and reports unmapped ones, with no network traffic. This is the structural fix for the class of bug above — previously a reworded label outside the sample would not have surfaced until a later run happened to draw one. Currently: all 1876 resolve.
- SEM verification (live, no cache): 313/313 sampled cells (16.7%, >=15% floor) and 22/22 SEM anchors reproduced from 123 freshly-downloaded workbooks. Clean.
- BFS verification by a separate agent with its own context, written from scratch: 1649/1649 cells matched, 0 mismatches, all 8 BFS anchors re-derived. It guarded its decoder three ways (marginal identities in every response; Switzerland = sum of 26 cantons for 2024; four re-queries with different-shaped selections changing every stride — 196 overlapping cells, 0 disagreements). Report in data/bfs-verification.md.
- Acted on that agent's one substantive non-value finding: `structural_zero` is applied to every published zero, but ~850 of the 933 are ordinary empirical zeros (0 Chileans in Appenzell Innerrhoden) rather than counts impossible by construction (~85: Swiss in the non-permanent foreign population, N/S permits within the permanent population). Values are right and the four-state model is spec-mandated, so the states were left alone and the *definition* was sharpened instead — lib/model.ts and COVERAGE.md now say explicitly that the open ring means "counted, and the answer was nobody", never "this could not have happened".
- Third bug, this one in the new verifier rather than the old: its anchor predicates demanded exactly one matching observation, and 7 of 8 matched several. Not an error in the harvest — an anchor names a *figure*, and the harvest emits that same BFS cell once per breakdown series it heads (the 2024 Zug total appears under "by year", "by permit", "by sex", "by age class" and "by canton"). Rewritten to accept N matches and instead fail if they disagree on value or on the PxWeb coordinate they invert to, which is the condition that would actually indicate a fault. Now reports "(5 concepts agree)" where it previously errored.
- Final state of both verifiers, run live against the published sources with no cache:
  - SEM — 313/313 sampled cells (16.7% of 1876 eligible, >=15% floor), 22/22 anchors, 123 workbooks re-downloaded. data/verification-report.md.
  - BFS — 1649/1649 cells (100%, not a sample), 8/8 anchors, 14/14 code-meaning claims confirmed against BFS's own German labels, 19 requests. data/verification-bfs.md.
- npm run typecheck / lint / test / build all clean (6/6 tests, 125 kB first load, 5/5 static pages).

## Phase 3 — deployed, then rebuilt for readers (2026-07-25)
- Live at chileansin-zug.vercel.app via Vercel's GitHub integration (user connected the repo; every push to the default branch now deploys). Verified a fresh-clone `npm ci && npm run build` first, so the first deploy could not fail on a missing lockfile or uncommitted public/data.
- User review raised four things. Three were correct and one needed a straight answer rather than a fix:
  1. "Less text, it reads like you explaining what you did." Correct. The prose argued with hypothetical dashboards ("a filter-and-chart dashboard would blur these into one number") and narrated method inside the findings. Every section rewritten to roughly half length, in a public register.
  2. "It's basically a pivot table; I want depth that identifies each profile." Half-satisfiable. Built "Who are the 35?" — every attribute drawn at once, splittable by sex, which is a portrait rather than a cell lookup. But drill-down to individual profiles is impossible and I said so: SEM crosses each attribute with sex and with NOTHING else (verified — permit x sex, legalBasis x sex, ageClass x sex, lengthOfStay x sex all published; marital x sex NOT published; no pair of non-sex attributes ever). At n=35 that is disclosure control. A tool that appeared to narrow to one person would be inventing numbers.
  3. "The data at the start looked more detailed than the webpage — were you blocked?" No block: BFS was cleared earlier, 13/13 queries live, 30/30 anchors, 1649/1649 independently re-verified. But the impression was right and had two causes, both my decisions: SEM sampled to 14 of ~69 available periods, and three harvested dimensions (birthCountry 410 cells, nationalityGroup 394, marriedToSwiss 28 — ~830 cells) never exposed in the UI at all.
  4. "I like monthly visibility, is it so bad on data heaviness?" No. Measured rather than assumed: 8877 obs gzip to 192 kB vs 83 kB for 3525. Nothing serves raw JSON.
- Harvest extended 14 -> 69 reference periods (every month the archive publishes from 2021, December snapshots before that). 3525 -> 8877 observations; SEM 1876 -> 7228; BFS unchanged at 1649; 30/30 anchors still pass. Cold run 1905s, ~1200 files.
- Trend chart gained a Yearly/Monthly toggle — without it the extra 55 periods would have been invisible, since the chart only ever plotted Decembers. Monthly points sit at fractional year positions (2023-04 = 2023.25) so one linear scale carries both resolutions; points carry their own period name so the crosshair reads "Apr 2023" not "2023.25", and axis ticks are clamped to whole years.
- Passport group is now a cross-filter breakdown, which required a real fix: the BFS branch pinned nationality=CL on every stock query, but the birthplace cube has no nationality dimension, so the entire passport-group row would have resolved to "never published" — the page's own headline finding hidden by its own filter.
- Deliberately NOT exposed: birthCountry as a breakdown (one real value plus an internal sentinel; a row whose only choice silently re-bases 33 passport-holders onto 99 Chilean-born is a trap), and marriedToSwiss as a filter (a subset flag, not a dimension — now a line under the portrait's marital bar: of 23 married, 6 to a Swiss national).
- ENVIRONMENT NOTE for future runs: untracked files are reaped periodically in this container. node_modules, .next, data/raw/ and scratch scripts all vanished mid-session more than once. Consequence that matters: data/raw/ cannot be relied on to resume a harvest, so a cold run must complete in one pass, and `npm ci` may be needed before any long job.
- Self-audit after the expansion: interaction latency with 8877 obs — chip click 210ms, portrait sex-split 274ms, monthly toggle 183ms, TTI 2.6s on the dev server. No regression; the per-option resolveCell fan-out is still memoised per filter.
