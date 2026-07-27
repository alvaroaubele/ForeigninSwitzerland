/**
 * Independent verification of the BFS STATPOP harvest.
 *
 * Companion to `scripts/verify.ts`, which does the same job for SEM. This script
 * does NOT trust data/harvest.json and does NOT import any harvest code — not the
 * fetcher, not the json-stat2 walker, not the cube query definitions. It:
 *
 *   1. re-fetches each cube's METADATA fresh and confirms from the source itself
 *      that the codes the harvest relied on mean what it claimed (8407 = Chile,
 *      ZG = Zug, Bevoelkerungstyp 1 = permanent, and so on),
 *   2. reconstructs the queries from the HARVESTED DIMENSIONS alone, by inverting
 *      dim -> PxWeb code with a map written here from the metadata,
 *   3. re-POSTs those queries fresh (no data/raw cache) and decodes json-stat2
 *      with a decoder written independently in this file,
 *   4. compares every harvested cell against the freshly fetched cell, and checks
 *      each BFS anchor in data/manifest.json against the fresh figure.
 *
 * Coverage is 100% of non-null BFS cells rather than the 15% floor: the cells
 * arrive in rectangular blocks, so checking all of them costs the same handful of
 * requests as checking a sample would.
 *
 * Network: sequential, one request at a time, spaced (see REQUEST_SPACING_MS),
 * issued by curl WITHOUT a custom User-Agent. Both are load-bearing — the WAF in
 * front of pxweb.bfs.admin.ch rejects unrecognised User-Agents and Node's own TLS
 * fingerprint, and answers a burst of rejections with a short connection ban. See
 * the note in README.md. A block page aborts the run rather than being retried.
 *
 * Run:  npx tsx scripts/verify-bfs.ts
 * Writes: data/verification-bfs.md
 */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeCanton, type CantonPayload } from "../lib/payload";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const DATA = join(ROOT, "data");

// ---------------------------------------------------------------------------
// Types (structural — mirrors the harvest output under audit, not imported)
// ---------------------------------------------------------------------------
type Dim = Record<string, string | number | boolean | undefined>;
interface Obs {
  source: string;
  dataset: string;
  metric: string;
  populationType: string;
  dim: Dim;
  value: number | null;
  state: string;
  concept: string;
  provenance: { url: string; referenceDate: string; retrievedAt: string; query?: string; access?: string };
  id: string;
}
interface Anchor {
  label: string;
  expected: number;
  observed: number | null;
  pass: boolean;
  source: string;
}

// ---------------------------------------------------------------------------
// Fresh pxweb client. curl, no cache, one at a time, spaced.
// ---------------------------------------------------------------------------
const HOST = "www.pxweb.bfs.admin.ch";
const REQUEST_SPACING_MS = 6_000;
const TIMEOUT_S = 120;
const MAX_RETRIES = 2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The WAF rejected us. Retrying makes it worse, so this ends the run. */
class BlockedError extends Error {}

let requestCount = 0;
let lastRequestAt = 0;

async function pxRequest(url: string, body?: string): Promise<string> {
  if (new URL(url).host !== HOST) throw new Error(`refusing to fetch non-BFS host: ${url}`);
  const stem = join(tmpdir(), `verify-bfs-${randomBytes(8).toString("hex")}`);
  const outPath = `${stem}.out`;
  const bodyPath = `${stem}.body`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const wait = Math.max(0, lastRequestAt + REQUEST_SPACING_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    requestCount++;
    // No -H "User-Agent": curl's default is on the WAF's allow list and ours is
    // not. Sending an identifying UA here would fail every request with a 400.
    const args = ["-sS", "--max-time", String(TIMEOUT_S), "-o", outPath, "-w", "%{http_code}"];
    if (body !== undefined) {
      writeFileSync(bodyPath, body, "utf8");
      args.push("-H", "Content-Type: application/json", "-X", "POST", "--data-binary", `@${bodyPath}`);
    }
    args.push(url);
    try {
      const { stdout } = await execFileAsync("curl", args, { maxBuffer: 1 << 26 });
      const status = Number(stdout.trim().slice(-3));
      const text = existsSync(outPath) ? readFileSync(outPath, "utf8") : "";
      const looksHtml = /^\s*<(!doctype html|html)/i.test(text.slice(0, 200));
      if (status >= 400 && looksHtml) {
        throw new BlockedError(
          `${url} answered ${status} with an HTML block page (${text.length} bytes). The request was ` +
            `rejected on its client fingerprint, not its content — see README.md.`,
        );
      }
      if (status !== 200) throw new Error(`HTTP ${status} from ${url}`);
      if (text.length === 0) throw new Error(`empty body from ${url}`);
      return text;
    } catch (err) {
      if (err instanceof BlockedError) throw err;
      if (attempt === MAX_RETRIES) throw err;
      await sleep(10_000 * 2 ** attempt);
    } finally {
      rmSync(outPath, { force: true });
      rmSync(bodyPath, { force: true });
    }
  }
  throw new Error("unreachable");
}

