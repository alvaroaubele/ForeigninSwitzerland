/**
 * Harvest — every nationality, end to end.
 *
 * Sources:
 *   - SEM Ausländerstatistik monthly XLSX tables (stock 2-x, flow 3-x):
 *     every country row of every canton sheet (+ CH-Nati), not just Chile's.
 *   - BFS STATPOP cubes 101 / 399 / 423: the full PC-Axis cube downloads,
 *     streamed once each, with a per-cell keep predicate that reproduces the
 *     slice shapes of the original Chile harvest for every nationality.
 *
 * Scale changes the architecture, not the rules. ~200 nationalities means
 * ~30 million cells, which cannot sit in one process array. The pipeline is:
 *
 *   extract -> per-nationality JSONL buckets on disk -> encode one
 *   nationality at a time -> public/data/nat/{code}/{canton}.json
 *
 * Every cell still resolves to observed / structural_zero / suppressed, with
 * provenance; "not published" remains a statement about the sources, derived
 * downstream, never emitted here. A row label that the registry cannot
 * classify is a fatal error, not a guess.
 *
 * Run:  npm run harvest        (SEM + BFS; needs the px cubes downloaded)
 *       HARVEST_SKIP_BFS=1 …   (SEM only)
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { encodeCanton, decodeCanton, PAYLOAD_VERSION } from "../lib/payload";
import {
  fetchArchiveIndex,
  resolveTableUrl,
  readAllRowsForSheets,
  SHEET_SCOPES,
  STOCK_TABLES,
  FLOW_TABLES_12MT,
  FLOW_TABLES_J,
  type TableDef,
  type LabelledRow,
} from "./harvest/sem.js";
import { fetchRaw } from "./harvest/fetcher.js";
import { ensurePxCube, readPxHeader, pxStreamAll, pxDownloadUrl, type PxHeader } from "./harvest/px.js";
import { loadRegistry, classifySemLabel, semSkipNormSet, type Registry } from "./harvest/registry.js";
import { PERMIT_101, SEX_101, NATGROUP_399, MARITAL_423, ageLabel, CUBE_101, CUBE_399, CUBE_423 } from "./harvest/bfs-queries.js";
import type { AnchorCheck, CellState, Observation } from "../lib/types.js";

const CWD = process.cwd();
const BUCKET_DIR = join(CWD, "data", "buckets");
const PUBLIC_DIR = join(CWD, "public", "data");
const NAT_DIR = join(PUBLIC_DIR, "nat");

const nowIso = () => new Date().toISOString();
const RUN_STARTED = nowIso();

// ---------------------------------------------------------------------------
// Bucket writer: per-nationality JSONL, append-buffered.
//
// Line shape (positional, to keep 30M lines cheap):
//   [dataset, mIdx, pIdx, dim, value, stateIdx, conceptIdx, urlIdx, refDate,
//    sheet|0, rowLabelIdx|-1, rowIndex|-1, queryIdx|-1]
// Strings that repeat millions of times (concepts, urls, row labels, queries)
// go through run-global intern tables saved alongside the buckets.
// ---------------------------------------------------------------------------
const METRICS = ["stock", "immigration", "emigration", "naturalisation"] as const;
const POPS = ["permanent", "non_permanent", "total"] as const;
const STATES: CellState[] = ["observed", "structural_zero", "suppressed", "not_published"];

class Table {
  private map = new Map<string, number>();
  readonly list: string[] = [];
  idx(v: string): number {
    let i = this.map.get(v);
    if (i === undefined) {
      i = this.list.length;
      this.list.push(v);
      this.map.set(v, i);
    }
    return i;
  }
}
const T_CONCEPT = new Table();
const T_URL = new Table();
const T_ROWLABEL = new Table();
const T_QUERY = new Table();

type Line = [
  string, number, number, Record<string, unknown>, number | null, number,
  number, number, string, string | 0, number, number, number,
];

const stateCounts: Record<CellState, number> = { observed: 0, structural_zero: 0, suppressed: 0, not_published: 0 };
const sourceCellCounts = new Map<string, number>(); // "SEM 2-10" | "BFS <cube>" -> cells

class BucketWriter {
  private buffers = new Map<string, string[]>();
  private sizes = new Map<string, number>();
  private opened = new Set<string>();
  lines = 0;

  constructor() {
    rmSync(BUCKET_DIR, { recursive: true, force: true });
    mkdirSync(BUCKET_DIR, { recursive: true });
  }

  write(code: string, line: Line): void {
    const s = JSON.stringify(line) + "\n";
    let buf = this.buffers.get(code);
    if (!buf) {
      buf = [];
      this.buffers.set(code, buf);
      this.sizes.set(code, 0);
    }
    buf.push(s);
    const size = (this.sizes.get(code) ?? 0) + s.length;
    this.sizes.set(code, size);
    this.lines++;
    if (size >= 1 << 18) this.flush(code);
  }

  private flush(code: string): void {
    const buf = this.buffers.get(code);
    if (!buf || buf.length === 0) return;
    appendFileSync(join(BUCKET_DIR, `${code}.jsonl`), buf.join(""));
    this.opened.add(code);
    buf.length = 0;
    this.sizes.set(code, 0);
  }

  flushAll(): void {
    for (const code of this.buffers.keys()) this.flush(code);
    writeFileSync(
      join(BUCKET_DIR, "_tables.json"),
      JSON.stringify({ concepts: T_CONCEPT.list, urls: T_URL.list, rowLabels: T_ROWLABEL.list, queries: T_QUERY.list }),
    );
  }

  codes(): string[] {
    return [...this.opened].sort();
  }
}

function emit(
  w: BucketWriter,
  code: string,
  o: {
    source: "SEM" | "BFS";
    dataset: string;
    metric: (typeof METRICS)[number];
    pop: (typeof POPS)[number];
    dim: Record<string, unknown>;
    value: number | null;
    state: CellState;
    concept: string;
    url: string;
    refDate: string;
    sheet?: string;
    rowLabel?: string;
    rowIndex?: number;
    query?: unknown;
  },
): void {
  stateCounts[o.state]++;
  const src = o.source === "SEM" ? `SEM ${o.dataset}` : `BFS ${o.dataset}`;
  sourceCellCounts.set(src, (sourceCellCounts.get(src) ?? 0) + 1);
  w.write(code, [
    o.dataset,
    METRICS.indexOf(o.metric),
    POPS.indexOf(o.pop),
    o.dim,
    o.value,
    STATES.indexOf(o.state),
    T_CONCEPT.idx(o.concept),
    T_URL.idx(o.url),
    o.refDate,
    o.sheet ?? 0,
    o.rowLabel !== undefined ? T_ROWLABEL.idx(o.rowLabel) : -1,
    o.rowIndex ?? -1,
    o.query !== undefined ? T_QUERY.idx(JSON.stringify(o.query)) : -1,
  ]);
}

function classify(value: number | null, suppressible = false): { value: number | null; state: CellState } {
  if (value === null) return suppressible ? { value: null, state: "suppressed" } : { value: 0, state: "structural_zero" };
  if (value > 0) return { value, state: "observed" };
  return { value: 0, state: "structural_zero" };
}

// ---------------------------------------------------------------------------
// SEM
// ---------------------------------------------------------------------------
const lastDay = (y: number, m: number) => {
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

// The archive exposes only December before 2021 and every month from 2021 on.
// The tail probes a few months past the last known release; missing months 404
// and are skipped, so the harvest discovers the latest month by itself.
function stockMonths(): [number, number][] {
  const out: [number, number][] = [2017, 2018, 2019, 2020].map((y) => [y, 12]);
  const now = new Date();
  const yMax = now.getUTCFullYear();
  for (let y = 2021; y <= yMax; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === yMax && m > now.getUTCMonth() + 1) break;
      out.push([y, m]);
    }
  }
  return out;
}

interface SemRun {
  months: [number, number][];
  tables: TableDef[];
  variant?: "J" | "12Mt";
}

/** The month of the newest archive index that actually lists a 2-10 workbook. */
let LATEST_SEM: [number, number] = [0, 0];

