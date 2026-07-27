/**
 * Phase 1 harvest — end to end.
 *
 * Reproduces the full data harvest for Chilean nationals and Chilean-born
 * residents of Canton Zug from the two open-data sources:
 *   - SEM Ausländerstatistik monthly XLSX tables (stock 2-x, flow 3-x), sheet ZG, row Chile
 *   - BFS STATPOP cubes via the PxWeb json-stat2 API (cubes 101 / 399 / 423)
 *
 * Every raw response is cached under data/raw/ (see fetcher.ts) so re-runs and
 * resumed sessions do not re-fetch. Requests are rate-limited to <=4 concurrent
 * with exponential backoff on 429/5xx.
 *
 * Emits: public/data/canton/*.json + summary.json, data/manifest.json. COVERAGE.md is maintained
 * alongside (see docs). Run with:  npm run harvest
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { encodeCanton, PAYLOAD_VERSION } from "../lib/payload";
import {
  fetchArchiveIndex,
  resolveTableUrl,
  findChileRowsForSheets,
  SHEET_SCOPES,
  readCantonSheet,
  CANTON_SHEETS,
  STOCK_TABLES,
  FLOW_TABLES_12MT,
  FLOW_TABLES_J,
  type TableDef,
} from "./harvest/sem.js";
import { fetchRaw } from "./harvest/fetcher.js";
import { queryCube, walkJsonStat2, isCubeQueryCached, queryCubeViaPx, type JsonStat2 } from "./harvest/bfs.js";
import { ALL_CUBE_QUERIES, NATGROUP_399, POP_101, CUBE_101, CUBE_399 } from "./harvest/bfs-queries.js";
import { pxDownloadUrl } from "./harvest/px.js";
import type {
  AnchorCheck,
  AvailabilityEntry,
  CellState,
  Manifest,
  Observation,
  SourceRecord,
} from "../lib/types.js";

const OUT_DIR = join(process.cwd(), "data");
mkdirSync(OUT_DIR, { recursive: true });

const nowIso = () => new Date().toISOString();

// Months to harvest for SEM stock. The archive exposes only the December
// snapshot before 2021 and every month from 2021 on, so take everything it has:
// 69 reference periods, monthly wherever monthly exists.
const STOCK_MONTHS: [number, number][] = [
  ...[2017, 2018, 2019, 2020].map((y) => [y, 12] as [number, number]),
  ...Array.from({ length: 5 }, (_, i) => 2021 + i).flatMap((y) =>
    Array.from({ length: 12 }, (_, m) => [y, m + 1] as [number, number]),
  ),
  ...[1, 2, 3, 4, 5].map((m) => [2026, m] as [number, number]),
];
// Flow (annual calendar-year "-J-") harvested from December releases.
const FLOW_J_MONTHS: [number, number][] = Array.from(
  { length: 9 },
  (_, i) => [2017 + i, 12] as [number, number],
);
// Flow (rolling 12-month "-12Mt-") harvested from the latest release.
const FLOW_12MT_MONTHS: [number, number][] = [[2026, 5]];

const lastDay = (y: number, m: number) => {
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

const observations: Observation[] = [];
const idSeen = new Set<string>();

function pushObs(o: Omit<Observation, "id" | "unit">): void {
  const key = createHash("sha1")
    .update(
      [o.source, o.dataset, o.metric, o.populationType, JSON.stringify(o.dim), o.provenance.referenceDate, o.concept].join(
        "|",
      ),
    )
    .digest("hex")
    .slice(0, 16);
  if (idSeen.has(key)) return; // dedupe identical coordinates
  idSeen.add(key);
  observations.push({ ...o, id: key, unit: "persons" });
}

function classify(value: number | null, suppressible = false): { value: number | null; state: CellState } {
  if (value === null) return suppressible ? { value: null, state: "suppressed" } : { value: 0, state: "structural_zero" };
  if (value > 0) return { value, state: "observed" };
  return { value: 0, state: "structural_zero" };
}

// ---------------------------------------------------------------------------
// SEM harvest
// ---------------------------------------------------------------------------
interface SemRun {
  months: [number, number][];
  tables: TableDef[];
  variant?: "J" | "12Mt";
}

async function runSem(run: SemRun, urlsAccum: Set<string>): Promise<void> {
  for (const [year, month] of run.months) {
    const index = await fetchArchiveIndex(year, month);
    if (!index.ok) {
      console.warn(`SEM archive ${year}-${month} unavailable (404) — skipping`);
      continue;
    }
    const referenceDate = lastDay(year, month);
    for (const def of run.tables) {
      const variant = run.variant ?? def.variant;
      const url = resolveTableUrl(index, def.table, variant);
      if (!url) {
        console.warn(`  SEM ${def.table}${variant ? "-" + variant : ""} not in ${year}-${month} index`);
        continue;
      }
      urlsAccum.add(url);
      const res = (await fetchRaw(url, { ext: "xlsx" })) as { buffer: Buffer; notFound?: boolean; retrievedAt: string };
      if (res.notFound || res.buffer.length === 0) continue;
      const isFlow = def.metric !== "stock";
      // One parse of the workbook, every canton sheet read from it.
      const perSheet = findChileRowsForSheets(res.buffer, SHEET_SCOPES.map(([s]) => s));
      for (const [sheetName, canton] of SHEET_SCOPES) {
        const found = perSheet.get(sheetName) ?? null;
        // Flow tables list only nations with movement. When Chile is absent it means
        // zero movement — a genuine structural zero. We run the SAME extractor over a
        // zero-filled row so the absent case produces cells with IDENTICAL coordinates
        // (nationality "CL", the table's own populationType and concept) to the present
        // case; every value is 0 and classifies to structural_zero. This keeps a
        // zero-flow reachable by exactly the coordinates used when Chile is present.
        //
        // In a stock table a missing Chile row means the canton has no Chilean
        // residents at all — which is equally a real zero, and far more common now
        // that all 26 cantons are read rather than Zug alone.
        const row = found ? found.row : ["Chile", ...(Array(48).fill(0) as number[])];
        const cells = def.extract(row);
        for (const cell of cells) {
          const { value, state } = classify(cell.value, false);
          pushObs({
            source: "SEM",
            dataset: def.table,
            metric: cell.metric,
            populationType: cell.pop,
            dim: { canton, year, month, nationality: "CL", ...cell.dim },
            value,
            state,
            concept: cell.concept,
            provenance: {
              url,
              referenceDate,
              retrievedAt: res.retrievedAt,
              sheet: sheetName,
              rowLabel: found
                ? "Chile"
                : isFlow
                  ? "Chile (absent from flow table = 0)"
                  : "Chile (absent from canton sheet = 0)",
              rowIndex: found ? found.index : undefined,
            },
          });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// SEM cantonal baselines (all 26 cantons + Switzerland, from the 2-10 workbook)
// ---------------------------------------------------------------------------
async function runSemCantonal(year: number, month: number, urlsAccum: Set<string>): Promise<void> {
  const index = await fetchArchiveIndex(year, month);
  if (!index.ok) return;
  const url = resolveTableUrl(index, "2-10");
  if (!url) return;
  urlsAccum.add(url);
  const res = (await fetchRaw(url, { ext: "xlsx" })) as { buffer: Buffer; retrievedAt: string; notFound?: boolean };
  if (res.notFound || res.buffer.length === 0) return;
  const referenceDate = lastDay(year, month);
  const SEX = ["total", "female", "male"] as const;
  const sheets: [string, string][] = [["CH-Nati", "CH"], ...CANTON_SHEETS.map((c) => [c, c] as [string, string])];
  for (const [sheet, canton] of sheets) {
    const read = readCantonSheet(res.buffer, sheet);
    if (!read) continue;
    {
      // A canton sheet that does not list Chile has no Chilean residents — a
      // real zero, not a missing figure. Skipping it here left the smallest
      // cantons reading "never published" in the comparison while the main
      // extraction path, which does emit the zero, disagreed with it.
      const chile = read.chile ?? ([0, 0, 0] as [number, number, number]);
      SEX.forEach((sex, i) => {
        const { value, state } = classify(chile[i], false);
        pushObs({
          source: "SEM",
          dataset: "2-10",
          metric: "stock",
          populationType: "permanent",
          dim: { canton, year, month, nationality: "CL", sex },
          value,
          state,
          concept: "Chilean nationals (cantonal comparison)",
          provenance: {
            url,
            referenceDate,
            retrievedAt: res.retrievedAt,
            sheet,
            rowLabel: read.chile ? "Chile" : "Chile (absent from canton sheet = 0)",
          },
        });
      });
    }
    if (read.foreignTotal !== null) {
      pushObs({
        source: "SEM",
        dataset: "2-10",
        metric: "stock",
        populationType: "permanent",
        dim: { canton, year, month, sex: "total", nationality: "all_foreign" },
        value: read.foreignTotal,
        state: "observed",
        concept: "Foreign residents (per-capita denominator)",
        provenance: { url, referenceDate, retrievedAt: res.retrievedAt, sheet, rowLabel: "Gesamttotal" },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// BFS harvest
// ---------------------------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * BFS access route.
 *   api  - PxWeb json-stat2 query endpoint (POST) only
 *   px   - full PC-Axis cube download (GET) only
 *   auto - try the API, and fall back to the bulk download once it refuses
 *
 * The query endpoint is the documented interface and stays the default first
 * choice. But it is POST-only and rate-limits some egress addresses for hours at
 * a time, whereas the same server serves every cube in full over plain GET. Both
 * routes return the same published figures; the route actually used is recorded
 * in each observation's provenance.
 */
