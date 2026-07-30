# Foreigners in Switzerland — every nationality, every canton

An honest exploration of official statistics on **every foreign nationality in
Switzerland** — around 200 of them, from the largest communities to the
microstates with a single resident — shown for the whole country by default,
narrowable to any of the 26 cantons and to any nationality. The default view
is the entire foreign population; picking a country turns the same page into
that community's portrait (the project began as "Chileans in Zug": 35 passport
holders, 99 Chilean-born — that view still exists at `?nat=CL&kt=ZG`).

Most of these populations are small at canton level, and that is the whole
design problem — Swiss statistical offices suppress or never produce most
multi-dimensional cross-tabs over small populations, so a conventional
dashboard would render mostly blank panels and imply *absence of people* where
the truth is *absence of a published figure*.

This application makes that distinction legible. **Every cell resolves to one of
four states** and they are visually and semantically distinct everywhere:

| State | Meaning | Mark |
|---|---|---|
| **Observed** | a real published figure | filled |
| **Structural zero** | the combination exists and the count is genuinely 0 | open ring |
| **Suppressed** | exists but withheld below a publication threshold | hatched |
| **Not published** | the source never cross-tabulated these dimensions | dotted |

## Two sources, one honest offset

- **SEM Ausländerstatistik** — the administrative migration register, published
  monthly. Latest here: **31 May 2026**. Answers *“who holds which permit now.”*
- **BFS STATPOP** — the annual population register (PxWeb API). Latest complete
  year: **31 Dec 2024**. Answers *“who was born where, as of year-end.”*

The two reference dates are ~17 months apart. Where they measure the same
concept they disagree slightly (in Zug, SEM counts 35 permanent Chilean nationals to BFS’s 33).
**The offset is preserved throughout and never reconciled to one number.**

## The central finding

For almost every nationality, the community is bigger than the passport count:
many of those born in a country have since taken Swiss or other citizenship
and vanish from its passport figures. Chile nationally: 3 303 passport holders
vs 8 308 Chilean-born. The same contrast holds for most countries at every
scale, and it is the app's hero view, not something buried behind a filter.

## Data model

Everything is a long-format **observation** (`lib/types.ts`):

```ts
Observation = {
  source: "SEM" | "BFS";
  dataset: string;              // SEM table id or BFS cube id
  metric: "stock" | "immigration" | "emigration" | "naturalisation";
  populationType: "permanent" | "non_permanent" | "total";
  dim: { year, month?, canton, sex?, permit?, legalBasis?, ageClass?,
         marital?, marriedToSwiss?, lengthOfStay?, reason?, nationality?,
         birthCountry?, nationalityGroup?, ... };
  value: number | null;
  state: CellState;             // the four states above
  concept: string;
  provenance: { url, referenceDate, retrievedAt, sheet?, rowLabel?, query? };
}
```

The application **pivots these** — it never synthesises, interpolates, imputes,
or estimates. A requested cross-tab that no source carries returns
`not_published`, and the UI names the table that would have carried it and
offers the single filter to drop to reach a populated view.

- `public/data/canton/<CODE>.json` — every observation with full provenance, one
  file per canton plus `CH.json` for Switzerland. Strings are interned; the
  decoder in `lib/payload.ts` returns ordinary `Observation` objects, so nothing
  downstream knows the wire format exists. ~2.1 MB each, ~70 kB gzipped.
- `public/data/summary.json` — the cross-canton comparison figures, which no
  single canton file can hold.
- `data/manifest.json` — source inventory, cell-state counts, the
  dimension-availability matrix, and the anchor-check results.
- `data/COVERAGE.md` — a written account of which cross-tabs exist, which are
  suppressed, and which were never published.
- `data/verification-report.md` / `data/verification-bfs.md` — the output of the
  independent re-fetch of each source (see *Verification* below).

## Capabilities

- **Cross-filter** across any dimension combination, with each result resolved
  to one of the four states and a one-click “drop this filter” escape when a
  combination was never published.
- **Dimension-availability map** — a matrix of which dimension pairs are
  actually cross-tabulated, so you can see the shape of the knowable before
  building a query that cannot be answered. Together with the four-state
  explanation, the reference-date offset and the source inventory it lives in a
  **collapsed appendix** at the foot of the page: it is what makes the rest
  trustworthy, but it is not what a reader came for.
- **Light and dark themes**, chosen from the OS by default, overridable, and
  applied before first paint so a dark-theme reader never sees a white flash.
- **Four languages** — English, Spanish, German, French — switchable in the
  header, remembered, and carried in the URL (`?lang=es`). Every sentence lives
  in a typed dictionary (`lib/dict.ts`), so a missing translation is a compile
  error. Number and date formats follow the language: 3,303 / 3.303 / 3'303 /
  3 303. Register citations (table ids, cube names) deliberately stay as-is —
  they are citations, not prose.
