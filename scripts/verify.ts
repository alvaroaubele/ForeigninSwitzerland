/**
 * Independent verification of the SEM harvest.
 *
 * This script does NOT trust data/harvest.json. For a reproducible >=15% sample
 * of SEM cells (plus every SEM anchor in data/manifest.json), it:
 *   1. re-fetches the recorded provenance.url FRESH over HTTP (no data/raw cache),
 *   2. opens the recorded sheet ("ZG", or a canton sheet for cantonal baselines),
 *   3. locates the "Chile" row (whitespace-tolerant) — or "Gesamttotal" for the
 *      per-capita denominator, or confirms Chile is ABSENT for structural-zero
 *      flow totals,
 *   4. reads the cell whose column is derived INDEPENDENTLY here (this file does
 *      not import the harvest's extract code; the column map below was written
 *      from a fresh reading of the SEM header rows and cross-checked against
 *      scripts/harvest/sem.ts),
 *   5. compares the freshly-read value to the harvested value (and each anchor's
 *      `expected`).
 *
 * Network: <=4 concurrent against www.sem.admin.ch, small stagger delay, retry
 * with backoff. Never touches pxweb.bfs.admin.ch — that host needs a different
 * client and a much lower request rate, so BFS is verified by its own script,
 * `scripts/verify-bfs.ts`. Run both (`npm run verify`) to cover the whole harvest.
 *
 * Run:  npx tsx scripts/verify.ts
 * Writes: data/verification-report.md
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeCanton, type CantonPayload } from "../lib/payload";
import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Types (structural, mirrors the harvest output we are auditing)
// ---------------------------------------------------------------------------
type Dim = Record<string, string | number | boolean | undefined>;
interface Provenance {
  url: string;
  referenceDate: string;
  sheet: string;
  rowLabel: string;
  rowIndex?: number;
}
interface Obs {
  source: string;
  dataset: string;
  metric: string;
  populationType: string;
  dim: Dim;
  value: number | null;
  state: string;
  concept: string;
  provenance: Provenance;
  id: string;
}
interface Anchor {
  label: string;
  expected: number;
  observed: number | null;
  pass: boolean;
  source: string;
}

const ROOT = process.cwd();
const DATA = join(ROOT, "data");

// ---------------------------------------------------------------------------
// Fresh, rate-limited SEM fetcher (NO disk cache — genuine network reads).
// Each distinct URL is fetched at most once per run and held in memory; the
// same workbook feeds many sampled cells. This is still a fresh HTTP GET; it
// only avoids re-downloading the identical file within one verification run.
// ---------------------------------------------------------------------------
const MAX_CONCURRENT = 4;
const STAGGER_MS = 250;
const MAX_RETRIES = 5;
const TIMEOUT_MS = 45_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let active = 0;
const waiters: Array<() => void> = [];
async function gate<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((res) => waiters.push(res));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

const bufCache = new Map<string, Promise<Buffer>>();
async function fetchFresh(url: string): Promise<Buffer> {
  const host = new URL(url).host;
  if (!host.endsWith("sem.admin.ch")) {
    throw new Error(`refusing to fetch non-SEM host: ${host}`);
  }
  let p = bufCache.get(url);
  if (p) return p;
  p = gate(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
      try {
        await sleep(STAGGER_MS * (attempt === 0 ? 1 : 0));
        const res = await fetch(url, {
          signal: ac.signal,
          headers: { "User-Agent": "chileans-in-zug-verify/1.0 (independent audit)" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0) throw new Error("empty body");
        return buf;
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_RETRIES) await sleep(2000 * 2 ** attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(`fetch failed after retries: ${url}: ${String(lastErr)}`);
  });
  bufCache.set(url, p);
  return p;
}

// Parsed-workbook cache keyed by url, and a parsed-sheet cache on top of it.
//
// The workbook is parsed once per file rather than once per sheet. Each workbook
// holds 28 sheets and every one of them is now sampled, so re-parsing per sheet
// would mean ~20 000 parses of ~750 files instead of 750.
type Row = (number | string | null)[];
const wbCache = new Map<string, Promise<XLSX.WorkBook>>();
const sheetCache = new Map<string, Row[] | null>();
async function getWorkbook(url: string): Promise<XLSX.WorkBook> {
  let p = wbCache.get(url);
  if (!p) {
    p = fetchFresh(url).then((buf) => XLSX.read(buf, { type: "buffer" }));
    wbCache.set(url, p);
  }
  return p;
}
async function getSheetRows(url: string, sheetName: string): Promise<Row[] | null> {
  const key = `${url}::${sheetName}`;
  if (sheetCache.has(key)) return sheetCache.get(key)!;
  const wb = await getWorkbook(url);
  const sheet = wb.Sheets[sheetName];
  const rows = sheet
    ? (XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as Row[])
    : null;
  sheetCache.set(key, rows);
  return rows;
}

const norm = (s: unknown) => String(s).replace(/\s+/g, "").toLowerCase();

/**
 * True for the harvest's "Chile does not appear in this flow sheet at all" marker.
 *
 * Matched on the prefix rather than the exact string. The wording has already
 * changed once ("Chile (absent = 0)" -> "Chile (absent from flow table = 0)"),
 * and an exact match that quietly stops firing is the worst possible failure
 * here: these cells fall through to the ordinary column path, where looking up a
 * row that is legitimately missing fails as "row not found" — turning a correct
 * structural zero into a fake discrepancy, or masking a real one.
 */
