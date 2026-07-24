# Chileans in Canton Zug — a data explorer for a very small population

An honest exploration of official statistics on **Chilean nationals** and
**Chilean-born residents** in Canton Zug, Switzerland: about 35 passport holders
and 99 people born in Chile. The dataset is deliberately tiny, and that is the
whole design problem — Swiss statistical offices suppress or never produce most
multi-dimensional cross-tabs over a population this small, so a conventional
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
concept they disagree slightly (SEM: 35 permanent Chilean nationals; BFS: 33).
**The offset is preserved throughout and never reconciled to one number.**

## The central finding

Citizenship is not birthplace. **35** people hold a Chilean passport; **99** were
born in Chile — and of those 99, only ~34 hold a Latin-American passport, while
33 hold Swiss and 29 hold EU passports. This contrast is the app's hero view,
not something buried behind a filter.

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

- `data/harvest.json` — every observation with full provenance (also mirrored to
  `public/data/harvest.json`, which the client loads statically).
- `data/manifest.json` — source inventory, cell-state counts, the
  dimension-availability matrix, and the anchor-check results.
- `data/COVERAGE.md` — a written account of which cross-tabs exist, which are
  suppressed, and which were never published.

## Capabilities

- **Cross-filter** across any dimension combination, with each result resolved
  to one of the four states and a one-click “drop this filter” escape when a
  combination was never published.
- **Dimension-availability map** — a matrix of which dimension pairs are
  actually cross-tabulated, so you can see the shape of the knowable before
  building a query that cannot be answered.
- **Comparison baselines** — Zug against all Chileans in Switzerland, against
  Zug’s foreign population, and against the top cantons (VD 989, ZH 554, GE 503,
  BE 284, FR 222), with per-1,000 normalisation and an index-vs-national view.
- **Time series 2010–2024** with the 2017 peak (34) and 2020 trough (20) visible
  and the SEM and BFS series distinguishable (solid vs dashed).
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
   resolution the data lacks. With five- to fifteen-point series over ~35 people,
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
states, verifies against a fixed anchor list, and writes `harvest.json` +
`manifest.json`. Re-runs are incremental — cached responses are not re-fetched —
so refreshing when SEM publishes a new month only downloads the new files.

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
data fetching** — the client loads `/data/harvest.json` from static assets.

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
lib/types.ts                # the Observation / CellState data model
lib/model.ts                # query engine: resolveCell, availability, series
lib/selectors.ts            # app-specific queries (headlines, splits, baselines)
lib/export.ts               # CSV / JSON export with provenance columns
components/                 # Header, Explorer, sections/, charts/, Provenance, StateBits
app/                        # App Router page, layout, globals.css (design tokens)
data/harvest.json           # harvested observations (provenance-complete)
data/manifest.json          # source inventory + availability + anchors
data/COVERAGE.md            # written coverage account
```