const cubeUrl = (cube: string) => `https://${HOST}/api/v1/de/${cube}/${cube}.px`;

// ---------------------------------------------------------------------------
// Cube metadata — the independent evidence that the codes mean what we assumed.
// ---------------------------------------------------------------------------
interface PxVariable {
  code: string;
  text: string;
  values: string[];
  valueTexts: string[];
}
interface PxMeta {
  title: string;
  variables: PxVariable[];
}

async function fetchMeta(cube: string): Promise<PxMeta> {
  return JSON.parse(await pxRequest(cubeUrl(cube))) as PxMeta;
}

/** Look up the source's own label for a value code, for the evidence table. */
function labelOf(meta: PxMeta, varCode: string, valueCode: string): string {
  const v = meta.variables.find((x) => x.code === varCode);
  if (!v) return "(variable absent)";
  const i = v.values.indexOf(valueCode);
  return i < 0 ? "(code absent)" : v.valueTexts[i];
}

// ---------------------------------------------------------------------------
// Independent json-stat2 decoder.
//
// Written from the json-stat2 spec rather than adapted from the harvest's walker:
// `value` is a dense row-major array over the dimensions listed in `id`, sized by
// `size`. Here the strides are computed explicitly and each cell's coordinate is
// read off by integer division, which is a different formulation from the
// harvest's successive-remainder loop — if either had a stride bug they would
// disagree.
// ---------------------------------------------------------------------------
interface JsonStat2 {
  id: string[];
  size: number[];
  dimension: Record<string, { category: { index: Record<string, number>; label: Record<string, string> } }>;
  value: (number | null)[];
  status?: Record<string, string>;
}

interface FreshCell {
  coord: Record<string, string>;
  value: number | null;
  status?: string;
}