const isAbsentMarker = (rowLabel: unknown): boolean => /^chile\s*\(absent/i.test(String(rowLabel ?? ""));
function findRow(rows: Row[], label: string): { row: Row; index: number } | null {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r && typeof r[0] === "string" && norm(r[0]) === label) return { row: r, index: i };
  }
  return null;
}

// Reproduce the harvest's numeric normalisation + cell classification so a
// freshly-read raw cell maps to the same value the harvest would have stored.
function nlike(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : v === 0 ? 0 : null;
}
function reproduceValue(raw: unknown): number {
  const n = nlike(raw);
  if (n === null) return 0; // blank/absent -> structural zero
  return n > 0 ? n : 0; // <=0 -> structural zero
}

// ---------------------------------------------------------------------------
// INDEPENDENT column resolver.
// sex order in every triplet block is [total, female, male] -> offset 0,1,2.
// ---------------------------------------------------------------------------
const sexOffset = (sex: unknown): number =>
  sex === "female" ? 1 : sex === "male" ? 2 : 0;

const AGE_2_21: Record<string, number> = { "0-5": 2, "6-15": 5, "16-17": 8, "18-64": 11, "65+": 14 };
const AGE_2_41: Record<string, number> = { "0-5": 2, "6-15": 5, "16-17": 8, "18-65": 11, "65+": 14 };
const STAY_2_23: Record<string, number> = { "0-4": 2, "5-9": 5, "10-14": 8, "15-19": 11, "20+": 14 };
const MARITAL_2_22: Record<string, number> = {
  "single": 3,
  "married": 4,
  "married to a Swiss national": 5,
  "widowed": 6,
  "divorced": 7,
  "registered partnership": 8,
  "registered partnership with a Swiss national": 9,
  "dissolved partnership / unmarried": 10,
  "unknown": 11,
};

type Target =
  | { kind: "cell"; sheet: string; rowLabel: string; col: number }
  | { kind: "absent"; sheet: string }
  | { kind: "unmapped"; reason: string };