- **Comparison baselines** — the selected canton against the selected community in
  Switzerland, its own foreign population, and every other canton, with
  per-1,000 normalisation and an index-vs-national view. Clicking a canton row
  re-scopes the entire page.
- **Population portrait** — every attribute the register carries drawn at once,
  for either population (passport holders, or the larger born-there
  group), with a sex split. Where a split does not exist the section says so
  instead of rendering a blank: SEM's table 2-22 has no sex columns for marital
  status at all.
- **Movement** — arrivals by reason, departures by permit, and naturalisations,
  for the full published run, any single calendar year, or the rolling last
  twelve months. Departures and naturalisations split by sex; arrivals cannot,
  because SEM table 3-30 is eleven columns wide with no sex or age block
  anywhere in it.
- **Depth as far as each source goes.** SEM crosses each attribute with sex and
  nothing else — a fixed workbook layout, so that limit is real. BFS is a
  queryable cube and returns any combination, so the explorer answers three
  attributes at once there (Chile in Zug: 33 nationals, 18 on a B permit, 13
  of those women, 5 of those aged 45–49).
- **Time series 2010–2026**, yearly or monthly, with each scope’s own peak and
  trough annotated and the SEM and BFS series distinguishable (solid vs
  dashed). At monthly resolution the two stop reading as one wobbling line:
  SEM is a monthly administrative count running to May 2026, BFS an annual
  register snapshot ending December 2024.
- **Small-n honesty** encoded in the marks: straight segments (never smoothed),
  per-point cell-state markers, percentages always shown with their denominator,
  and every figure traceable to its source URL and query on hover/click.
- **URL-encoded filter state** (shareable views) and **CSV / JSON export** of the
  current view carrying provenance columns.

## Why a custom SVG chart layer (not a charting library)

The charts are a thin SVG layer over `d3-scale` (`components/charts/`). No
high-level charting library was used, on purpose:

1. **Four states per data point.** Recharts/Chart.js/Plotly represent a point as
   a value; here every point must also carry one of four cell states as a
   distinct mark (filled / open ring / hatched / dotted). A custom mark layer
   makes that a first-class property.
2. **No false precision.** Library defaults smooth lines and fill areas, implying
   resolution the data lacks. With series this short over populations this small,
   we draw straight segments between observed points only, and break the line at
   unpublished gaps rather than interpolating across them.
3. **Weight.** The whole chart layer is a few hundred lines and adds only
   `d3-scale` to the bundle; first load stays ~124 kB.

## Reproducing the harvest

```bash
npm install
npm run harvest        # re-runs Phase 1 end to end
```

`scripts/harvest.ts` enumerates every (source, table/cube, period,
dimension) tuple, fetches with a disk cache (`data/raw/`, keyed by URL+query
hash), rate-limits to ≤4 concurrent with exponential backoff, parses SEM XLSX
sheets and BFS json-stat2 responses, classifies each cell into one of the four
states, verifies against a fixed anchor list, and writes the per-canton payload
files plus `summary.json` and `manifest.json`. Re-runs are incremental — cached responses are not re-fetched —
so refreshing when SEM publishes a new month only downloads the new files.

It covers **27 scopes** (Switzerland and the 26 cantons) × **69 SEM reference
periods** (the December snapshot for 2017–2020, then every month from 2021-01 to
2026-05) plus three BFS cubes, producing **336 084 observations**.

Widening from one canton to all of them cost no extra SEM downloads: every
workbook already contained all 28 sheets and the harvest was reading one. BFS
widened by selection, since `Kanton` is a cube dimension. A full cold run takes about 35
minutes and fetches ~1 200 files; the output is one payload per canton,
~2.1 MB raw and ~70 kB gzipped each — only the canton in view is downloaded.

The BFS queries deliberately include two *full-cross* requests at the latest
complete year — permit × sex × age, and passport group × sex × age. Every other
cube query holds the dimensions it is not about at their total, which is
efficient but means the harvest alone cannot answer a multi-attribute question;
and because the app derives "not published" from what the harvest contains, that
shape would be reported as a property of BFS rather than of the query plan.

