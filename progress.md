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