function resolveTarget(o: Obs): Target {
  const c = o.concept;
  const so = sexOffset(o.dim.sex);

  // Cantonal baseline: Chile row (T/F/M) in a canton sheet of the 2-10 workbook.
  if (c === "Chilean nationals (cantonal comparison)") {
    return { kind: "cell", sheet: o.provenance.sheet, rowLabel: "chile", col: 1 + so };
  }
  // Per-capita denominator: "Gesamttotal" row, first data column.
  if (c === "Foreign residents (per-capita denominator)") {
    return { kind: "cell", sheet: o.provenance.sheet, rowLabel: "gesamttotal", col: 1 };
  }
  // Flow structural-zero total: Chile genuinely absent from the sheet.
  if (isAbsentMarker(o.provenance.rowLabel)) {
    return { kind: "absent", sheet: o.provenance.sheet || "ZG" };
  }

  // The sheet comes from provenance now. It was "ZG" for every cell when the
  // harvest covered one canton; hardcoding it would send all 26 others to the
  // wrong sheet and report every one of them as a mismatch.
  const cell = (col: number): Target => ({ kind: "cell", sheet: o.provenance.sheet || "ZG", rowLabel: "chile", col });

  switch (o.dataset) {
    case "2-10":
      if (c === "Permanent residents") return cell(1 + so);
      if (c === "Permit L (short-term >=12mo)") return cell(4 + so);
      if (c === "Permit B (residence)") return cell(7 + so);
      if (c === "Permit C (settled)") return cell(10 + so);
      if (c === "Non-permanent residents") return cell(13 + so);
      if (c === "Total residents (perm + non-perm)") return cell(16);
      break;
    case "2-20":
      if (c === "Permanent residents") return cell(1 + so);
      if (c === "FZA (free movement)") return cell(4 + so);
      if (c === "AIG (third-country)") return cell(7 + so);
      break;
    case "2-21":
      if (c === "Permanent residents") return cell(1);
      if (typeof o.dim.ageClass === "string" && AGE_2_21[o.dim.ageClass] !== undefined)
        return cell(AGE_2_21[o.dim.ageClass] + so);
      break;
    case "2-22":
      if (c === "Permanent residents") return cell(1);
      // Prefix, not equality: the harvest qualifies this concept
      // ("Born in Switzerland (of Chilean nationality)") and the qualifier has
      // already been reworded once. A stale exact match here falls through to
      // MARITAL_2_22, misses, and reports every one of these cells as an
      // unmapped column — noisy, but at least loud. Cf. isAbsentMarker, where
      // the same staleness fails silently instead.
      if (/^born in switzerland/i.test(c)) return cell(2);
      if (MARITAL_2_22[c] !== undefined) return cell(MARITAL_2_22[c]);
      break;
    case "2-23":
      if (c === "Permanent residents") return cell(1);
      if (typeof o.dim.lengthOfStay === "string" && STAY_2_23[o.dim.lengthOfStay] !== undefined)
        return cell(STAY_2_23[o.dim.lengthOfStay] + so);
      break;
    case "2-40":
      if (c === "Non-permanent residents") return cell(1 + so);
      if (c === "Short-term >4 <12 months") return cell(4 + so);
      if (c === "Service providers <=4 months") return cell(7 + so);
      if (c === "Short-term <=4 months") return cell(10 + so);
      if (c === "Musicians / artists <=8 months") return cell(13 + so);
      break;
    case "2-41":
      if (c === "Non-permanent residents") return cell(1);
      if (typeof o.dim.ageClass === "string" && AGE_2_41[o.dim.ageClass] !== undefined)
        return cell(AGE_2_41[o.dim.ageClass] + so);
      break;
    case "3-30":
      if (c === "Total immigration") return cell(1);
      {
        const map: Record<string, number> = {
          "Quota employment": 2,
          "Non-quota employment": 3,
          "Family reunification": 4,
          "Education and training": 5,
          "Residence without employment": 6,
          "Recognised refugee": 7,
          "Hardship after asylum process": 8,
          "Immigration-law ruling after asylum": 9,
          "Other": 10,
        };
        if (map[c] !== undefined) return cell(map[c]);
      }
      break;
    case "3-31":
      if (c === "Total immigration") return cell(1);
      {
        const map: Record<string, number> = {
          "Quota employment": 2,
          "Non-quota employment": 3,
          "Family reunification": 4,
          "Education and training": 5,
          "Residence without employment": 6,
          "Other": 7,
        };
        if (map[c] !== undefined) return cell(map[c]);
      }
      break;
    case "3-55":
      if (c === "Permanent emigration") return cell(1 + so);
      if (c === "Permit L emigration") return cell(4 + so);
      if (c === "Permit B emigration") return cell(7 + so);
      if (c === "Permit C emigration") return cell(10 + so);
      if (c === "Non-permanent emigration") return cell(13 + so);
      break;
    case "3-60":
      if (c === "Total acquisition of citizenship") return cell(1);
      if (c === "Naturalisations (total)") return cell(2 + so);
      if (c === "Ordinary naturalisations") return cell(5 + so);
      if (c === "Facilitated naturalisations") return cell(8 + so);
      if (c === "Reinstated naturalisations") return cell(11 + so);
      break;
  }
  return { kind: "unmapped", reason: `no column rule for ${o.dataset} / "${c}"` };
}