const ZERO_ROW: (number | string | null)[] = ["", ...(Array(48).fill(0) as number[])];

async function runSem(reg: Registry, w: BucketWriter, run: SemRun): Promise<void> {
  const skipNorm = semSkipNormSet(reg);
  for (const [year, month] of run.months) {
    const index = await fetchArchiveIndex(year, month);
    if (!index.ok) continue;
    const referenceDate = lastDay(year, month);
    for (const def of run.tables) {
      const variant = run.variant ?? def.variant;
      const url = resolveTableUrl(index, def.table, variant);
      if (!url) continue;
      const res = (await fetchRaw(url, { ext: "xlsx" })) as { buffer: Buffer; notFound?: boolean };
      if (res.notFound || res.buffer.length === 0) continue;
      if (def.table === "2-10" && !variant && (year > LATEST_SEM[0] || (year === LATEST_SEM[0] && month > LATEST_SEM[1]))) {
        LATEST_SEM = [year, month];
      }
      const perSheet = readAllRowsForSheets(res.buffer, SHEET_SCOPES.map(([s]) => s));
      for (const [sheetName, canton] of SHEET_SCOPES) {
        const rows = perSheet.get(sheetName);
        if (!rows) continue; // sheet absent from this workbook
        // Classify every labelled row; unknown labels are fatal — the registry
        // no longer describes the source and every downstream number is suspect.
        const byCode = new Map<string, LabelledRow>();
        const unknown: string[] = [];
        for (const r of rows) {
          const cls = classifySemLabel(reg, r.label, skipNorm);
          if (cls.kind === "unknown") unknown.push(r.label);
          else if (cls.kind === "entry" && !byCode.has(cls.entry.code)) byCode.set(cls.entry.code, r);
        }
        if (unknown.length) {
          throw new Error(
            `SEM ${def.table} ${year}-${month} sheet ${sheetName}: unclassified row label(s): ` +
              unknown.map((u) => JSON.stringify(u)).join(", "),
          );
        }
        const isFlow = def.metric !== "stock";
        for (const entry of reg.semEntries) {
          const found = byCode.get(entry.code) ?? null;
          // Groups are always printed when the sheet exists; a country absent
          // from a stock sheet has zero residents there, absent from a flow
          // sheet had zero movement. Both are real zeros, emitted with the
          // same coordinates the present case would produce.
          if (!found && entry.code.startsWith("_") && entry.code !== "_SL" && entry.code !== "_NONAT" && entry.code !== "_UNK") {
            continue;
          }
          const row = found ? found.row : ZERO_ROW;
          for (const cell of def.extract(row)) {
            const { value, state } = classify(cell.value, false);
            emit(w, entry.code, {
              source: "SEM",
              dataset: def.table,
              metric: cell.metric,
              pop: cell.pop,
              dim: { canton, year, month, nationality: entry.code, ...cell.dim },
              value,
              state,
              concept: cell.concept,
              url,
              refDate: referenceDate,
              sheet: sheetName,
              rowLabel: found
                ? found.label.trim()
                : `${entry.de} (absent from ${isFlow ? "flow table" : "canton sheet"} = 0)`,
              rowIndex: found ? found.index : undefined,
            });
          }
        }
      }
    }
  }
}

