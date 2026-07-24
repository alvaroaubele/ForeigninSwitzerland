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
 * Emits: data/harvest.json, data/manifest.json. COVERAGE.md is maintained
 * alongside (see docs). Run with:  npm run harvest
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  fetchArchiveIndex,
  resolveTableUrl,
  findChileRow,
  readCantonSheet,
  CANTON_SHEETS,
  STOCK_TABLES,
  FLOW_TABLES_12MT,
  FLOW_TABLES_J,
  type TableDef,
} from "./harvest/sem.js";
import { fetchRaw } from "./harvest/fetcher.js";
import { queryCube, walkJsonStat2, isCubeQueryCached } from "./harvest/bfs.js";
import { ALL_CUBE_QUERIES } from "./harvest/bfs-queries.js";
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

// Months to harvest for SEM stock: December snapshots 2017-2025 (annual series)
// plus every 2026 month to date (monthly recency; latest published = 2026-05).
const STOCK_MONTHS: [number, number][] = [
  ...Array.from({ length: 9 }, (_, i) => [2017 + i, 12] as [number, number]),
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
      const found = findChileRow(res.buffer);
      // Flow tables list only nations with movement. When Chile is absent it means
      // zero movement — a genuine structural zero. We run the SAME extractor over a
      // zero-filled row so the absent case produces cells with IDENTICAL coordinates
      // (nationality "CL", the table's own populationType and concept) to the present
      // case; every value is 0 and classifies to structural_zero. This keeps a
      // zero-flow reachable by exactly the coordinates used when Chile is present.
      if (!found && !isFlow) continue; // stock tables always list Chile
      const row = found ? found.row : ["Chile", ...(Array(48).fill(0) as number[])];
      const cells = def.extract(row);
      for (const cell of cells) {
        const { value, state } = classify(cell.value, false);
        pushObs({
          source: "SEM",
          dataset: def.table,
          metric: cell.metric,
          populationType: cell.pop,
          dim: { canton: "ZG", year, month, nationality: "CL", ...cell.dim },
          value,
          state,
          concept: cell.concept,
          provenance: {
            url,
            referenceDate,
            retrievedAt: res.retrievedAt,
            sheet: "ZG",
            rowLabel: found ? "Chile" : "Chile (absent from flow table = 0)",
            rowIndex: found ? found.index : undefined,
          },
        });
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
    if (read.chile) {
      SEX.forEach((sex, i) => {
        const { value, state } = classify(read.chile![i], false);
        pushObs({
          source: "SEM",
          dataset: "2-10",
          metric: "stock",
          populationType: "permanent",
          dim: { canton, year, month, nationality: "CL", sex },
          value,
          state,
          concept: "Chilean nationals (cantonal comparison)",
          provenance: { url, referenceDate, retrievedAt: res.retrievedAt, sheet, rowLabel: "Chile" },
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

async function runBfs(urlsAccum: Set<string>): Promise<string[]> {
  const blocked: string[] = [];
  let first = true;
  for (const spec of ALL_CUBE_QUERIES) {
    urlsAccum.add(`https://www.pxweb.bfs.admin.ch/api/v1/de/${spec.cube}/${spec.cube}.px`);
    // Space POSTs out: pxweb allows roughly one POST per minute per IP and
    // tarpits bursts. Cached queries return instantly (the fetcher reads the disk
    // cache before any network call), so this delay only applies to live fetches.
    const cached = isCubeQueryCached(spec.cube, spec.query);
    if (!first && !cached) await sleep(50_000);
    first = false;
    let js;
    try {
      js = await queryCube(spec.cube, spec.query);
    } catch (err) {
      console.warn(`BFS query ${spec.id} blocked/failed: ${String(err)}`);
      blocked.push(spec.id);
      continue;
    }
    const retrievedAt = nowIso();
    walkJsonStat2(js, (coord, value, status) => {
      const mapped = spec.map(coord);
      const { metric, populationType, ...dim } = mapped;
      const suppressed = status === "." || status === ".." || status === "...";
      const c = classify(value, suppressed || value === null);
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
          url: `https://www.pxweb.bfs.admin.ch/api/v1/de/${spec.cube}/${spec.cube}.px`,
          referenceDate: spec.referenceDateFor(coord),
          retrievedAt,
          query: spec.query,
        },
      });
    });
  }
  return blocked;
}

// ---------------------------------------------------------------------------
// Anchor checks (self-report; independent re-fetch is a separate verifier)
// ---------------------------------------------------------------------------
function anchorChecks(): AnchorCheck[] {
  const find = (pred: (o: Observation) => boolean): number | null => {
    const o = observations.find(pred);
    return o ? o.value : null;
  };
  const semLatest = (m: (o: Observation) => boolean) =>
    find((o) => o.source === "SEM" && o.dim.year === 2026 && o.dim.month === 5 && m(o));
  const checks: [string, number, number | null, string][] = [
    ["SEM 2026-05 permanent total", 35, semLatest((o) => o.dataset === "2-10" && o.populationType === "permanent" && o.concept === "Permanent residents" && o.dim.sex === "total"), "SEM 2-10"],
    ["SEM 2026-05 permanent female", 20, semLatest((o) => o.dataset === "2-10" && o.concept === "Permanent residents" && o.dim.sex === "female"), "SEM 2-10"],
    ["SEM 2026-05 permit B", 22, semLatest((o) => o.dataset === "2-10" && o.dim.permit === "B" && o.dim.sex === "total"), "SEM 2-10"],
    ["SEM 2026-05 permit C", 11, semLatest((o) => o.dataset === "2-10" && o.dim.permit === "C" && o.dim.sex === "total"), "SEM 2-10"],
    ["SEM 2026-05 permit L", 2, semLatest((o) => o.dataset === "2-10" && o.dim.permit === "L" && o.dim.sex === "total"), "SEM 2-10"],
    ["SEM 2026-05 FZA", 17, semLatest((o) => o.dataset === "2-20" && o.dim.legalBasis === "FZA" && o.dim.sex === "total"), "SEM 2-20"],
    ["SEM 2026-05 AIG", 18, semLatest((o) => o.dataset === "2-20" && o.dim.legalBasis === "AIG" && o.dim.sex === "total"), "SEM 2-20"],
    ["SEM 2026-05 married", 23, semLatest((o) => o.dataset === "2-22" && o.dim.marital === "married" && !o.dim.marriedToSwiss), "SEM 2-22"],
    ["SEM 2026-05 married to Swiss", 6, semLatest((o) => o.dataset === "2-22" && o.dim.marital === "married" && o.dim.marriedToSwiss === true), "SEM 2-22"],
    ["SEM 2026-05 single", 10, semLatest((o) => o.dataset === "2-22" && o.dim.marital === "single"), "SEM 2-22"],
    ["SEM 2026-05 age 18-64", 27, semLatest((o) => o.dataset === "2-21" && o.dim.ageClass === "18-64" && o.dim.sex === "total"), "SEM 2-21"],
    ["SEM 2026-05 age 65+", 0, semLatest((o) => o.dataset === "2-21" && o.dim.ageClass === "65+" && o.dim.sex === "total"), "SEM 2-21"],
    ["SEM 2026-05 stay 0-4y", 17, semLatest((o) => o.dataset === "2-23" && o.dim.lengthOfStay === "0-4" && o.dim.sex === "total"), "SEM 2-23"],
    ["SEM 2026-05 stay 20+y", 0, semLatest((o) => o.dataset === "2-23" && o.dim.lengthOfStay === "20+" && o.dim.sex === "total"), "SEM 2-23"],
    ["SEM 12mo permanent immigration total", 3, find((o) => o.dataset === "3-30" && o.metric === "immigration" && o.populationType === "permanent" && o.concept === "Total immigration" && o.dim.year === 2026 && o.dim.month === 5), "SEM 3-30 12Mt"],
    ["SEM 12mo non-permanent immigration total", 2, find((o) => o.dataset === "3-31" && o.metric === "immigration" && o.populationType === "non_permanent" && o.concept === "Total immigration" && o.dim.year === 2026 && o.dim.month === 5), "SEM 3-31 12Mt"],
    ["SEM 12mo permanent emigration", 1, find((o) => o.dataset === "3-55" && o.metric === "emigration" && o.populationType === "permanent" && o.concept === "Permanent emigration" && o.dim.sex === "total" && o.dim.year === 2026), "SEM 3-55 12Mt"],
    ["SEM 12mo non-permanent emigration", 3, find((o) => o.dataset === "3-55" && o.metric === "emigration" && o.populationType === "non_permanent" && o.concept === "Non-permanent emigration" && o.dim.sex === "total" && o.dim.year === 2026), "SEM 3-55 12Mt"],
    ["SEM 12mo naturalisations", 0, find((o) => o.dataset === "3-60" && o.metric === "naturalisation" && o.dim.year === 2026), "SEM 3-60 12Mt"],
    ["BFS 2024 Chilean nationals (perm)", 33, find((o) => o.dataset === "px-x-0103010000_101" && o.dim.canton === "ZG" && o.dim.nationality === "CL" && o.dim.year === 2024 && o.populationType === "permanent" && !o.dim.permit && o.dim.sex === "total" && !o.dim.ageClass), "BFS 101"],
    ["BFS 2017 Chilean nationals (perm)", 34, find((o) => o.dataset === "px-x-0103010000_101" && o.dim.canton === "ZG" && o.dim.nationality === "CL" && o.dim.year === 2017 && o.populationType === "permanent" && !o.dim.permit && o.dim.sex === "total" && !o.dim.ageClass), "BFS 101"],
    ["BFS 2020 Chilean nationals (perm)", 20, find((o) => o.dataset === "px-x-0103010000_101" && o.dim.canton === "ZG" && o.dim.nationality === "CL" && o.dim.year === 2020 && o.populationType === "permanent" && !o.dim.permit && o.dim.sex === "total" && !o.dim.ageClass), "BFS 101"],
    ["BFS 2024 Chilean-born (perm)", 99, find((o) => o.dataset === "px-x-0103010000_399" && o.dim.year === 2024 && o.dim.nationalityGroup === "total" && o.populationType === "permanent" && o.dim.sex === "total" && !o.dim.ageClass), "BFS 399"],
    ["BFS 2024 Chilean-born Swiss passport", 33, find((o) => o.dataset === "px-x-0103010000_399" && o.dim.year === 2024 && o.dim.nationalityGroup === "Swiss" && o.populationType === "permanent" && o.dim.sex === "total" && !o.dim.ageClass), "BFS 399"],
    ["BFS 2024 Chilean-born LatAm passport", 34, find((o) => o.dataset === "px-x-0103010000_399" && o.dim.year === 2024 && o.dim.nationalityGroup === "Latin America & Caribbean" && o.populationType === "permanent" && o.dim.sex === "total" && !o.dim.ageClass), "BFS 399"],
    ["BFS 2024 Chilean-born EU passport", 29, find((o) => o.dataset === "px-x-0103010000_399" && o.dim.year === 2024 && o.dim.nationalityGroup === "EU" && o.populationType === "permanent" && o.dim.sex === "total" && !o.dim.ageClass), "BFS 399"],
    ["BFS 2023 Chilean nationals born in Chile", 27, find((o) => o.dataset === "px-x-0103010000_423" && o.dim.nationality === "CL" && o.dim.birthCountry === "CL" && o.populationType === "permanent" && o.dim.sex === "total" && !o.dim.marital), "BFS 423"],
    ["SEM cantonal Chile VD", 989, find((o) => o.dataset === "2-10" && o.dim.canton === "VD" && o.dim.nationality === "CL" && o.dim.sex === "total" && o.concept === "Chilean nationals (cantonal comparison)"), "SEM 2-10 VD"],
    ["SEM cantonal Chile ZH", 554, find((o) => o.dataset === "2-10" && o.dim.canton === "ZH" && o.dim.nationality === "CL" && o.dim.sex === "total" && o.concept === "Chilean nationals (cantonal comparison)"), "SEM 2-10 ZH"],
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
      title: `SEM Ausländerstatistik table ${t} (sheet ZG, row Chile)`,
      checkedFor: "Chile x Zug figures, monthly/annual",
      yielded: `${bySrc("SEM", t).length} cells`,
      observationCount: bySrc("SEM", t).length,
      urls: [...semUrls].filter((u) => u.toLowerCase().includes(`/${t.toLowerCase()}-`)).slice(0, 5),
    });
  }
  for (const cube of ["px-x-0103010000_101", "px-x-0103010000_399", "px-x-0103010000_423"]) {
    records.push({
      id: `BFS ${cube}`,
      source: "BFS",
      title: `BFS STATPOP cube ${cube}`,
      checkedFor: "Chile x Zug slices (nationality / birth country / marital)",
      yielded: `${bySrc("BFS", cube).length} cells`,
      observationCount: bySrc("BFS", cube).length,
      urls: [`https://www.pxweb.bfs.admin.ch/api/v1/de/${cube}/${cube}.px`],
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
  let blocked: string[] = [];
  if (process.env.HARVEST_SKIP_BFS === "1") {
    console.log("Skipping BFS phase (HARVEST_SKIP_BFS=1)");
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
  writeFileSync(join(OUT_DIR, "harvest.json"), JSON.stringify({ observations }, null, 1));
  writeFileSync(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

  // Mirror to the app's static-asset directory so the client can load it
  // without any runtime database or server-side fetching.
  const publicDir = join(process.cwd(), "public", "data");
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, "harvest.json"), JSON.stringify({ observations }));
  writeFileSync(join(publicDir, "manifest.json"), JSON.stringify(manifest));

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