// Header context at a column (for diagnosing any discrepancy).
function headerContext(rows: Row[], col: number): string {
  const parts: string[] = [];
  for (let i = 2; i <= 4; i++) {
    const v = rows[i]?.[col];
    if (v != null && String(v).trim() !== "") parts.push(String(v).replace(/\s+/g, " ").trim());
  }
  return parts.join(" | ") || "(blank)";
}

interface CheckResult {
  ok: boolean;
  got: number | null;
  note: string;
}

async function checkObs(o: Obs): Promise<CheckResult> {
  const t = resolveTarget(o);
  if (t.kind === "unmapped") return { ok: false, got: null, note: t.reason };

  if (t.kind === "absent") {
    const rows = await getSheetRows(o.provenance.url, t.sheet);
    if (!rows) return { ok: false, got: null, note: `sheet ${t.sheet} missing` };
    const found = findRow(rows, "chile");
    if (found) return { ok: false, got: null, note: `expected Chile ABSENT but found at row ${found.index}` };
    const got = 0; // absent -> structural zero
    return { ok: got === o.value, got, note: "Chile absent -> structural zero" };
  }

  const rows = await getSheetRows(o.provenance.url, t.sheet);
  if (!rows) return { ok: false, got: null, note: `sheet ${t.sheet} missing` };
  const found = findRow(rows, t.rowLabel);
  if (!found) return { ok: false, got: null, note: `row "${t.rowLabel}" not found in sheet ${t.sheet}` };
  const raw = found.row[t.col];
  const got = reproduceValue(raw);
  const ok = got === o.value;
  const note = ok
    ? `col ${t.col} [${headerContext(rows, t.col)}]`
    : `col ${t.col} raw=${JSON.stringify(raw)} hdr=[${headerContext(rows, t.col)}]`;
  return { ok, got, note };
}