/**
 * Cantonal comparison rows (latest 2-10): for every nationality, the T/F/M
 * stock in every canton, plus the all-foreigners denominator. These power the
 * per-nationality summary files that the comparison section reads on its own.
 */
async function runSemCantonal(reg: Registry, w: BucketWriter, year: number, month: number): Promise<void> {
  const skipNorm = semSkipNormSet(reg);
  const index = await fetchArchiveIndex(year, month);
  if (!index.ok) throw new Error(`SEM cantonal: archive ${year}-${month} unavailable`);
  const url = resolveTableUrl(index, "2-10");
  if (!url) throw new Error(`SEM cantonal: no 2-10 in ${year}-${month} index`);
  const res = (await fetchRaw(url, { ext: "xlsx" })) as { buffer: Buffer };
  const referenceDate = lastDay(year, month);
  const SEX = ["total", "female", "male"] as const;
  const perSheet = readAllRowsForSheets(res.buffer, SHEET_SCOPES.map(([s]) => s));
  for (const [sheetName, canton] of SHEET_SCOPES) {
    const rows = perSheet.get(sheetName);
    if (!rows) continue;
    const byCode = new Map<string, LabelledRow>();
    for (const r of rows) {
      const cls = classifySemLabel(reg, r.label, skipNorm);
      if (cls.kind === "entry" && !byCode.has(cls.entry.code)) byCode.set(cls.entry.code, r);
    }
    const all = byCode.get("_ALL");
    for (const entry of reg.semEntries) {
      if (entry.code === "_ALL") continue;
      const found = byCode.get(entry.code) ?? null;
      if (!found && entry.code.startsWith("_") && !["_SL", "_NONAT", "_UNK"].includes(entry.code)) continue;
      const vals: (number | null)[] = found
        ? [found.row[1] as number | null, found.row[2] as number | null, found.row[3] as number | null]
        : [0, 0, 0];
      SEX.forEach((sex, i) => {
        const { value, state } = classify(typeof vals[i] === "number" ? (vals[i] as number) : found ? null : 0, false);
        emit(w, entry.code, {
          source: "SEM",
          dataset: "2-10",
          metric: "stock",
          pop: "permanent",
          dim: { canton, year, month, nationality: entry.code, sex },
          value,
          state,
          concept: "Nationals (cantonal comparison)",
          url,
          refDate: referenceDate,
          sheet: sheetName,
          rowLabel: found ? found.label.trim() : `${entry.de} (absent from canton sheet = 0)`,
          rowIndex: found ? found.index : undefined,
        });
      });
      // Denominator row, duplicated into every bucket so each nationality's
      // summary file is self-contained.
      if (all && typeof all.row[1] === "number") {
        emit(w, entry.code, {
          source: "SEM",
          dataset: "2-10",
          metric: "stock",
          pop: "permanent",
          dim: { canton, year, month, sex: "total", nationality: "all_foreign" },
          value: all.row[1],
          state: "observed",
          concept: "Foreign residents (per-capita denominator)",
          url,
          refDate: referenceDate,
          sheet: sheetName,
          rowLabel: all.label.trim(),
          rowIndex: all.index,
        });
      }
    }
    // The _ALL bucket gets its own comparison rows (its "national" figures are
    // the Gesamttotal row itself).
    if (all) {
      SEX.forEach((sex, i) => {
        const v = all.row[1 + i];
        const { value, state } = classify(typeof v === "number" ? v : null, false);
        emit(w, "_ALL", {
          source: "SEM",
          dataset: "2-10",
          metric: "stock",
          pop: "permanent",
          dim: { canton, year, month, nationality: "_ALL", sex },
          value,
          state,
          concept: "Nationals (cantonal comparison)",
          url,
          refDate: referenceDate,
          sheet: sheetName,
          rowLabel: all.label.trim(),
          rowIndex: all.index,
        });
      });
    }
  }
}

// ---------------------------------------------------------------------------
// BFS: one streaming pass per cube.
// ---------------------------------------------------------------------------
const PX_ACCESS = "Full PC-Axis cube download (GET), decoded locally";