function decode(js: JsonStat2): FreshCell[] {
  const dims = js.id;
  const codes: string[][] = dims.map((d) => {
    const index = js.dimension[d].category.index;
    const out: string[] = [];
    for (const [code, pos] of Object.entries(index)) out[pos] = code;
    return out;
  });
  // stride[i] = product of the sizes to the RIGHT of dimension i (row-major)
  const stride: number[] = new Array(dims.length).fill(1);
  for (let i = dims.length - 2; i >= 0; i--) stride[i] = stride[i + 1] * js.size[i + 1];
  const total = js.size.reduce((a, b) => a * b, 1);
  if (total !== js.value.length) {
    throw new Error(`json-stat2 size product ${total} != value array length ${js.value.length}`);
  }
  const cells: FreshCell[] = [];
  for (let flat = 0; flat < total; flat++) {
    const coord: Record<string, string> = {};
    for (let i = 0; i < dims.length; i++) {
      coord[dims[i]] = codes[i][Math.floor(flat / stride[i]) % js.size[i]];
    }
    cells.push({ coord, value: js.value[flat] ?? null, status: js.status?.[String(flat)] });
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Inverse map: harvested dimensions -> PxWeb value codes.
//
// Written here from the cube metadata (and confirmed against it at run time by
// `checkCodeEvidence`). This is the direction the harvest never computes — it only
// ever goes code -> dim — so an error in the harvest's forward map shows up as a
// coordinate that either misses or lands on a different fresh value.
// ---------------------------------------------------------------------------
const TOTAL = "-99999";
const CHILE = "8407";
const SWITZERLAND = "8100";

const SEX_CODE: Record<string, string> = { total: TOTAL, male: "1", female: "2" };
const POP_CODE: Record<string, string> = { permanent: "1", non_permanent: "2" };
const PERMIT_CODE: Record<string, string> = { B: "2", C: "3", Ci: "4", F: "5", L: "7", N: "8", S: "9" };
const MARITAL_CODE: Record<string, string> = {
  single: "1",
  married: "2",
  widowed: "3",
  divorced: "4",
  unknown: "-9",
};
const NATGROUP_CODE: Record<string, string> = {
  total: TOTAL,
  Swiss: "1",
  EU: "2",
  EFTA: "3",
  "Other Europe": "4",
  Africa: "5",
  "North America": "6",
  "Latin America & Caribbean": "7",
  Asia: "8",
  Oceania: "9",
  Stateless: "-1",
  Unknown: "-9",
};

/** "35-39" -> "35", "100+" -> "100", absent -> the dimension total. */
function ageCode(ageClass: unknown): string {
  if (typeof ageClass !== "string") return TOTAL;
  if (ageClass === "total") return TOTAL;
  if (ageClass === "100+") return "100";
  const start = ageClass.split("-")[0];
  if (!/^\d+$/.test(start)) throw new Error(`unmappable ageClass ${JSON.stringify(ageClass)}`);
  return start;
}

function lookup(map: Record<string, string>, key: unknown, what: string): string {
  if (key === undefined) return TOTAL;
  const code = map[String(key)];
  if (code === undefined) throw new Error(`unmappable ${what}: ${JSON.stringify(key)}`);
  return code;
}

/** Every dimension of a cube, in the order the query lists them. */
const CUBE_DIMS: Record<string, string[]> = {
  "px-x-0103010000_101": [
    "Jahr", "Kanton", "Bevölkerungstyp", "Anwesenheitsbewilligung", "Geschlecht",
    "Altersklasse", "Staatsangehörigkeit",
  ],
  "px-x-0103010000_399": [
    "Jahr", "Kanton", "Bevölkerungstyp", "Staatsangehörigkeit (Auswahl)", "Geburtsstaat",
    "Geschlecht", "Altersklasse",
  ],
  "px-x-0103010000_423": [
    "Jahr", "Kanton", "Bevölkerungstyp", "Staatsangehörigkeit", "Geburtsstaat",
    "Geschlecht", "Zivilstand",
  ],
};

function coordFor(o: Obs): Record<string, string> {
  const d = o.dim;
  const canton = d.canton === "CH" ? SWITZERLAND : String(d.canton);
  const base: Record<string, string> = {
    Jahr: String(d.year),
    Kanton: canton,
    Bevölkerungstyp: lookup(POP_CODE, o.populationType, "populationType"),
    Geschlecht: lookup(SEX_CODE, d.sex, "sex"),
  };
  switch (o.dataset) {
    case "px-x-0103010000_101":
      return {
        ...base,
        Anwesenheitsbewilligung: lookup(PERMIT_CODE, d.permit, "permit"),
        Altersklasse: ageCode(d.ageClass),
        // "total" here is the all-nationalities total, not a missing value.
        Staatsangehörigkeit: d.nationality === "CL" ? CHILE : d.nationality === "CH" ? SWITZERLAND : TOTAL,
      };
    case "px-x-0103010000_399":
      return {
        ...base,
        "Staatsangehörigkeit (Auswahl)": lookup(NATGROUP_CODE, d.nationalityGroup, "nationalityGroup"),
        Geburtsstaat: CHILE, // every cell in this cube's harvest is Chile-born
        Altersklasse: ageCode(d.ageClass),
      };
    case "px-x-0103010000_423":
      return {
        ...base,
        Staatsangehörigkeit: d.nationality === "CL" ? CHILE : TOTAL,
        // birthCountry "any" is the dimension total (born anywhere), not Chile.
        Geburtsstaat: d.birthCountry === "CL" ? CHILE : TOTAL,
        Zivilstand: lookup(MARITAL_CODE, d.marital, "marital"),
      };
    default:
      throw new Error(`unknown cube ${o.dataset}`);
  }
}

const coordKey = (cube: string, coord: Record<string, string>): string =>
  `${cube}|` + CUBE_DIMS[cube].map((d) => `${d}=${coord[d]}`).join(";");

// ---------------------------------------------------------------------------
// Query blocks. Cells are grouped by (cube, concept) and each group's query is
// the per-dimension union of its coordinates — which reconstructs the rectangular
// slice the cells came from without reading the harvest's query definitions.
// ---------------------------------------------------------------------------
interface Block {
  cube: string;
  concept: string;
  query: { code: string; selection: { filter: "item"; values: string[] } }[];
  cells: number;
  expectedResponseCells: number;
}

const numericish = (a: string, b: string) =>
  /^-?\d+$/.test(a) && /^-?\d+$/.test(b) ? Number(a) - Number(b) : a < b ? -1 : a > b ? 1 : 0;

function buildBlocks(obs: Obs[], coords: Map<string, Record<string, string>>): Block[] {
  const groups = new Map<string, Obs[]>();
  for (const o of obs) {
    const k = `${o.dataset}::${o.concept}`;
    const g = groups.get(k);
    if (g) g.push(o);
    else groups.set(k, [o]);
  }
  const blocks: Block[] = [];
  for (const [k, members] of groups) {
    const cube = members[0].dataset;
    const dims = CUBE_DIMS[cube];
    const union: Record<string, Set<string>> = {};
    for (const d of dims) union[d] = new Set();
    for (const o of members) {
      const c = coords.get(o.id)!;
      for (const d of dims) union[d].add(c[d]);
    }
    const query = dims.map((d) => ({
      code: d,
      selection: { filter: "item" as const, values: [...union[d]].sort(numericish) },
    }));
    blocks.push({
      cube,
      concept: k.split("::")[1],
      query,
      cells: members.length,
      expectedResponseCells: query.reduce((n, q) => n * q.selection.values.length, 1),
    });
  }
  return blocks.sort((a, b) => a.expectedResponseCells - b.expectedResponseCells);
}

// ---------------------------------------------------------------------------
// Anchors — predicates written here, independently of the harvest's anchor code.
// ---------------------------------------------------------------------------
const zugNationals = (year: number) => (o: Obs) =>
  o.dataset === "px-x-0103010000_101" &&
  o.dim.year === year &&
  o.dim.canton === "ZG" &&
  o.dim.nationality === "CL" &&
  o.populationType === "permanent" &&
  o.dim.sex === "total" &&
  o.dim.permit === undefined &&
  o.dim.ageClass === undefined;

const zugBorn = (group: string) => (o: Obs) =>
  o.dataset === "px-x-0103010000_399" &&
  o.dim.canton === "ZG" &&
  o.dim.year === 2024 &&
  o.dim.birthCountry === "CL" &&
  o.dim.nationalityGroup === group &&
  o.populationType === "permanent" &&
  o.dim.sex === "total" &&
  o.dim.ageClass === undefined;

// Labels follow the harvest's national renaming ("BFS 2024..." became
// "Zug BFS 2024...", plus new national anchors). Predicates already name their
// canton — zugNationals/zugBorn pin ZG — which the flattened 27-canton list now
// makes load-bearing rather than redundant.
const ANCHOR_PREDICATES: Record<string, (o: Obs) => boolean> = {
  "Zug BFS 2024 Chilean nationals (perm)": zugNationals(2024),
  "Zug BFS 2017 Chilean nationals (perm)": zugNationals(2017),
  "Zug BFS 2020 Chilean nationals (perm)": zugNationals(2020),
  "Zug BFS 2024 Chilean-born (perm)": zugBorn("total"),
  "Zug BFS 2024 Chilean-born Swiss passport": zugBorn("Swiss"),
  "Zug BFS 2024 Chilean-born LatAm passport": zugBorn("Latin America & Caribbean"),
  "Zug BFS 2024 Chilean-born EU passport": zugBorn("EU"),
  "Zug BFS 2023 Chilean nationals born in Chile": (o) =>
    o.dataset === "px-x-0103010000_423" &&
    o.dim.canton === "ZG" &&
    o.dim.year === 2023 &&
    o.dim.nationality === "CL" &&
    o.dim.birthCountry === "CL" &&
    o.populationType === "permanent" &&
    o.dim.sex === "total" &&
    o.dim.marital === undefined,
  "Switzerland BFS 2024 Chilean nationals (perm)": (o) =>
    o.dataset === "px-x-0103010000_101" &&
    o.dim.canton === "CH" &&
    o.dim.year === 2024 &&
    o.dim.nationality === "CL" &&
    o.populationType === "permanent" &&
    o.dim.sex === "total" &&
    o.dim.permit === undefined &&
    o.dim.ageClass === undefined,
};

// ---------------------------------------------------------------------------
interface Discrepancy {
  kind: "cell" | "anchor" | "code";
  cube: string;
  what: string;
  expected: number | string | null;
  got: number | string | null;
  note: string;
}

/** Confirm from the metadata that the codes the harvest leaned on are what it thought. */
function checkCodeEvidence(
  metas: Map<string, PxMeta>,
): { rows: string[][]; problems: Discrepancy[] } {
  const claims: { cube: string; variable: string; code: string; expect: RegExp; meaning: string }[] = [
    { cube: "px-x-0103010000_101", variable: "Staatsangehörigkeit", code: CHILE, expect: /chile/i, meaning: "Chile" },
    { cube: "px-x-0103010000_101", variable: "Kanton", code: "ZG", expect: /zug/i, meaning: "Canton Zug" },
    { cube: "px-x-0103010000_101", variable: "Kanton", code: SWITZERLAND, expect: /schweiz/i, meaning: "Switzerland" },
    { cube: "px-x-0103010000_101", variable: "Bevölkerungstyp", code: "1", expect: /ständige/i, meaning: "permanent resident population" },
    { cube: "px-x-0103010000_101", variable: "Bevölkerungstyp", code: "2", expect: /nichtständige/i, meaning: "non-permanent resident population" },
    { cube: "px-x-0103010000_101", variable: "Geschlecht", code: "1", expect: /mann|männlich/i, meaning: "male" },
    { cube: "px-x-0103010000_101", variable: "Geschlecht", code: "2", expect: /frau|weiblich/i, meaning: "female" },
    { cube: "px-x-0103010000_101", variable: "Anwesenheitsbewilligung", code: "2", expect: /aufenthalter|\bB\b/i, meaning: "permit B" },
    { cube: "px-x-0103010000_101", variable: "Anwesenheitsbewilligung", code: "3", expect: /niedergelassen|\bC\b/i, meaning: "permit C" },
    { cube: "px-x-0103010000_399", variable: "Geburtsstaat", code: CHILE, expect: /chile/i, meaning: "born in Chile" },
    { cube: "px-x-0103010000_399", variable: "Staatsangehörigkeit (Auswahl)", code: "1", expect: /schweiz/i, meaning: "Swiss passport" },
    { cube: "px-x-0103010000_399", variable: "Staatsangehörigkeit (Auswahl)", code: "7", expect: /latein|karib/i, meaning: "Latin America & Caribbean passport" },
    { cube: "px-x-0103010000_423", variable: "Zivilstand", code: "2", expect: /verheiratet/i, meaning: "married" },
    { cube: "px-x-0103010000_423", variable: "Geburtsstaat", code: CHILE, expect: /chile/i, meaning: "born in Chile" },
  ];
  const rows: string[][] = [];
  const problems: Discrepancy[] = [];
  for (const c of claims) {
    const meta = metas.get(c.cube);
    if (!meta) continue;
    const label = labelOf(meta, c.variable, c.code);
    const ok = c.expect.test(label);
    rows.push([c.cube.replace("px-x-0103010000_", ""), c.variable, c.code, c.meaning, label, ok ? "OK" : "MISMATCH"]);
    if (!ok) {
      problems.push({
        kind: "code",
        cube: c.cube,
        what: `${c.variable} = ${c.code}`,
        expected: c.meaning,
        got: label,
        note: "the source's own label for this code does not match the meaning the harvest assigned it",
      });
    }
  }
  return { rows, problems };
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

  const bfs = harvest.observations.filter(
    (o) => o.source === "BFS" && o.value !== null && (o.state === "observed" || o.state === "structural_zero"),
  );
  console.log(`Eligible BFS cells (non-null, observed/structural_zero): ${bfs.length}`);

  // Invert every cell's dimensions to a cube coordinate up front, so an
  // unmappable dimension is a hard error before any network traffic happens.
  const coords = new Map<string, Record<string, string>>();
  const unmappable: Discrepancy[] = [];
  for (const o of bfs) {
    try {
      coords.set(o.id, coordFor(o));
    } catch (err) {
      unmappable.push({
        kind: "cell",
        cube: o.dataset,
        what: JSON.stringify(o.dim),
        expected: o.value,
        got: null,
        note: `could not invert dimensions to a cube coordinate: ${String(err)}`,
      });
    }
  }
  console.log(`Coordinates derived: ${coords.size}; unmappable: ${unmappable.length}`);

  const blocks = buildBlocks(
    bfs.filter((o) => coords.has(o.id)),
    coords,
  );
  console.log(`Query blocks: ${blocks.length} (${blocks.reduce((n, b) => n + b.expectedResponseCells, 0)} cells requested)`);

  // Offline plan mode: show what would be asked for, and stop before any network
  // traffic. The dimension inversion is where this script could go wrong most
  // quietly, so it is worth being able to read the plan on its own.
  if (process.env.VERIFY_BFS_PLAN) {
    for (const b of blocks) {
      console.log(`\n${b.cube}  ${b.concept}`);
      console.log(`  ${b.cells} harvested cells -> query for ${b.expectedResponseCells} cells`);
      for (const q of b.query) {
        const v = q.selection.values;
        console.log(`    ${q.code}: ${v.length <= 8 ? v.join(", ") : `${v.slice(0, 6).join(", ")}, … (${v.length})`}`);
      }
    }
    for (const d of unmappable) console.log(`\nUNMAPPABLE ${d.cube} ${d.what}\n  ${d.note}`);
    console.log(`\nPlan only (VERIFY_BFS_PLAN set) — no requests issued.`);
    return;
  }

  // ---- Metadata (independent evidence for the code meanings) ----
  const cubes = [...new Set(bfs.map((o) => o.dataset))].sort();
  const metas = new Map<string, PxMeta>();
  for (const cube of cubes) {
    process.stdout.write(`  metadata ${cube} … `);
    const meta = await fetchMeta(cube);
    metas.set(cube, meta);
    console.log(`"${meta.title.slice(0, 60)}…" (${meta.variables.length} variables)`);
  }
  const evidence = checkCodeEvidence(metas);

  // ---- Re-fetch every block and index the fresh cells by coordinate ----
  const fresh = new Map<string, FreshCell>();
  const blockRows: { block: Block; returned: number; ok: boolean; note: string }[] = [];
  for (const b of blocks) {
    process.stdout.write(`  ${b.cube.replace("px-x-0103010000_", "")} ${b.concept.slice(0, 46)} … `);
    try {
      const text = await pxRequest(
        cubeUrl(b.cube),
        JSON.stringify({ query: b.query, response: { format: "json-stat2" } }),
      );
      const cells = decode(JSON.parse(text) as JsonStat2);
      for (const c of cells) fresh.set(coordKey(b.cube, c.coord), c);
      blockRows.push({ block: b, returned: cells.length, ok: true, note: "" });
      console.log(`${cells.length} cells`);
    } catch (err) {
      if (err instanceof BlockedError) throw err;
      blockRows.push({ block: b, returned: 0, ok: false, note: String(err) });
      console.log(`FAILED: ${String(err)}`);
    }
  }

  // ---- Compare ----
  const discrepancies: Discrepancy[] = [...unmappable, ...evidence.problems];
  let pass = 0;
  let notReturned = 0;
  const perCube = new Map<string, { checked: number; pass: number }>();
  for (const o of bfs) {
    const coord = coords.get(o.id);
    if (!coord) continue;
    const f = fresh.get(coordKey(o.dataset, coord));
    const tally = perCube.get(o.dataset) ?? { checked: 0, pass: 0 };
    perCube.set(o.dataset, tally);
    if (!f) {
      notReturned++;
      discrepancies.push({
        kind: "cell",
        cube: o.dataset,
        what: JSON.stringify(o.dim),
        expected: o.value,
        got: null,
        note: "no cell at this coordinate in the fresh response (block fetch failed, or the coordinate does not exist)",
      });
      continue;
    }
    tally.checked++;
    // The harvest records a null cube value as a structural zero; reproduce that
    // rule here so a genuine 0 and an absent figure are compared on equal terms.
    const got = f.value ?? 0;
    if (got === o.value) {
      pass++;
      tally.pass++;
    } else {
      discrepancies.push({
        kind: "cell",
        cube: o.dataset,
        what: JSON.stringify(o.dim),
        expected: o.value,
        got: f.value,
        note: `fresh cell at ${coordKey(o.dataset, coords.get(o.id)!)}${f.status ? ` status="${f.status}"` : ""}`,
      });
    }
  }

  // ---- Anchors ----
  const bfsAnchors = manifest.anchors.filter((a) => (a.source || "").startsWith("BFS"));
  const anchorRows: { a: Anchor; got: number | null; ok: boolean; note: string }[] = [];
  let anchorPass = 0;
  for (const a of bfsAnchors) {
    const pred = ANCHOR_PREDICATES[a.label];
    if (!pred) {
      anchorRows.push({ a, got: null, ok: false, note: "no independent predicate written for this anchor" });
      continue;
    }
    // An anchor names a figure, not a row: the harvest emits that same BFS cell
    // once per breakdown series it heads (the 2024 Zug total appears under "by
    // year", "by permit", "by sex", "by age class" and "by canton"). So several
    // matches are expected and correct. What would be wrong is matches that
    // disagree — either on the value or on the PxWeb coordinate they invert to —
    // since that would mean one series is carrying a different number under the
    // same description. Check for that instead of demanding a unique row.
    const matches = bfs.filter(pred);
    if (matches.length === 0) {
      anchorRows.push({ a, got: null, ok: false, note: "predicate matched no observation" });
      continue;
    }
    const keys = new Set(
      matches.map((m) => {
        const c = coords.get(m.id);
        return c ? coordKey(m.dataset, c) : `«${m.id} has no coordinate»`;
      }),
    );
    const values = new Set(matches.map((m) => m.value));
    if (keys.size !== 1 || values.size !== 1) {
      anchorRows.push({
        a,
        got: null,
        ok: false,
        note:
          `predicate matched ${matches.length} observations that disagree — ` +
          `${values.size} distinct value(s) {${[...values].join(", ")}}, ` +
          `${keys.size} distinct coordinate(s)`,
      });
      continue;
    }
    const coord = coords.get(matches[0].id);
    const f = coord ? fresh.get(coordKey(matches[0].dataset, coord)) : undefined;
    const got = f ? (f.value ?? 0) : null;
    const ok = got === a.expected;
    if (ok) anchorPass++;
    const where = coord ? CUBE_DIMS[matches[0].dataset].map((d) => `${d}=${coord[d]}`).join(" ") : "no coordinate";
    anchorRows.push({
      a,
      got,
      ok,
      note: matches.length === 1 ? where : `${where} (${matches.length} concepts agree)`,
    });
  }
  for (const row of anchorRows) {
    if (!row.ok)
      discrepancies.push({
        kind: "anchor",
        cube: row.a.source,
        what: row.a.label,
        expected: row.a.expected,
        got: row.got,
        note: row.note,
      });
  }

  // ---- Console summary ----
  const pct = bfs.length ? ((pass / bfs.length) * 100).toFixed(1) : "0.0";
  console.log("\n============== BFS VERIFICATION SUMMARY ==============");
  console.log(`Eligible BFS cells:            ${bfs.length}`);
  console.log(`Re-fetched & reproduced:       ${pass} (${pct}%)`);
  console.log(`Coordinates not returned:      ${notReturned}`);
  console.log(`BFS anchors reproduced:        ${anchorPass}/${bfsAnchors.length}`);
  console.log(`Code-meaning claims confirmed: ${evidence.rows.filter((r) => r[5] === "OK").length}/${evidence.rows.length}`);
  console.log(`HTTP requests to ${HOST}: ${requestCount}`);
  if (discrepancies.length === 0) console.log("Result: ALL BFS CELLS AND ANCHORS REPRODUCED.");
  else {
    console.log(`Discrepancies: ${discrepancies.length}`);
    for (const d of discrepancies.slice(0, 40))
      console.log(`  [${d.kind}] ${d.cube} ${d.what} expected=${d.expected} got=${d.got}\n      ${d.note}`);
  }

  // ---- Markdown report ----
  const allPass = discrepancies.length === 0;
  const lines: string[] = [];
  lines.push("# BFS Harvest Verification Report");
  lines.push("");
  lines.push(`_Generated ${new Date().toISOString()} by \`scripts/verify-bfs.ts\` (independent re-fetch, no local cache)._`);
  lines.push("");
  lines.push(
    allPass
      ? `**Verdict: PASS.** All ${bfs.length} non-null BFS cells (100% — not a sample) and all ${bfsAnchors.length} BFS anchors were re-fetched directly from \`${HOST}\` and reproduced exactly. Queries were reconstructed by inverting the harvested dimensions back to PxWeb codes with a map written in this script; json-stat2 was decoded by a decoder written in this script; the harvest's fetcher, walker, and query definitions were not imported. Each cube's metadata was also re-fetched and the source's own labels confirm the code meanings the harvest relied on.`
      : `**Verdict: ATTENTION.** ${discrepancies.length} discrepancy(ies) across ${bfs.length} cells, ${bfsAnchors.length} anchors and ${evidence.rows.length} code-meaning claims. See the tables below.`,
  );
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Eligible non-null BFS cells | ${bfs.length} |`);
  lines.push(`| Cells re-fetched and reproduced | ${pass} (${pct}%) |`);
  lines.push(`| Coordinates absent from the fresh response | ${notReturned} |`);
  lines.push(`| BFS anchors reproduced | ${anchorPass}/${bfsAnchors.length} |`);
  lines.push(`| Code-meaning claims confirmed from metadata | ${evidence.rows.filter((r) => r[5] === "OK").length}/${evidence.rows.length} |`);
  lines.push(`| HTTP requests issued | ${requestCount} (sequential, ${REQUEST_SPACING_MS / 1000}s apart) |`);
  lines.push("");
  lines.push("## Per-cube reproduction");
  lines.push("");
  lines.push("| Cube | Cells checked | Reproduced |");
  lines.push("| --- | --- | --- |");
  for (const cube of cubes) {
    const t = perCube.get(cube) ?? { checked: 0, pass: 0 };
    lines.push(`| \`${cube}\` | ${t.checked} | ${t.pass}/${t.checked} |`);
  }
  lines.push("");
  lines.push("## Code meanings, confirmed against cube metadata");
  lines.push("");
  lines.push("The harvest assigns meaning to bare numeric codes. These are the source's own labels for them, re-fetched fresh:");
  lines.push("");
  lines.push("| Cube | Variable | Code | Harvest's meaning | Label published by BFS | |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const r of evidence.rows) lines.push(`| ${r[0]} | ${r[1]} | \`${r[2]}\` | ${r[3]} | ${r[4]} | ${r[5]} |`);
  lines.push("");
  lines.push("## Query blocks re-issued");
  lines.push("");
  lines.push("Each block is the per-dimension union of the coordinates of the cells that claim to come from it — reconstructed from the harvested data, not copied from the harvest's query definitions.");
  lines.push("");
  lines.push("| Cube | Concept | Harvested cells | Cells returned fresh | |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const r of blockRows)
    lines.push(
      `| ${r.block.cube.replace("px-x-0103010000_", "")} | ${r.block.concept} | ${r.block.cells} | ${r.returned} | ${r.ok ? "OK" : "FAILED"} |`,
    );
  lines.push("");
  lines.push("## Anchor checks (BFS)");
  lines.push("");
  lines.push("| Anchor | Source | Expected | Re-fetched | Result |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const row of anchorRows)
    lines.push(`| ${row.a.label} | ${row.a.source} | ${row.a.expected} | ${row.got ?? "—"} | ${row.ok ? "PASS" : "FAIL"} |`);
  lines.push("");
  lines.push("## Discrepancies");
  lines.push("");
  if (discrepancies.length === 0) lines.push("None. Every re-fetched cell, every anchor, and every code meaning matched.");
  else {
    lines.push("| Kind | Cube/Source | Dim/Label | Expected (harvest) | Got (fresh) | Note |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const d of discrepancies)
      lines.push(`| ${d.kind} | ${d.cube} | \`${d.what}\` | ${d.expected} | ${d.got ?? "—"} | ${d.note} |`);
  }
  lines.push("");
  lines.push("## Method notes");
  lines.push("");
  lines.push(`- Every request was a fresh HTTPS call to \`${HOST}\`; the harvest's \`data/raw/\` cache was never read.`);
  lines.push("- This script imports nothing from `scripts/harvest/`. The json-stat2 decoder computes row-major strides explicitly (a different formulation from the harvest's successive-remainder walker), and the dimension→code map is the inverse direction of the one the harvest uses, so a stride or mapping error in either would surface as a mismatch rather than cancel out.");
  lines.push("- Requests were issued one at a time, spaced, by `curl` with its default User-Agent. Both matter: the WAF in front of the host rejects unrecognised User-Agents and Node's TLS fingerprint outright, and answers a burst of rejections with a short connection-level ban. A block page aborts this script instead of being retried.");
  lines.push("- A null cube value is compared as 0, matching the harvest's rule that an absent register figure at this level is a structural zero rather than a suppression.");
  lines.push("");

  writeFileSync(join(DATA, "verification-bfs.md"), lines.join("\n"));
  console.log("\nReport written to data/verification-bfs.md");
  if (discrepancies.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