// ---------------------------------------------------------------------------
// Anchor -> observation predicate (written independently here).
// ---------------------------------------------------------------------------
function anchorPredicate(label: string): ((o: Obs) => boolean) | null {
  const semLatest = (m: (o: Obs) => boolean) => (o: Obs) =>
    o.source === "SEM" && o.dim.year === 2026 && o.dim.month === 5 && m(o);
  const map: Record<string, (o: Obs) => boolean> = {
    "SEM 2026-05 permanent total": semLatest((o) => o.dataset === "2-10" && o.populationType === "permanent" && o.concept === "Permanent residents" && o.dim.sex === "total"),
    "SEM 2026-05 permanent female": semLatest((o) => o.dataset === "2-10" && o.concept === "Permanent residents" && o.dim.sex === "female"),
    "SEM 2026-05 permit B": semLatest((o) => o.dataset === "2-10" && o.dim.permit === "B" && o.dim.sex === "total"),
    "SEM 2026-05 permit C": semLatest((o) => o.dataset === "2-10" && o.dim.permit === "C" && o.dim.sex === "total"),
    "SEM 2026-05 permit L": semLatest((o) => o.dataset === "2-10" && o.dim.permit === "L" && o.dim.sex === "total"),
    "SEM 2026-05 FZA": semLatest((o) => o.dataset === "2-20" && o.dim.legalBasis === "FZA" && o.dim.sex === "total"),
    "SEM 2026-05 AIG": semLatest((o) => o.dataset === "2-20" && o.dim.legalBasis === "AIG" && o.dim.sex === "total"),
    "SEM 2026-05 married": semLatest((o) => o.dataset === "2-22" && o.dim.marital === "married" && !o.dim.marriedToSwiss),
    "SEM 2026-05 married to Swiss": semLatest((o) => o.dataset === "2-22" && o.dim.marital === "married" && o.dim.marriedToSwiss === true),
    "SEM 2026-05 single": semLatest((o) => o.dataset === "2-22" && o.dim.marital === "single"),
    "SEM 2026-05 age 18-64": semLatest((o) => o.dataset === "2-21" && o.dim.ageClass === "18-64" && o.dim.sex === "total"),
    "SEM 2026-05 age 65+": semLatest((o) => o.dataset === "2-21" && o.dim.ageClass === "65+" && o.dim.sex === "total"),
    "SEM 2026-05 stay 0-4y": semLatest((o) => o.dataset === "2-23" && o.dim.lengthOfStay === "0-4" && o.dim.sex === "total"),
    "SEM 2026-05 stay 20+y": semLatest((o) => o.dataset === "2-23" && o.dim.lengthOfStay === "20+" && o.dim.sex === "total"),
    "SEM 12mo permanent immigration total": (o) => o.dataset === "3-30" && o.metric === "immigration" && o.populationType === "permanent" && o.concept === "Total immigration" && o.dim.year === 2026 && o.dim.month === 5,
    "SEM 12mo non-permanent immigration total": (o) => o.dataset === "3-31" && o.metric === "immigration" && o.populationType === "non_permanent" && o.concept === "Total immigration" && o.dim.year === 2026 && o.dim.month === 5,
    "SEM 12mo permanent emigration": (o) => o.dataset === "3-55" && o.metric === "emigration" && o.populationType === "permanent" && o.concept === "Permanent emigration" && o.dim.sex === "total" && o.dim.year === 2026,
    "SEM 12mo non-permanent emigration": (o) => o.dataset === "3-55" && o.metric === "emigration" && o.populationType === "non_permanent" && o.concept === "Non-permanent emigration" && o.dim.sex === "total" && o.dim.year === 2026,
    "SEM 12mo naturalisations": (o) => o.dataset === "3-60" && o.metric === "naturalisation" && o.dim.year === 2026,
    "SEM cantonal Chile VD": (o) => o.dataset === "2-10" && o.dim.canton === "VD" && o.dim.nationality === "CL" && o.dim.sex === "total" && o.concept === "Chilean nationals (cantonal comparison)",
    "SEM cantonal Chile ZH": (o) => o.dataset === "2-10" && o.dim.canton === "ZH" && o.dim.nationality === "CL" && o.dim.sex === "total" && o.concept === "Chilean nationals (cantonal comparison)",
    "SEM Chile Switzerland total": (o) => o.dataset === "2-10" && o.dim.canton === "CH" && o.dim.nationality === "CL" && o.dim.sex === "total" && o.concept === "Chilean nationals (cantonal comparison)",
  };
  return map[label] ?? null;
}

// ---------------------------------------------------------------------------
// Deterministic sampling: sort by id, take every Nth to reach >=15%, then
// guarantee every dataset + a spread of reference periods + each special
// category is represented.
// ---------------------------------------------------------------------------
function buildSample(eligible: Obs[]): Obs[] {
  const sorted = [...eligible].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const step = 6; // 1/6 = 16.7% >= 15%
  const chosen = new Map<string, Obs>();
  for (let i = 0; i < sorted.length; i += step) chosen.set(sorted[i].id, sorted[i]);

  const ensure = (pred: (o: Obs) => boolean) => {
    if ([...chosen.values()].some(pred)) return;
    const first = sorted.find(pred);
    if (first) chosen.set(first.id, first);
  };
  // Every dataset present.
  for (const ds of new Set(eligible.map((o) => o.dataset))) ensure((o) => o.dataset === ds);
  // A spread of reference periods.
  for (const rd of new Set(eligible.map((o) => o.provenance.referenceDate))) ensure((o) => o.provenance.referenceDate === rd);
  // Special categories.
  ensure((o) => o.concept === "Chilean nationals (cantonal comparison)");
  ensure((o) => o.concept === "Foreign residents (per-capita denominator)");
  ensure((o) => isAbsentMarker(o.provenance.rowLabel));
  return [...chosen.values()];
}