> **Note on the BFS PxWeb endpoint.** `pxweb.bfs.admin.ch` sits behind a WAF
> that rejects requests before they reach the query engine, in two ways that
> both look like server trouble but are neither. It answers any **User-Agent**
> it does not recognise with HTTP 400 and an HTML block page — so sending a
> polite identifying UA fails where curl's default UA succeeds — and it rejects
> **Node's built-in `fetch`** on its TLS/HTTP fingerprint regardless of headers,
> returning 400/503 where a byte-identical curl request gets 200. BFS queries
> therefore run through curl (`transport: "curl"` in `scripts/harvest/fetcher.ts`).
> Retrying a block page is counter-productive: a burst of them trips a short
> connection-level ban, which is what earlier versions of this README described
> as rate limiting. The fetcher detects a block page and fails fast instead.
> With that understood, the full BFS set answers back-to-back at ~12 s a query.
>
> If the query API is ever withdrawn, `scripts/harvest/px.ts` is a second route
> to the same figures: it downloads a whole cube over plain GET (95–275 MB) and
> decodes the PC-Axis format locally. Force it with `BFS_MODE=px npm run harvest`.
> SEM tables have no such restrictions and use ordinary Node `fetch`.

## Verification

Nothing here checks its own homework. The harvest self-tests against a fixed
anchor list, and then two *separate* scripts re-fetch the figures from the
published sources and compare — neither imports the harvest's fetcher, its
parsers, or its query definitions:

```bash
npm run verify         # both, sequentially
npm run verify:sem     # -> data/verification-report.md
npm run verify:bfs     # -> data/verification-bfs.md
```

`verify.ts` re-downloads the SEM workbooks from the recorded provenance URLs,
finds each country row itself (by the label recorded in provenance), and resolves each column from an independently
written map of the SEM header rows — covering ≥15% of eligible SEM cells
(deterministically sampled, every dataset and reference period represented) plus
every SEM anchor. `verify-bfs.ts` inverts the *harvested dimensions* back into
PxWeb codes, re-POSTs those queries, and decodes json-stat2 with its own
row-major decoder; it covers 100% of non-null BFS cells (they arrive in
rectangular blocks, so checking all of them costs the same handful of requests as
sampling would) plus every BFS anchor. It also re-fetches each cube's metadata to
confirm from the source's own labels that each code really means what the registry says (8407 = Chile, ZG = Zug,
Zug, and so on — the bare numeric codes are exactly where a silent mapping error
would hide. Both write a Markdown report and exit non-zero on any discrepancy.

Both also have a **dry-run mode that spends no network at all**, which is worth
running first — it is instant, and it catches the failure this pair of scripts is
most prone to:

```bash
VERIFY_PLAN=1 npm run verify:sem      # resolve every SEM cell to a sheet column
VERIFY_BFS_PLAN=1 npm run verify:bfs  # invert every BFS cell back to PxWeb codes
```

Because each verifier deliberately re-derives its own mapping rather than
importing the harvest's, it identifies cells by the harvest's *label strings* —
and when a label is reworded (`"Born in Switzerland"` becoming `"Born in
Switzerland (same nationality)"`), the verifier's rule quietly stops
matching. The plan modes resolve **every** eligible cell, not just the sampled
ones, and fail if any cell has no rule. Without that, a reworded label outside
the sample stays invisible until a much later run happens to draw one.

## Develop & build

```bash
npm run dev            # http://localhost:3000
npm run typecheck      # tsc --noEmit — zero errors required
npm run lint           # next lint — zero errors required
npm run test           # unit tests for the PC-Axis reader
npm run build          # production build (static)
```

Stack: **Next.js 15 App Router, React 19, TypeScript strict.** The harvested
data ships as static JSON; there is **no runtime database and no server-side
data fetching** — the client loads `/data/manifest.json`, `/data/summary.json` and one
`/data/canton/<code>.json` at a time from static assets.

## Deployment (Vercel)

The build produces a static-friendly app. To deploy (run by a human — this
repository is not deployed automatically):

```bash
# 1. Ensure the data is present and valid
npm run harvest
npm run build          # must pass with zero type and lint errors

# 2. Deploy with the Vercel CLI
npm i -g vercel
vercel                 # first run: link/create the project
vercel --prod          # promote to production
```

No environment variables are required — all data is baked into `public/data/`.
When SEM publishes a new month, re-run `npm run harvest`, commit the updated
`data/` and `public/data/`, and redeploy.

## Repository layout

```
scripts/harvest.ts          # Phase 1 entry point (npm run harvest)
scripts/harvest/            # fetcher (cache + rate limit), SEM + BFS modules, query config
scripts/verify.ts           # independent SEM re-fetch (imports no harvest code)
scripts/verify-bfs.ts       # independent BFS re-fetch (imports no harvest code)
lib/types.ts                # the Observation / CellState data model
lib/model.ts                # query engine: resolveCell, availability, series
lib/selectors.ts            # app-specific queries (headlines, splits, baselines)
lib/export.ts               # CSV / JSON export with provenance columns
components/                 # Header, Explorer, sections/, charts/, Provenance, StateBits
app/                        # App Router page, layout, globals.css (design tokens)
public/data/canton/         # harvested observations, one payload per canton
data/manifest.json          # source inventory + availability + anchors
data/COVERAGE.md            # written coverage account
```