function dimIndex(h: PxHeader, name: string): number {
  const i = h.dims.findIndex((d) => d.name === name);
  if (i < 0) throw new Error(`cube ${h.matrix}: dimension ${JSON.stringify(name)} not found`);
  return i;
}

const kantonCode = (c: string) => (c === "8100" ? "CH" : c);

async function runBfs101(reg: Registry, w: BucketWriter): Promise<void> {
  const { path } = await ensurePxCube(CUBE_101);
  const h = readPxHeader(path);
  const url = pxDownloadUrl(CUBE_101);
  const iY = dimIndex(h, "Jahr"), iK = dimIndex(h, "Kanton"), iP = dimIndex(h, "Bevölkerungstyp");
  const iB = dimIndex(h, "Anwesenheitsbewilligung"), iS = dimIndex(h, "Geschlecht"), iA = dimIndex(h, "Altersklasse");
  const iN = dimIndex(h, "Staatsangehörigkeit");
  const years = h.dims[iY].codes;
  const latestYear = years[years.length - 1];
  // Per-position lookups, precomputed once.
  const natEntry = h.dims[iN].codes.map((c) => reg.byBfs101.get(c) ?? null);
  const natRaw = h.dims[iN].codes;
  const isTotal = (dim: number, pos: number) => h.dims[dim].codes[pos] === "-99999";
  const query = { route: "full-cube download", cube: CUBE_101, kept: "per-nationality time series at totals + full permit×sex×age cross for the latest year" };

  let kept = 0;
  pxStreamAll(path, h, (pos, value, raw) => {
    const natCode = natRaw[pos[iN]];
    const entry = natEntry[pos[iN]];
    const permitT = isTotal(iB, pos[iB]), sexT = isTotal(iS, pos[iS]), ageT = isTotal(iA, pos[iA]);
    const totals = (permitT ? 1 : 0) + (sexT ? 1 : 0) + (ageT ? 1 : 0);
    const year = Number(h.dims[iY].codes[pos[iY]]);
    const isLatest = h.dims[iY].codes[pos[iY]] === latestYear;

    let bucket: string;
    let nationality: string;
    if (entry) {
      if (!(isLatest || totals >= 2)) return;
      bucket = entry.code;
      nationality = entry.code;
    } else if (natCode === "-99999" || natCode === "8100") {
      // Baselines: total resident population and Swiss nationals. Kept at
      // full-total shape only, in the _ALL bucket (every summary copies the
      // latest-year rows out of it).
      if (!(permitT && sexT && ageT)) return;
      bucket = "_ALL";
      nationality = natCode === "8100" ? "CH" : "total";
    } else {
      return;
    }

    const suppressed = /^\.+$/.test(raw.replace(/"/g, "").trim());
    const c = classify(value, suppressed || value === null);
    const dim: Record<string, unknown> = {
      canton: kantonCode(h.dims[iK].codes[pos[iK]]),
      year,
      sex: SEX_101[h.dims[iS].codes[pos[iS]]] ?? "total",
      nationality,
    };
    if (!permitT) {
      const p = PERMIT_101[h.dims[iB].codes[pos[iB]]];
      if (!p) return; // permit categories outside the app's map (e.g. diplomats) stay unharvested
      dim.permit = p;
    }
    if (!ageT) dim.ageClass = ageLabel(h.dims[iA].codes[pos[iA]]);

    const concept =
      nationality === "total" || nationality === "CH"
        ? "Resident population baseline by year"
        : isLatest && totals < 2
          ? "Nationals by permit, sex and age (latest year)"
          : !permitT
            ? "Nationals by permit category and year"
            : !sexT
              ? "Nationals by sex and year"
              : !ageT
                ? "Nationals by age class and year"
                : "Nationals by year";

    emit(w, bucket, {
      source: "BFS",
      dataset: CUBE_101,
      metric: "stock",
      pop: h.dims[iP].codes[pos[iP]] === "1" ? "permanent" : "non_permanent",
      dim,
      value: c.value,
      state: c.state,
      concept,
      url,
      refDate: `${year}-12-31`,
      query,
    });
    kept++;
  });
  console.log(`  cube 101: kept ${kept} cells`);
}

async function runBfs399(reg: Registry, w: BucketWriter): Promise<void> {
  const { path } = await ensurePxCube(CUBE_399);
  const h = readPxHeader(path);
  const url = pxDownloadUrl(CUBE_399);
  const iY = dimIndex(h, "Jahr"), iK = dimIndex(h, "Kanton"), iP = dimIndex(h, "Bevölkerungstyp");
  const iG = dimIndex(h, "Staatsangehörigkeit (Auswahl)"), iB = dimIndex(h, "Geburtsstaat");
  const iS = dimIndex(h, "Geschlecht"), iA = dimIndex(h, "Altersklasse");
  const years = h.dims[iY].codes;
  const latestYear = years[years.length - 1];
  const birthEntry = h.dims[iB].codes.map((c) => reg.byBfs399Birth.get(c) ?? null);
  const query = { route: "full-cube download", cube: CUBE_399, kept: "per-birth-country time series at totals + full passport-group×sex×age cross for the latest year" };

  let kept = 0;
  pxStreamAll(path, h, (pos, value, raw) => {
    const entry = birthEntry[pos[iB]];
    if (!entry) return; // birth-country totals and Swiss-born are not this app's scope
    const gT = h.dims[iG].codes[pos[iG]] === "-99999";
    const sexT = h.dims[iS].codes[pos[iS]] === "-99999";
    const ageT = h.dims[iA].codes[pos[iA]] === "-99999";
    const totals = (gT ? 1 : 0) + (sexT ? 1 : 0) + (ageT ? 1 : 0);
    const isLatest = h.dims[iY].codes[pos[iY]] === latestYear;
    if (!(isLatest || totals >= 2)) return;

    const suppressed = /^\.+$/.test(raw.replace(/"/g, "").trim());
    const c = classify(value, suppressed || value === null);
    const year = Number(h.dims[iY].codes[pos[iY]]);
    const g = h.dims[iG].codes[pos[iG]];
    const dim: Record<string, unknown> = {
      canton: kantonCode(h.dims[iK].codes[pos[iK]]),
      year,
      birthCountry: entry.code,
      nationalityGroup: NATGROUP_399[g] ?? g,
      sex: SEX_101[h.dims[iS].codes[pos[iS]]] ?? "total",
    };
    if (!ageT) dim.ageClass = ageLabel(h.dims[iA].codes[pos[iA]]);

    const concept =
      isLatest && totals < 2
        ? "Born abroad by passport group, sex and age (latest year)"
        : !gT
          ? "Born abroad by passport group and year"
          : !sexT
            ? "Born abroad by sex and year"
            : !ageT
              ? "Born abroad by age class and year"
              : "Born abroad by year";

    emit(w, entry.code, {
      source: "BFS",
      dataset: CUBE_399,
      metric: "stock",
      pop: h.dims[iP].codes[pos[iP]] === "1" ? "permanent" : "non_permanent",
      dim,
      value: c.value,
      state: c.state,
      concept,
      url,
      refDate: `${year}-12-31`,
      query,
    });
    kept++;
  });
  console.log(`  cube 399: kept ${kept} cells`);
}

async function runBfs423(reg: Registry, w: BucketWriter): Promise<void> {
  const { path } = await ensurePxCube(CUBE_423);
  const h = readPxHeader(path);
  const url = pxDownloadUrl(CUBE_423);
  const iY = dimIndex(h, "Jahr"), iK = dimIndex(h, "Kanton"), iP = dimIndex(h, "Bevölkerungstyp");
  const iN = dimIndex(h, "Staatsangehörigkeit"), iB = dimIndex(h, "Geburtsstaat");
  const iS = dimIndex(h, "Geschlecht"), iZ = dimIndex(h, "Zivilstand");
  const year = Number(h.dims[iY].codes[0]);
  const natEntry = h.dims[iN].codes.map((c) => reg.byBfs423Nat.get(c) ?? null);
  const birthEntry = h.dims[iB].codes.map((c) => reg.byBfs423Birth.get(c) ?? null);
  const query = { route: "full-cube download", cube: CUBE_423, kept: "marital×sex for each nationality and each birth country; own-country birthplace pairs" };

  let kept = 0;
  pxStreamAll(path, h, (pos, value, raw) => {
    const nat = natEntry[pos[iN]];
    const birth = birthEntry[pos[iB]];
    const natT = h.dims[iN].codes[pos[iN]] === "-99999";
    const birthT = h.dims[iB].codes[pos[iB]] === "-99999";
    const sexCode = h.dims[iS].codes[pos[iS]];
    const zCode = h.dims[iZ].codes[pos[iZ]];
    const sexT = sexCode === "-99999";
    const zT = zCode === "-99999";

    let bucket: string;
    const dim: Record<string, unknown> = {
      canton: kantonCode(h.dims[iK].codes[pos[iK]]),
      year,
      sex: SEX_101[sexCode] ?? "total",
    };
    if (nat && birthT) {
      // marital × sex for the nationality side
      bucket = nat.code;
      dim.nationality = nat.code;
      if (sexT && zT) {
        // also the "born anywhere" side of the birthplace pair
        emitPair(nat.code, { ...dim, nationality: nat.code, birthCountry: "any" });
      }
    } else if (natT && birth) {
      // marital × sex for the birth-country side
      bucket = birth.code;
      dim.birthCountry = birth.code;
    } else if (nat && birth && nat.code === birth.code && sexT && zT) {
      // nationals born in their own country
      bucket = nat.code;
      dim.nationality = nat.code;
      dim.birthCountry = birth.code;
    } else {
      return;
    }
    if (!zT) dim.marital = MARITAL_423[zCode] ?? zCode;

    const suppressed = /^\.+$/.test(raw.replace(/"/g, "").trim());
    const c = classify(value, suppressed || value === null);
    emit(w, bucket, {
      source: "BFS",
      dataset: CUBE_423,
      metric: "stock",
      pop: h.dims[iP].codes[pos[iP]] === "1" ? "permanent" : "non_permanent",
      dim,
      value: c.value,
      state: c.state,
      concept: dim.nationality && dim.birthCountry
        ? "Nationals born in their own country vs elsewhere"
        : dim.nationality
          ? "Nationals by marital status and sex"
          : "Born abroad by marital status and sex",
      url,
      refDate: `${year}-12-31`,
      query,
    });
    kept++;

    function emitPair(code: string, pairDim: Record<string, unknown>) {
      const sup = /^\.+$/.test(raw.replace(/"/g, "").trim());
      const cc = classify(value, sup || value === null);
      emit(w, code, {
        source: "BFS",
        dataset: CUBE_423,
        metric: "stock",
        pop: h.dims[iP].codes[pos[iP]] === "1" ? "permanent" : "non_permanent",
        dim: pairDim,
        value: cc.value,
        state: cc.state,
        concept: "Nationals born in their own country vs elsewhere",
        url,
        refDate: `${year}-12-31`,
        query,
      });
      kept++;
    }
  });
  console.log(`  cube 423: kept ${kept} cells`);
}

// ---------------------------------------------------------------------------
// Encode pass: bucket JSONL -> public/data/nat/{code}/{canton}.json (+summary)
// ---------------------------------------------------------------------------
const COMPARISON_CONCEPTS = new Set([
  "Nationals (cantonal comparison)",
  "Foreign residents (per-capita denominator)",
]);

interface NatIndexEntry {
  code: string;
  de: string;
  observations: number;
  bytes: number;
  /** latest SEM Switzerland-wide permanent total (null when SEM has no row) */
  semTotal: number | null;
  /** latest BFS Switzerland-wide permanent total from cube 101 */
  bfsTotal: number | null;
  hasSem: boolean;
  hasBfs: boolean;
}

function decodeLine(l: Line, tables: { concepts: string[]; urls: string[]; rowLabels: string[]; queries: string[] }, retrievedAt: string): Observation {
  const [dataset, m, p, dim, value, t, cIdx, uIdx, refDate, sheet, rlIdx, rowIndex, qIdx] = l;
  const source = dataset.startsWith("px-") ? "BFS" : "SEM";
  return {
    id: "",
    source,
    dataset,
    metric: METRICS[m],
    populationType: POPS[p],
    dim: dim as Observation["dim"],
    value,
    state: STATES[t],
    concept: tables.concepts[cIdx],
    unit: "persons",
    provenance: {
      url: tables.urls[uIdx],
      referenceDate: refDate,
      retrievedAt,
      ...(source === "BFS" ? { access: PX_ACCESS } : {}),
      ...(sheet !== 0 ? { sheet: sheet as string } : {}),
      ...(rlIdx >= 0 ? { rowLabel: tables.rowLabels[rlIdx] } : {}),
      ...(rowIndex >= 0 ? { rowIndex } : {}),
      ...(qIdx >= 0 ? { query: JSON.parse(tables.queries[qIdx]) } : {}),
    },
  } as Observation;
}

function encodeAll(reg: Registry, w: BucketWriter): { index: NatIndexEntry[]; totalObs: number; totalBytes: number } {
  const tables = JSON.parse(readFileSync(join(BUCKET_DIR, "_tables.json"), "utf8"));
  rmSync(NAT_DIR, { recursive: true, force: true });
  mkdirSync(NAT_DIR, { recursive: true });
  const index: NatIndexEntry[] = [];
  let totalObs = 0;
  let totalBytes = 0;

  for (const code of w.codes()) {
    const raw = readFileSync(join(BUCKET_DIR, `${code}.jsonl`), "utf8");
    const seen = new Set<string>();
    const byCanton = new Map<string, Observation[]>();
    const summaryObs: Observation[] = [];
    let semTotal: number | null = null;
    let bfsTotal: number | null = null;
    let bfsTotalYear = 0;
    let hasSem = false;
    let hasBfs = false;

    for (const lineStr of raw.split("\n")) {
      if (!lineStr) continue;
      const o = decodeLine(JSON.parse(lineStr) as Line, tables, RUN_STARTED);
      const key = `${o.dataset}|${o.metric}|${o.populationType}|${JSON.stringify(o.dim)}|${o.provenance.referenceDate}|${o.concept}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (o.source === "SEM") hasSem = true;
      else hasBfs = true;

      const canton = (o.dim.canton as string) ?? "CH";
      if (COMPARISON_CONCEPTS.has(o.concept)) {
        summaryObs.push(o);
      } else {
        let list = byCanton.get(canton);
        if (!list) byCanton.set(canton, (list = []));
        list.push(o);
      }
      if (
        o.concept === "Nationals (cantonal comparison)" &&
        canton === "CH" &&
        o.dim.sex === "total" &&
        o.dim.nationality === code
      ) {
        semTotal = o.value;
      }
      if (
        o.source === "BFS" &&
        o.dataset === CUBE_101 &&
        canton === "CH" &&
        o.populationType === "permanent" &&
        o.dim.sex === "total" &&
        !o.dim.permit &&
        !o.dim.ageClass &&
        o.dim.nationality === code &&
        (o.dim.year ?? 0) >= bfsTotalYear
      ) {
        bfsTotal = o.value;
        bfsTotalYear = o.dim.year ?? 0;
      }
    }

    const dir = join(NAT_DIR, code);
    mkdirSync(dir, { recursive: true });
    let obsCount = summaryObs.length;
    let bytes = 0;
    for (const [canton, list] of [...byCanton.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const stray = list.find((o) => o.dim.canton !== canton);
      if (stray) {
        throw new Error(`nat ${code} canton file ${canton} would contain a ${String(stray.dim.canton)} row — files must be pure`);
      }
      const json = JSON.stringify(encodeCanton(canton, list));
      writeFileSync(join(dir, `${canton}.json`), json);
      obsCount += list.length;
      bytes += json.length;
    }
    const sj = JSON.stringify(encodeCanton("ALL", summaryObs));
    writeFileSync(join(dir, "summary.json"), sj);
    bytes += sj.length;

    const entry = reg.byCode.get(code);
    index.push({
      code,
      de: entry?.de ?? code,
      observations: obsCount,
      bytes,
      semTotal,
      bfsTotal,
      hasSem,
      hasBfs,
    });
    totalObs += obsCount;
    totalBytes += bytes;
  }
  return { index, totalObs, totalBytes };
}

// ---------------------------------------------------------------------------
// Anchors: decoded-payload spot checks. The Chile set is carried over verbatim
// from the single-nationality harvest — the rewrite must reproduce it exactly.
// ---------------------------------------------------------------------------
function loadNat(code: string): Observation[] {
  const dir = join(NAT_DIR, code);
  if (!existsSync(dir)) return [];
  const out: Observation[] = [];
  for (const f of readdirSync(dir)) {
    out.push(...decodeCanton(JSON.parse(readFileSync(join(dir, f), "utf8"))));
  }
  return out;
}

function anchorChecks(latestSem: [number, number]): AnchorCheck[] {
  const [ly, lm] = latestSem;
  const cl = loadNat("CL");
  const find = (pred: (o: Observation) => boolean): number | null => {
    const o = cl.find(pred);
    return o ? o.value : null;
  };
  const semLatestIn = (canton: string, m: (o: Observation) => boolean) =>
    find((o) => o.source === "SEM" && o.dim.canton === canton && o.dim.year === ly && o.dim.month === lm && m(o));
  const findIn = (canton: string, pred: (o: Observation) => boolean) => find((o) => o.dim.canton === canton && pred(o));

  const checks: [string, number, number | null, string][] = [
    // SEM latest-month figures move with each release; the stable BFS history
    // is the cross-rewrite regression proof. SEM anchors assert against the
    // 2026-05 values only while that is still the latest month.
    ...(ly === 2026 && lm === 5
      ? ([
          ["Zug 2026-05 permanent total", 35, semLatestIn("ZG", (o) => o.dataset === "2-10" && o.populationType === "permanent" && o.concept === "Permanent residents" && o.dim.sex === "total"), "SEM 2-10"],
          ["Zug 2026-05 permit B", 22, semLatestIn("ZG", (o) => o.dataset === "2-10" && o.dim.permit === "B" && o.dim.sex === "total"), "SEM 2-10"],
          ["Switzerland 2026-05 permanent total", 3303, semLatestIn("CH", (o) => o.dataset === "2-10" && o.populationType === "permanent" && o.concept === "Permanent residents" && o.dim.sex === "total"), "SEM 2-10 CH-Nati"],
          ["Vaud 2026-05 permanent total", 989, semLatestIn("VD", (o) => o.dataset === "2-10" && o.populationType === "permanent" && o.concept === "Permanent residents" && o.dim.sex === "total"), "SEM 2-10 VD"],
        ] as [string, number, number | null, string][])
      : []),
    ["Zug BFS 2024 Chilean nationals (perm)", 33, findIn("ZG", (o) => o.dataset === CUBE_101 && o.dim.nationality === "CL" && o.dim.year === 2024 && o.populationType === "permanent" && !o.dim.permit && o.dim.sex === "total" && !o.dim.ageClass), "BFS 101"],
    ["Zug BFS 2017 Chilean nationals (perm)", 34, findIn("ZG", (o) => o.dataset === CUBE_101 && o.dim.nationality === "CL" && o.dim.year === 2017 && o.populationType === "permanent" && !o.dim.permit && o.dim.sex === "total" && !o.dim.ageClass), "BFS 101"],
    ["Zug BFS 2020 Chilean nationals (perm)", 20, findIn("ZG", (o) => o.dataset === CUBE_101 && o.dim.nationality === "CL" && o.dim.year === 2020 && o.populationType === "permanent" && !o.dim.permit && o.dim.sex === "total" && !o.dim.ageClass), "BFS 101"],
    ["Switzerland BFS 2024 Chilean nationals (perm)", 3394, findIn("CH", (o) => o.dataset === CUBE_101 && o.dim.nationality === "CL" && o.dim.year === 2024 && o.populationType === "permanent" && !o.dim.permit && o.dim.sex === "total" && !o.dim.ageClass), "BFS 101 CH"],
    ["Zug BFS 2024 Chilean-born (perm)", 99, findIn("ZG", (o) => o.dataset === CUBE_399 && o.dim.year === 2024 && o.dim.nationalityGroup === "total" && o.populationType === "permanent" && o.dim.sex === "total" && !o.dim.ageClass), "BFS 399"],
    ["Zug BFS 2024 Chilean-born Swiss passport", 33, findIn("ZG", (o) => o.dataset === CUBE_399 && o.dim.year === 2024 && o.dim.nationalityGroup === "Swiss" && o.populationType === "permanent" && o.dim.sex === "total" && !o.dim.ageClass), "BFS 399"],
    ["Zug BFS 2024 Chilean-born LatAm passport", 34, findIn("ZG", (o) => o.dataset === CUBE_399 && o.dim.year === 2024 && o.dim.nationalityGroup === "Latin America & Caribbean" && o.populationType === "permanent" && o.dim.sex === "total" && !o.dim.ageClass), "BFS 399"],
    ["Zug BFS 2024 Chilean-born EU passport", 29, findIn("ZG", (o) => o.dataset === CUBE_399 && o.dim.year === 2024 && o.dim.nationalityGroup === "EU" && o.populationType === "permanent" && o.dim.sex === "total" && !o.dim.ageClass), "BFS 399"],
    ["Zug BFS 2023 Chilean nationals born in Chile", 27, findIn("ZG", (o) => o.dataset === CUBE_423 && o.dim.nationality === "CL" && o.dim.birthCountry === "CL" && o.populationType === "permanent" && o.dim.sex === "total" && !o.dim.marital), "BFS 423"],
  ];
  return checks.map(([label, expected, observed, source]) => ({ label, expected, observed, pass: observed === expected, source }));
}

// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const started = Date.now();
  const reg = loadRegistry();
  const w = new BucketWriter();
  console.log(`registry: ${reg.entries.length} entries (${reg.semEntries.length} with SEM rows)`);

  console.log("SEM: stock tables, all months, all nationalities …");
  await runSem(reg, w, { months: stockMonths(), tables: STOCK_TABLES });
  if (LATEST_SEM[0] === 0) throw new Error("SEM: no 2-10 workbook found in any month");
  console.log(`  latest SEM month: ${LATEST_SEM[0]}-${String(LATEST_SEM[1]).padStart(2, "0")}`);

  console.log("SEM: annual flows (December releases) …");
  const flowJYears: [number, number][] = [];
  for (let y = 2017; y <= LATEST_SEM[0]; y++) flowJYears.push([y, 12]);
  await runSem(reg, w, { months: flowJYears, tables: FLOW_TABLES_J, variant: "J" });

  console.log("SEM: rolling 12-month flows (latest release) …");
  await runSem(reg, w, { months: [LATEST_SEM], tables: FLOW_TABLES_12MT, variant: "12Mt" });

  console.log("SEM: cantonal comparison (latest 2-10) …");
  await runSemCantonal(reg, w, LATEST_SEM[0], LATEST_SEM[1]);

  if (process.env.HARVEST_SKIP_BFS === "1") {
    console.log("Skipping BFS (HARVEST_SKIP_BFS=1)");
  } else {
    console.log("BFS: streaming full cubes …");
    await runBfs101(reg, w);
    await runBfs399(reg, w);
    await runBfs423(reg, w);
  }

  w.flushAll();
  console.log(`buckets: ${w.codes().length} nationalities, ${w.lines} lines`);

  console.log("Encoding payloads …");
  const { index, totalObs, totalBytes } = encodeAll(reg, w);

  const anchors = anchorChecks(LATEST_SEM);
  const sources = [...sourceCellCounts.entries()].sort().map(([id, n]) => ({
    id,
    source: id.startsWith("SEM") ? "SEM" : "BFS",
    title: id.startsWith("SEM")
      ? `SEM Ausländerstatistik table ${id.slice(4)} (all 26 canton sheets + CH-Nati, every country row)`
      : `BFS STATPOP cube ${id.slice(4)} (full cube download, per-nationality slices)`,
    checkedFor: "every nationality × every canton",
    yielded: `${n} cells`,
    observationCount: n,
    urls: id.startsWith("SEM") ? [] : [pxDownloadUrl(id.slice(4))],
  }));

  const manifest = {
    generatedAt: nowIso(),
    payloadVersion: PAYLOAD_VERSION,
    observationCount: totalObs,
    cellStateCounts: stateCounts,
    nationalities: index.length,
    sources,
    anchors,
    referenceDates: {
      sem: lastDay(LATEST_SEM[0], LATEST_SEM[1]),
      bfsStatpop: "2024-12-31",
    },
  };
  writeFileSync(join(CWD, "data", "manifest.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(join(PUBLIC_DIR, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(
    join(PUBLIC_DIR, "index.json"),
    JSON.stringify({ generatedAt: manifest.generatedAt, referenceDates: manifest.referenceDates, nationalities: index }),
  );

  const passed = anchors.filter((a) => a.pass).length;
  console.log(`\nHarvest complete in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`  observations: ${totalObs} across ${index.length} nationalities (${(totalBytes / 1048576).toFixed(1)} MB)`);
  console.log(`  cell states:`, stateCounts);
  console.log(`  anchors: ${passed}/${anchors.length} pass`);
  for (const a of anchors.filter((a) => !a.pass)) {
    console.log(`    FAIL ${a.label}: expected ${a.expected}, got ${a.observed}`);
  }
  if (passed !== anchors.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