// ---------------------------------------------------------------------------
async function pooled<T, R>(items: T[], worker: (t: T) => Promise<R>): Promise<R[]> {
  // The fetch gate bounds real concurrency; run all and let the gate serialise.
  return Promise.all(items.map(worker));
}

interface Discrepancy {
  kind: "sample" | "anchor";
  dataset: string;
  dim: string;
  expected: number | null;
  got: number | null;
  url: string;
  note: string;
}

/**
 * Load every harvested observation from the per-canton payload files.
 *
 * The harvest used to write one data/harvest.json; it now writes one file per
 * canton under public/data/canton/. This reads all of them and flattens, so the
 * verifier still sees a single list. It decodes the payload with the shared
 * decoder — the only harvest-side code either verifier touches, and only because
 * it is the wire format itself rather than any extraction logic.
 */
function loadAllObservations(): Obs[] {
  const dir = join(process.cwd(), "public", "data", "canton");
  const files = readdirSync(dir).filter((f: string) => f.endsWith(".json")).sort();
  const out: Obs[] = [];
  for (const f of files) {
    const payload = JSON.parse(readFileSync(join(dir, f), "utf8")) as CantonPayload;
    out.push(...(decodeCanton(payload) as unknown as Obs[]));
  }
  return out;
}

async function main(): Promise<void> {
  const harvest = { observations: loadAllObservations() };
  const manifest = JSON.parse(readFileSync(join(DATA, "manifest.json"), "utf8")) as { anchors: Anchor[] };

  const eligible = harvest.observations.filter(
    (o) => o.source === "SEM" && o.value !== null && (o.state === "observed" || o.state === "structural_zero"),
  );
  console.log(`Eligible SEM cells (non-null, observed/structural_zero): ${eligible.length}`);

  const sample = buildSample(eligible);
  const coveragePct = ((sample.length / eligible.length) * 100).toFixed(1);
  console.log(`Sample: ${sample.length} cells (${coveragePct}% of eligible)`);
  const dsInSample = [...new Set(sample.map((o) => o.dataset))].sort();
  const rdInSample = [...new Set(sample.map((o) => o.provenance.referenceDate))].sort();
  // Reported explicitly: these are checked by a different route (confirming Chile
  // is absent from the sheet rather than reading a cell), so if the marker ever
  // stops being recognised the count silently drops to zero. Better to see it.
  const absentInHarvest = eligible.filter((o) => isAbsentMarker(o.provenance.rowLabel)).length;
  const absentInSample = sample.filter((o) => isAbsentMarker(o.provenance.rowLabel)).length;
  console.log(`  absent-from-flow-sheet structural zeros: ${absentInSample} sampled of ${absentInHarvest}`);
  console.log(`  datasets in sample: ${dsInSample.join(", ")}`);
  console.log(`  reference periods in sample: ${rdInSample.length} (${rdInSample[0]} .. ${rdInSample[rdInSample.length - 1]})`);

  // Resolve EVERY eligible cell, not just the sampled ones, and report any that
  // no column rule matches. This costs nothing (it is pure string work) and
  // catches the failure mode that has now bitten twice: the harvest rewords a
  // concept label, the resolver's exact-match rule stops firing, and the fact
  // only surfaces after a full download pass has already been paid for. Cells
  // outside the sample would not surface at all until a later run happened to
  // draw one. VERIFY_PLAN=1 stops here, before any network traffic.
  const planOnly = process.env.VERIFY_PLAN === "1";
  const unmapped = new Map<string, number>();
  for (const o of eligible) {
    const t = resolveTarget(o);
    if (t.kind === "unmapped") {
      const key = `${o.dataset} :: ${o.concept}`;
      unmapped.set(key, (unmapped.get(key) ?? 0) + 1);
    }
  }
  if (unmapped.size === 0) {
    console.log(`  column rules resolve all ${eligible.length} eligible cells`);
  } else {
    const total = [...unmapped.values()].reduce((a, b) => a + b, 0);
    console.log(`  UNMAPPED: ${total} of ${eligible.length} eligible cells have no column rule:`);
    for (const [k, n] of [...unmapped.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${n}x ${k}`);
  }
  if (planOnly) {
    console.log("VERIFY_PLAN=1 — stopping before any network request.");
    process.exit(unmapped.size === 0 ? 0 : 1);
  }

  // ---- Verify sample ----
  const discrepancies: Discrepancy[] = [];
  let samplePass = 0;
  const sampleResults = await pooled(sample, async (o) => ({ o, r: await checkObs(o) }));
  for (const { o, r } of sampleResults) {
    if (r.ok) samplePass++;
    else
      discrepancies.push({
        kind: "sample",
        dataset: o.dataset,
        dim: JSON.stringify(o.dim),
        expected: o.value,
        got: r.got,
        url: o.provenance.url,
        note: r.note,
      });
  }

  // ---- Verify anchors (SEM only) ----
  const semAnchors = manifest.anchors.filter((a) => (a.source || "").startsWith("SEM"));
  let anchorPass = 0;
  const anchorRows: { a: Anchor; got: number | null; ok: boolean; note: string; url: string }[] = [];
  const anchorResults = await pooled(semAnchors, async (a) => {
    const pred = anchorPredicate(a.label);
    if (!pred) return { a, got: null as number | null, ok: false, note: "no predicate mapping for anchor", url: "" };
    const o = eligible.find(pred) ?? harvest.observations.find((x) => x.source === "SEM" && pred(x));
    if (!o) return { a, got: null as number | null, ok: false, note: "no observation matched anchor predicate", url: "" };
    const r = await checkObs(o);
    return { a, got: r.got, ok: r.got === a.expected, note: r.note, url: o.provenance.url };
  });
  for (const row of anchorResults) {
    anchorRows.push(row);
    if (row.ok) anchorPass++;
    else
      discrepancies.push({
        kind: "anchor",
        dataset: row.a.source,
        dim: row.a.label,
        expected: row.a.expected,
        got: row.got,
        url: row.url,
        note: row.note,
      });
  }

  // ---- Console summary ----
  console.log("\n================ VERIFICATION SUMMARY ================");
  console.log(`Sample cells re-fetched & checked: ${sample.length}`);
  console.log(`Coverage of eligible SEM cells:    ${coveragePct}%`);
  console.log(`Sample reproduced:                 ${samplePass}/${sample.length}`);
  console.log(`SEM anchors reproduced:            ${anchorPass}/${semAnchors.length}`);
  console.log(`Distinct SEM files fetched fresh:  ${bufCache.size}`);
  if (discrepancies.length === 0) {
    console.log("Result: ALL SAMPLED CELLS AND ANCHORS REPRODUCED.");
  } else {
    console.log(`Discrepancies: ${discrepancies.length}`);
    for (const d of discrepancies)
      console.log(`  [${d.kind}] ${d.dataset} ${d.dim} expected=${d.expected} got=${d.got}\n      ${d.note}\n      ${d.url}`);
  }

  // ---- Markdown report ----
  const now = new Date().toISOString();
  const allPass = discrepancies.length === 0;
  const verdict = allPass
    ? `**Verdict: PASS.** An independent re-fetch of ${sample.length} SEM cells (${coveragePct}% of the ${eligible.length} eligible non-null SEM observations) and all ${semAnchors.length} SEM anchors was performed directly against the recorded provenance URLs on www.sem.admin.ch, with no use of the local data/raw cache and without importing the harvest's extraction code. Column positions were derived independently from the SEM header rows. Every sampled value and every anchor reproduced exactly, so the SEM portion of the harvest faithfully reflects the published source files.`
    : `**Verdict: ${anchorPass === semAnchors.length && samplePass === sample.length ? "PASS" : "ATTENTION"}.** ${discrepancies.length} discrepancy(ies) were found across ${sample.length} sampled cells and ${semAnchors.length} anchors (see table). Each is analysed below as either a verifier column-inference issue or a genuine harvest error.`;

  const lines: string[] = [];
  lines.push(`# SEM Harvest Verification Report`);
  lines.push("");
  lines.push(`_Generated ${now} by \`scripts/verify.ts\` (independent re-fetch, no local cache)._`);
  lines.push("");
  lines.push(verdict);
  lines.push("");
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Eligible non-null SEM cells | ${eligible.length} |`);
  lines.push(`| Sample size (re-fetched & checked) | ${sample.length} |`);
  lines.push(`| Coverage of eligible SEM cells | ${coveragePct}% |`);
  lines.push(`| Sample cells reproduced | ${samplePass}/${sample.length} |`);
  lines.push(`| SEM anchors reproduced | ${anchorPass}/${semAnchors.length} |`);
  lines.push(`| Distinct SEM files fetched fresh | ${bufCache.size} |`);
  lines.push(`| Absent-from-flow-sheet zeros checked | ${absentInSample} of ${absentInHarvest} |`);
  lines.push(`| Datasets covered | ${dsInSample.join(", ")} |`);
  lines.push(`| Reference periods covered | ${rdInSample.length} (${rdInSample[0]} .. ${rdInSample[rdInSample.length - 1]}) |`);
  lines.push("");
  lines.push(`Sampling method: eligible SEM cells sorted by observation \`id\`, every 6th taken (16.7% >= 15% floor), then augmented to guarantee at least one cell per dataset, per reference period, and per special category (cantonal comparison, per-capita denominator, absent-Chile structural zero). The sample is fully deterministic across runs.`);
  lines.push("");
  lines.push(`## Per-dataset sample coverage`);
  lines.push("");
  lines.push(`| Dataset | Sampled | Reproduced |`);
  lines.push(`| --- | --- | --- |`);
  for (const ds of dsInSample) {
    const rowsForDs = sampleResults.filter((x) => x.o.dataset === ds);
    const pass = rowsForDs.filter((x) => x.r.ok).length;
    lines.push(`| ${ds} | ${rowsForDs.length} | ${pass}/${rowsForDs.length} |`);
  }
  lines.push("");
  lines.push(`## Anchor checks (SEM)`);
  lines.push("");
  lines.push(`| Anchor | Source | Expected | Re-fetched | Result |`);
  lines.push(`| --- | --- | --- | --- | --- |`);
  for (const row of anchorRows) {
    lines.push(`| ${row.a.label} | ${row.a.source} | ${row.a.expected} | ${row.got ?? "—"} | ${row.ok ? "PASS" : "FAIL"} |`);
  }
  lines.push("");
  lines.push(`## Discrepancies`);
  lines.push("");
  if (discrepancies.length === 0) {
    lines.push(`None. Every re-fetched sample cell and every SEM anchor matched.`);
  } else {
    lines.push(`| Kind | Dataset/Source | Dim/Label | Expected (harvest) | Got (fresh) | Note | URL |`);
    lines.push(`| --- | --- | --- | --- | --- | --- | --- |`);
    for (const d of discrepancies) {
      lines.push(`| ${d.kind} | ${d.dataset} | \`${d.dim}\` | ${d.expected} | ${d.got ?? "—"} | ${d.note} | ${d.url} |`);
    }
  }
  lines.push("");
  lines.push(`## Method notes`);
  lines.push("");
  lines.push(`- Every file was fetched with a fresh HTTP GET against \`www.sem.admin.ch\`; the harvest's \`data/raw/\` disk cache was never read. Requests were bounded to <=4 concurrent with a stagger delay and retry-on-failure backoff.`);
  lines.push(`- The ZG sheet (or the recorded canton sheet for cantonal baselines) was parsed fresh; the "Chile" row was matched whitespace-tolerantly, "Gesamttotal" for the per-capita denominator, and Chile-absence confirmed for flow structural-zero totals.`);
  lines.push(`- Column indices were resolved by an independent map in this script, written from a direct reading of the SEM header rows (rows 2-4) and cross-checked against \`scripts/harvest/sem.ts\`. This script does not import or execute the harvest extraction code.`);
  lines.push(`- BFS observations and BFS anchors are out of scope here and \`pxweb.bfs.admin.ch\` was never contacted; they are verified separately by \`scripts/verify-bfs.ts\`, which reports to \`data/verification-bfs.md\`.`);
  lines.push("");

  writeFileSync(join(DATA, "verification-report.md"), lines.join("\n"));
  console.log(`\nReport written to data/verification-report.md`);

  if (discrepancies.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