type BfsMode = "auto" | "api" | "px";
const BFS_MODE = (process.env.BFS_MODE ?? "auto") as BfsMode;

const API_URL = (cube: string) => `https://www.pxweb.bfs.admin.ch/api/v1/de/${cube}/${cube}.px`;
const API_ACCESS = "PxWeb json-stat2 query API (POST)";
/** The seed responses came from the same API, captured during reconnaissance and committed. */
const SEED_ACCESS = `${API_ACCESS}, response committed under data/bfs-seed/`;
const PX_ACCESS = "Full PC-Axis cube download (GET), decoded locally";

async function runBfs(urlsAccum: Set<string>): Promise<string[]> {
  const blocked: string[] = [];
  let first = true;
  // Once the query endpoint has refused, every further POST costs a spacing delay
  // to fail the same way. Switch the rest of the run to the bulk download.
  let apiRefused = BFS_MODE === "px";
  for (const spec of ALL_CUBE_QUERIES) {
    urlsAccum.add(apiRefused ? pxDownloadUrl(spec.cube) : API_URL(spec.cube));

    let js: JsonStat2 | undefined;
    if (!apiRefused) {
      // Space POSTs out: pxweb allows roughly one POST per minute per IP and
      // tarpits bursts. Cached queries return instantly (the fetcher reads the disk
      // cache before any network call), so this delay only applies to live fetches.
      const cached = isCubeQueryCached(spec.cube, spec.query);
      const spacingMs = Number(process.env.BFS_SPACING_MS ?? 50_000);
      if (!first && !cached) await sleep(spacingMs);
      first = false;
      try {
        js = await queryCube(spec.cube, spec.query);
      } catch (err) {
        console.warn(`BFS query ${spec.id} via API failed: ${String(err)}`);
        if (BFS_MODE === "api") {
          blocked.push(spec.id);
          continue;
        }
        apiRefused = true;
        console.warn("  -> query API is refusing; using the full-cube download for the rest of this run");
      }
    }

    if (js) {
      const retrievedAt = nowIso();
      walkJsonStat2(js, (coord, value, status) => {
        const suppressed = status === "." || status === ".." || status === "...";
        const c = classify(value, suppressed || value === null);
        pushBfsCell(spec, coord, c, API_URL(spec.cube), API_ACCESS, retrievedAt);
      });
      continue;
    }

    try {
      const { cells, url, retrievedAt } = await queryCubeViaPx(spec.cube, spec.query);
      for (const cell of cells) {
        // A dot-run token is the PC-Axis missing/confidential marker, the same
        // signal the API carries in its separate `status` map.
        const suppressed = /^\.+$/.test(cell.raw.replace(/"/g, "").trim());
        const c = classify(cell.value, suppressed || cell.value === null);
        pushBfsCell(spec, cell.coord, c, url, PX_ACCESS, retrievedAt);
      }
      console.log(`  ${spec.id}: ${cells.length} cells from the cube download`);
    } catch (err) {
      console.warn(`BFS query ${spec.id} blocked/failed on both routes: ${String(err)}`);
      blocked.push(spec.id);
    }
  }
  return blocked;
}

/** Shared cell -> observation mapping, so both access routes emit identical coordinates. */
function pushBfsCell(
  spec: (typeof ALL_CUBE_QUERIES)[number],
  coord: Record<string, string>,
  c: { value: number | null; state: CellState },
  url: string,
  access: string,
  retrievedAt: string,
): void {
  const { metric, populationType, ...dim } = spec.map(coord);
  pushObs({
    source: "BFS",
    dataset: spec.cube,
    metric: (metric as Observation["metric"]) ?? spec.metric,
    populationType: (populationType as Observation["populationType"]) ?? "permanent",
    dim: dim as Observation["dim"],
    value: c.value,
    state: c.state,
    concept: spec.concept,
    provenance: {
      url,
      access,
      referenceDate: spec.referenceDateFor(coord),
      retrievedAt,
      query: spec.query,
    },
  });
}

// ---------------------------------------------------------------------------
// BFS seed — two genuinely-fetched responses captured during reconnaissance,
// committed under data/bfs-seed/. They guarantee the two headline BFS views (the
// 2010-2024 trend and the citizenship-vs-birthplace split) are present and
// reproducible even when the pxweb POST endpoint is rate-limiting. These are real
// fetched values with real provenance — not synthesised. When pxweb is reachable,
// runBfs() adds the deeper breakdowns; identical coordinates dedupe.
// ---------------------------------------------------------------------------
const SEED_DIR = join(process.cwd(), "data", "bfs-seed");
const SEED_URL = (cube: string) => `https://www.pxweb.bfs.admin.ch/api/v1/de/${cube}/${cube}.px`;

function loadSeed(file: string): JsonStat2 | null {
  const p = join(SEED_DIR, file);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as JsonStat2;
  } catch {
    return null;
  }
}

function runBfsSeed(): number {
  let n = 0;
  const retrievedAt = "2026-07-24T16:05:00.000Z"; // reconnaissance capture time

  const js101 = loadSeed("cube101-zg-chile-permanent-yearseries.json");
  if (js101) {
    walkJsonStat2(js101, (coord, value, status) => {
      const year = Number(coord["Jahr"]);
      const c = classify(value, status === "." || value === null);
      pushObs({
        source: "BFS",
        dataset: CUBE_101,
        metric: "stock",
        populationType: "permanent",
        dim: { canton: "ZG", year, nationality: "CL", sex: "total" },
        value: c.value,
        state: c.state,
        concept: "Chilean nationals in Zug by year (permanent)",
        provenance: { url: SEED_URL(CUBE_101), referenceDate: `${year}-12-31`, retrievedAt, access: SEED_ACCESS, query: "seed: ZG x Chile x permanent, all years" },
      });
      n++;
    });
  }

  const js399 = loadSeed("cube399-zg-bornchile-2024-passportsplit.json");
  if (js399) {
    walkJsonStat2(js399, (coord, value, status) => {
      const g = coord["Staatsangehörigkeit (Auswahl)"];
      const c = classify(value, status === "." || value === null);
      pushObs({
        source: "BFS",
        dataset: CUBE_399,
        metric: "stock",
        populationType: POP_101[coord["Bevölkerungstyp"]] ?? "permanent",
        dim: { canton: "ZG", year: 2024, birthCountry: "CL", nationalityGroup: NATGROUP_399[g] ?? g, sex: "total" },
        value: c.value,
        state: c.state,
        concept: "Chilean-born residents of Zug by passport group",
        provenance: { url: SEED_URL(CUBE_399), referenceDate: "2024-12-31", retrievedAt, access: SEED_ACCESS, query: "seed: ZG x born-Chile x 2024 x passport group" },
      });
      n++;
    });
  }
  return n;
}

// ---------------------------------------------------------------------------
// Anchor checks (self-report; independent re-fetch is a separate verifier)
// ---------------------------------------------------------------------------
function anchorChecks(): AnchorCheck[] {
  const find = (pred: (o: Observation) => boolean): number | null => {
    const o = observations.find(pred);
    return o ? o.value : null;
  };
  // Every anchor below names its canton. Before the harvest covered all 26 of
  // them these predicates matched only Zug by construction; now an unconstrained
  // predicate silently matches whichever canton sorts first, which is how a Zug
  // anchor of 3 came back as the Swiss total of 163.
  const semLatestIn = (canton: string, m: (o: Observation) => boolean) =>
    find((o) => o.source === "SEM" && o.dim.canton === canton && o.dim.year === 2026 && o.dim.month === 5 && m(o));
  const semLatest = (m: (o: Observation) => boolean) => semLatestIn("ZG", m);
  const findIn = (canton: string, pred: (o: Observation) => boolean) =>
    find((o) => o.dim.canton === canton && pred(o));
  const checks: [string, number, number | null, string][] = [
    ["Zug 2026-05 permanent total", 35, semLatest((o) => o.dataset === "2-10" && o.populationType === "permanent" && o.concept === "Permanent residents" && o.dim.sex === "total"), "SEM 2-10"],
    ["Zug 2026-05 permanent female", 20, semLatest((o) => o.dataset === "2-10" && o.concept === "Permanent residents" && o.dim.sex === "female"), "SEM 2-10"],
    ["Zug 2026-05 permit B", 22, semLatest((o) => o.dataset === "2-10" && o.dim.permit === "B" && o.dim.sex === "total"), "SEM 2-10"],
    ["Zug 2026-05 permit C", 11, semLatest((o) => o.dataset === "2-10" && o.dim.permit === "C" && o.dim.sex === "total"), "SEM 2-10"],
    ["Zug 2026-05 permit L", 2, semLatest((o) => o.dataset === "2-10" && o.dim.permit === "L" && o.dim.sex === "total"), "SEM 2-10"],
    ["Zug 2026-05 FZA", 17, semLatest((o) => o.dataset === "2-20" && o.dim.legalBasis === "FZA" && o.dim.sex === "total"), "SEM 2-20"],
    ["Zug 2026-05 AIG", 18, semLatest((o) => o.dataset === "2-20" && o.dim.legalBasis === "AIG" && o.dim.sex === "total"), "SEM 2-20"],
    ["Zug 2026-05 married", 23, semLatest((o) => o.dataset === "2-22" && o.dim.marital === "married" && !o.dim.marriedToSwiss), "SEM 2-22"],
    ["Zug 2026-05 married to Swiss", 6, semLatest((o) => o.dataset === "2-22" && o.dim.marital === "married" && o.dim.marriedToSwiss === true), "SEM 2-22"],
    ["Zug 2026-05 single", 10, semLatest((o) => o.dataset === "2-22" && o.dim.marital === "single"), "SEM 2-22"],
    ["Zug 2026-05 age 18-64", 27, semLatest((o) => o.dataset === "2-21" && o.dim.ageClass === "18-64" && o.dim.sex === "total"), "SEM 2-21"],
    ["Zug 2026-05 age 65+", 0, semLatest((o) => o.dataset === "2-21" && o.dim.ageClass === "65+" && o.dim.sex === "total"), "SEM 2-21"],
    ["Zug 2026-05 stay 0-4y", 17, semLatest((o) => o.dataset === "2-23" && o.dim.lengthOfStay === "0-4" && o.dim.sex === "total"), "SEM 2-23"],
    ["Zug 2026-05 stay 20+y", 0, semLatest((o) => o.dataset === "2-23" && o.dim.lengthOfStay === "20+" && o.dim.sex === "total"), "SEM 2-23"],
    ["Zug 12mo permanent immigration total", 3, findIn("ZG", (o) => o.dataset === "3-30" && o.metric === "immigration" && o.populationType === "permanent" && o.concept === "Total immigration" && o.dim.year === 2026 && o.dim.month === 5), "SEM 3-30 12Mt"],
    ["Zug 12mo non-permanent immigration total", 2, findIn("ZG", (o) => o.dataset === "3-31" && o.metric === "immigration" && o.populationType === "non_permanent" && o.concept === "Total immigration" && o.dim.year === 2026 && o.dim.month === 5), "SEM 3-31 12Mt"],
    ["Zug 12mo permanent emigration", 1, findIn("ZG", (o) => o.dataset === "3-55" && o.metric === "emigration" && o.populationType === "permanent" && o.concept === "Permanent emigration" && o.dim.sex === "total" && o.dim.year === 2026), "SEM 3-55 12Mt"],
    ["Zug 12mo non-permanent emigration", 3, findIn("ZG", (o) => o.dataset === "3-55" && o.metric === "emigration" && o.populationType === "non_permanent" && o.concept === "Non-permanent emigration" && o.dim.sex === "total" && o.dim.year === 2026), "SEM 3-55 12Mt"],
    ["Zug 12mo naturalisations", 0, findIn("ZG", (o) => o.dataset === "3-60" && o.metric === "naturalisation" && o.dim.year === 2026), "SEM 3-60 12Mt"],
    ["Zug BFS 2024 Chilean nationals (perm)", 33, find((o) => o.dataset === "px-x-0103010000_101" && o.dim.canton === "ZG" && o.dim.nationality === "CL" && o.dim.year === 2024 && o.populationType === "permanent" && !o.dim.permit && o.dim.sex === "total" && !o.dim.ageClass), "BFS 101"],
    ["Zug BFS 2017 Chilean nationals (perm)", 34, find((o) => o.dataset === "px-x-0103010000_101" && o.dim.canton === "ZG" && o.dim.nationality === "CL" && o.dim.year === 2017 && o.populationType === "permanent" && !o.dim.permit && o.dim.sex === "total" && !o.dim.ageClass), "BFS 101"],
    ["Zug BFS 2020 Chilean nationals (perm)", 20, find((o) => o.dataset === "px-x-0103010000_101" && o.dim.canton === "ZG" && o.dim.nationality === "CL" && o.dim.year === 2020 && o.populationType === "permanent" && !o.dim.permit && o.dim.sex === "total" && !o.dim.ageClass), "BFS 101"],
    ["Zug BFS 2024 Chilean-born (perm)", 99, findIn("ZG", (o) => o.dataset === "px-x-0103010000_399" && o.dim.year === 2024 && o.dim.nationalityGroup === "total" && o.populationType === "permanent" && o.dim.sex === "total" && !o.dim.ageClass), "BFS 399"],
    ["Zug BFS 2024 Chilean-born Swiss passport", 33, findIn("ZG", (o) => o.dataset === "px-x-0103010000_399" && o.dim.year === 2024 && o.dim.nationalityGroup === "Swiss" && o.populationType === "permanent" && o.dim.sex === "total" && !o.dim.ageClass), "BFS 399"],
    ["Zug BFS 2024 Chilean-born LatAm passport", 34, findIn("ZG", (o) => o.dataset === "px-x-0103010000_399" && o.dim.year === 2024 && o.dim.nationalityGroup === "Latin America & Caribbean" && o.populationType === "permanent" && o.dim.sex === "total" && !o.dim.ageClass), "BFS 399"],
    ["Zug BFS 2024 Chilean-born EU passport", 29, findIn("ZG", (o) => o.dataset === "px-x-0103010000_399" && o.dim.year === 2024 && o.dim.nationalityGroup === "EU" && o.populationType === "permanent" && o.dim.sex === "total" && !o.dim.ageClass), "BFS 399"],
    ["Zug BFS 2023 Chilean nationals born in Chile", 27, findIn("ZG", (o) => o.dataset === "px-x-0103010000_423" && o.dim.nationality === "CL" && o.dim.birthCountry === "CL" && o.populationType === "permanent" && o.dim.sex === "total" && !o.dim.marital), "BFS 423"],
    ["SEM cantonal Chile VD", 989, find((o) => o.dataset === "2-10" && o.dim.canton === "VD" && o.dim.nationality === "CL" && o.dim.sex === "total" && o.concept === "Chilean nationals (cantonal comparison)"), "SEM 2-10 VD"],
    ["SEM cantonal Chile ZH", 554, find((o) => o.dataset === "2-10" && o.dim.canton === "ZH" && o.dim.nationality === "CL" && o.dim.sex === "total" && o.concept === "Chilean nationals (cantonal comparison)"), "SEM 2-10 ZH"],
    // Switzerland, the new default view. The first of these is the load-bearing
    // one: it reads the CH-Nati sheet through the new multi-sheet path and must
    // agree with the cantonal-baseline reader below, which reaches the same sheet
    // by an entirely different route. If the two disagree the sheet mapping is
    // wrong somewhere.
    ["Switzerland 2026-05 permanent total", 3303, semLatestIn("CH", (o) => o.dataset === "2-10" && o.populationType === "permanent" && o.concept === "Permanent residents" && o.dim.sex === "total"), "SEM 2-10 CH-Nati"],
    ["Switzerland BFS 2024 Chilean nationals (perm)", 3394, findIn("CH", (o) => o.dataset === "px-x-0103010000_101" && o.dim.nationality === "CL" && o.dim.year === 2024 && o.populationType === "permanent" && !o.dim.permit && o.dim.sex === "total" && !o.dim.ageClass), "BFS 101 CH"],
    ["Vaud 2026-05 permanent total", 989, semLatestIn("VD", (o) => o.dataset === "2-10" && o.populationType === "permanent" && o.concept === "Permanent residents" && o.dim.sex === "total"), "SEM 2-10 VD"],
    ["SEM Chile Switzerland total", 3303, find((o) => o.dataset === "2-10" && o.dim.canton === "CH" && o.dim.nationality === "CL" && o.dim.sex === "total" && o.concept === "Chilean nationals (cantonal comparison)"), "SEM 2-10 CH-Nati"],
  ];
  return checks.map(([label, expected, observed, source]) => ({
    label,
    expected,
    observed,
    pass: observed === expected,
    source,
  }));
}

// ---------------------------------------------------------------------------
// Availability matrix (which dimension pairs are actually cross-tabulated)
// ---------------------------------------------------------------------------
function buildAvailability(): AvailabilityEntry[] {
  const entries: AvailabilityEntry[] = [
    { datasets: ["SEM 2-10"], dimensions: ["permit", "sex"], note: "L/B/C x sex, permanent; + non-permanent" },
    { datasets: ["SEM 2-20"], dimensions: ["legalBasis", "sex"], note: "FZA vs AIG x sex, permanent" },
    { datasets: ["SEM 2-21"], dimensions: ["ageClass", "sex"], note: "5 SEM age bands x sex, permanent" },
    { datasets: ["SEM 2-22"], dimensions: ["marital", "marriedToSwiss"], note: "marital + married-to-Swiss subset, permanent" },
    { datasets: ["SEM 2-23"], dimensions: ["lengthOfStay", "sex"], note: "5 stay bands x sex, permanent" },
    { datasets: ["SEM 2-40", "SEM 2-41"], dimensions: ["permit", "ageClass"], note: "non-permanent categories and age" },
    { datasets: ["SEM 3-30", "SEM 3-31"], dimensions: ["reason", "populationType"], note: "immigration by reason" },
    { datasets: ["SEM 3-55"], dimensions: ["permit", "populationType"], note: "emigration by permit" },
    { datasets: ["SEM 3-60"], dimensions: ["naturalisationType", "sex"], note: "naturalisation types" },
    { datasets: ["BFS 101"], dimensions: ["year", "permit"], note: "Chilean nationals, 2010-2024" },
    { datasets: ["BFS 101"], dimensions: ["year", "ageClass"], note: "5-year age classes" },
    { datasets: ["BFS 101"], dimensions: ["year", "sex"] },
    { datasets: ["BFS 101"], dimensions: ["canton", "nationality"], note: "cantonal comparison baseline" },
    { datasets: ["BFS 399"], dimensions: ["birthCountry", "nationalityGroup"], note: "Chilean-born by passport, 2020-2024" },
    { datasets: ["BFS 399"], dimensions: ["birthCountry", "ageClass"] },
    { datasets: ["BFS 423"], dimensions: ["marital", "sex"], note: "Chilean nationals, 2023 only" },
    { datasets: ["BFS 423"], dimensions: ["nationality", "birthCountry"], note: "2023 only" },
  ];
  return entries;
}

function buildSources(semUrls: Set<string>): SourceRecord[] {
  const bySrc = (src: string, ds: string) =>
    observations.filter((o) => o.source === src && o.dataset === ds);
  const semTables = new Set(observations.filter((o) => o.source === "SEM").map((o) => o.dataset));
  const records: SourceRecord[] = [];
  for (const t of [...semTables].sort()) {
    records.push({
      id: `SEM ${t}`,
      source: "SEM",
      title: `SEM Ausländerstatistik table ${t} (all 26 canton sheets + CH-Nati, row Chile)`,
      checkedFor: "Chile x Zug figures, monthly/annual",
      yielded: `${bySrc("SEM", t).length} cells`,
      observationCount: bySrc("SEM", t).length,
      urls: [...semUrls].filter((u) => u.toLowerCase().includes(`/${t.toLowerCase()}-`)).slice(0, 5),
    });
  }
  for (const cube of ["px-x-0103010000_101", "px-x-0103010000_399", "px-x-0103010000_423"]) {
    const cells = bySrc("BFS", cube);
    // Two routes reach the same cube. The json-stat2 query API is the documented
    // one; the PC-Axis bulk download is the fallback used when the API refuses.
    // Both are listed because either may have produced a given cell, and each
    // cell's own provenance.access records which one did.
    const viaPx = cells.filter((o) => o.provenance.access?.startsWith("Full PC-Axis")).length;
    records.push({
      id: `BFS ${cube}`,
      source: "BFS",
      title: `BFS STATPOP cube ${cube}`,
      checkedFor: "Chile x Zug slices (nationality / birth country / marital)",
      yielded:
        viaPx > 0
          ? `${cells.length} cells (${viaPx} decoded from the full cube download)`
          : `${cells.length} cells`,
      observationCount: cells.length,
      urls: [`https://www.pxweb.bfs.admin.ch/api/v1/de/${cube}/${cube}.px`, pxDownloadUrl(cube)],
    });
  }
  return records;
}

async function main(): Promise<void> {
  const started = Date.now();
  const semUrls = new Set<string>();
  console.log("Harvesting SEM stock tables …");
  await runSem({ months: STOCK_MONTHS, tables: STOCK_TABLES }, semUrls);
  console.log("Harvesting SEM annual flows (December releases) …");
  await runSem({ months: FLOW_J_MONTHS, tables: FLOW_TABLES_J, variant: "J" }, semUrls);
  console.log("Harvesting SEM rolling 12-month flows (latest release) …");
  await runSem({ months: FLOW_12MT_MONTHS, tables: FLOW_TABLES_12MT, variant: "12Mt" }, semUrls);
  console.log("Harvesting SEM cantonal baselines …");
  await runSemCantonal(2026, 5, semUrls);
  console.log("Loading BFS seed (committed reconnaissance responses) …");
  const seeded = runBfsSeed();
  console.log(`  seeded ${seeded} BFS cells from data/bfs-seed/`);
  semUrls.add(SEED_URL(CUBE_101));
  semUrls.add(SEED_URL(CUBE_399));
  let blocked: string[] = [];
  if (process.env.HARVEST_SKIP_BFS === "1") {
    console.log("Skipping live BFS phase (HARVEST_SKIP_BFS=1)");
  } else {
    console.log("Harvesting BFS STATPOP cubes …");
    blocked = await runBfs(semUrls);
    if (blocked.length) console.warn(`BFS queries still blocked after retries: ${blocked.join(", ")}`);
  }

  const cellStateCounts = observations.reduce(
    (acc, o) => {
      acc[o.state] = (acc[o.state] ?? 0) + 1;
      return acc;
    },
    { observed: 0, structural_zero: 0, suppressed: 0, not_published: 0 } as Record<CellState, number>,
  );

  const anchors = anchorChecks();
  const manifest: Manifest = {
    generatedAt: nowIso(),
    observationCount: observations.length,
    cellStateCounts,
    sources: buildSources(semUrls),
    availability: buildAvailability(),
    anchors,
    referenceDates: { sem: "2026-05-31", bfsStatpop: "2024-12-31" },
  };

  observations.sort((a, b) =>
    a.dataset === b.dataset
      ? (a.dim.year ?? 0) - (b.dim.year ?? 0)
      : a.dataset < b.dataset
        ? -1
        : 1,
  );
  // ---- Partitioned output --------------------------------------------------
  // One file per canton, plus Switzerland. The reader looks at one canton at a
  // time, so shipping all twenty-seven in a single document would mean
  // downloading thirty times what any view needs. Still static JSON: no runtime
  // database and no server-side fetching, just more than one file.
  const publicDir = join(process.cwd(), "public", "data");
  const cantonDir = join(publicDir, "canton");
  mkdirSync(cantonDir, { recursive: true });

  const byCanton = new Map<string, Observation[]>();
  for (const o of observations) {
    const c = (o.dim.canton as string) ?? "CH";
    const list = byCanton.get(c);
    if (list) list.push(o);
    else byCanton.set(c, [o]);
  }

  const cantonIndex: { code: string; observations: number; bytes: number }[] = [];
  for (const [code, list] of [...byCanton.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    // The app drops the canton constraint from its queries entirely and relies on
    // the file being the scope. That is only safe if it is true, so assert it here
    // rather than discovering a stray row as a wrong number on the page.
    const stray = list.find((o) => o.dim.canton !== code);
    if (stray) {
      throw new Error(
        `canton file ${code} would contain a ${String(stray.dim.canton)} observation ` +
          `(${stray.dataset} / ${stray.concept}) — the per-canton files must be pure`,
      );
    }
    const json = JSON.stringify(encodeCanton(code, list));
    writeFileSync(join(cantonDir, `${code}.json`), json);
    cantonIndex.push({ code, observations: list.length, bytes: json.length });
  }

  // Cross-canton comparison figures live in every canton's own file, which is
  // useless to a view that ranks all of them at once. They are small, so they
  // also go out as one summary the comparison section can read on its own.
  const COMPARISON_CONCEPTS = new Set([
    "Chilean nationals (cantonal comparison)",
    "Foreign residents (per-capita denominator)",
    "Chilean nationals by canton, 2024 (baseline)",
    "Total resident population by canton, 2024 (denominator)",
  ]);
  const summaryObs = observations.filter((o) => COMPARISON_CONCEPTS.has(o.concept));
  writeFileSync(join(publicDir, "summary.json"), JSON.stringify(encodeCanton("ALL", summaryObs)));
  console.log(`  wrote summary.json (${summaryObs.length} cross-canton cells)`);

  const manifestWithIndex = {
    ...manifest,
    cantons: cantonIndex,
    payloadVersion: PAYLOAD_VERSION,
  };
  writeFileSync(join(OUT_DIR, "manifest.json"), JSON.stringify(manifestWithIndex, null, 2));
  writeFileSync(join(publicDir, "manifest.json"), JSON.stringify(manifestWithIndex));

  console.log(
    `  wrote ${cantonIndex.length} canton files, ` +
      `${(cantonIndex.reduce((n, c) => n + c.bytes, 0) / 1048576).toFixed(1)} MB total`,
  );

  const passed = anchors.filter((a) => a.pass).length;
  console.log(`\nHarvest complete in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`  observations: ${observations.length}`);
  console.log(`  cell states:`, cellStateCounts);
  console.log(`  anchors: ${passed}/${anchors.length} pass`);
  for (const a of anchors.filter((a) => !a.pass)) {
    console.log(`    FAIL ${a.label}: expected ${a.expected}, got ${a.observed}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
