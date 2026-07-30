/**
 * Independent BFS verification — every nationality edition.
 *
 * The harvest reads BFS STATPOP from the full PC-Axis cube downloads. This
 * verifier takes the OTHER route to the same figures: the PxWeb json-stat2
 * POST API, queried per nationality with its own query construction and its
 * own coordinate mapping. It never reads data/raw, never imports the
 * harvest's extraction code, and touches exactly one piece of shared code —
 * lib/payload.ts's decoder, which is the wire format itself.
 *
 * Coverage model: nationalities are sampled (the Chile regression baseline is
 * always in), and for each sampled nationality every cell the API answers in
 * the queried slice shapes is compared — value for value, suppression for
 * suppression — against the decoded payload files. VERIFY_BFS_NATS overrides
 * the sample; VERIFY_BFS_PLAN=1 stops before any network request.
 *
 * Network: sequential POSTs via curl without a custom User-Agent (the WAF in
 * front of pxweb.bfs.admin.ch rejects Node's TLS fingerprint and unknown
 * User-Agents), spaced SPACING_MS apart.
 *
 * Writes data/verification-bfs.md.
 */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { decodeCanton, type CantonPayload } from "../lib/payload";
import type { Observation } from "../lib/types";

const execFileAsync = promisify(execFile);
const DATA = join(process.cwd(), "data");
const NAT_DIR = join(process.cwd(), "public", "data", "nat");

const CUBE_101 = "px-x-0103010000_101";
const CUBE_399 = "px-x-0103010000_399";
const CUBE_423 = "px-x-0103010000_423";
const API = (cube: string) => `https://www.pxweb.bfs.admin.ch/api/v1/de/${cube}/${cube}.px`;

// Spacing between live POSTs — the endpoint tarpits bursts.
const SPACING_MS = Number(process.env.VERIFY_BFS_SPACING_MS ?? 25_000);

// ---------------------------------------------------------------------------
// Own maps (deliberately written here, not imported from the harvest).
// ---------------------------------------------------------------------------
const TOTAL = "-99999";
const SEX: Record<string, string> = { "-99999": "total", "1": "male", "2": "female" };
const PERMIT: Record<string, string> = { "2": "B", "3": "C", "4": "Ci", "5": "F", "7": "L", "8": "N", "9": "S" };
const NATGROUP: Record<string, string> = {
  "-99999": "total", "1": "Swiss", "2": "EU", "3": "EFTA", "4": "Other Europe", "5": "Africa",
  "6": "North America", "7": "Latin America & Caribbean", "8": "Asia", "9": "Oceania",
  "-1": "Stateless", "-9": "Unknown",
};
const MARITAL: Record<string, string> = {
  "-99999": "total", "1": "single", "2": "married", "3": "widowed", "4": "divorced", "-9": "unknown",
};
const AGES = ["-99999", "0", "5", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55", "60", "65", "70", "75", "80", "85", "90", "95", "100"];
const ageLabel = (code: string) => (code === "100" ? "100+" : `${Number(code)}-${Number(code) + 4}`);

interface Registry {
  entries: { code: string; bfs101?: string; bfs399Birth?: string; bfs423Nat?: string; bfs423Birth?: string }[];
}

// ---------------------------------------------------------------------------
// PxWeb POST via curl.
// ---------------------------------------------------------------------------
interface JsonStat2 {
  id: string[];
  size: number[];
  dimension: Record<string, { category: { index: Record<string, number> } }>;
  value: (number | null)[];
  status?: Record<string, string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let firstPost = true;

async function postQuery(cube: string, query: object[]): Promise<JsonStat2> {
  if (!firstPost) await sleep(SPACING_MS);
  firstPost = false;
  const body = JSON.stringify({ query, response: { format: "json-stat2" } });
  const stem = join(tmpdir(), `vbfs-${randomBytes(6).toString("hex")}`);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await sleep(30_000 * attempt);
    try {
      writeFileSync(`${stem}.body`, body);
      const { stdout } = await execFileAsync("curl", [
        "-sS", "--max-time", "120", "-o", `${stem}.out`, "-w", "%{http_code}",
        "-H", "Content-Type: application/json",
        "-X", "POST", "--data-binary", `@${stem}.body`, API(cube),
      ], { maxBuffer: 1 << 20 });
      const status = Number(stdout.trim().slice(-3));
      const buf = readFileSync(`${stem}.out`);
      if (status !== 200 || buf.length === 0) throw new Error(`HTTP ${status}`);
      const head = buf.subarray(0, 100).toString("latin1").trimStart().toLowerCase();
      if (head.startsWith("<")) throw new Error("block page");
      return JSON.parse(buf.toString("utf8")) as JsonStat2;
    } catch (err) {
      lastErr = err;
    } finally {
      rmSync(`${stem}.out`, { force: true });
      rmSync(`${stem}.body`, { force: true });
    }
  }
  throw new Error(`postQuery failed after retries: ${String(lastErr)}`);
}

function* walk(js: JsonStat2): Generator<{ coord: Record<string, string>; value: number | null; status?: string }> {
  const codesByDim: Record<string, string[]> = {};
  for (const d of js.id) {
    const idx = js.dimension[d].category.index;
    codesByDim[d] = Object.keys(idx).sort((a, b) => idx[a] - idx[b]);
  }
  for (let flat = 0; flat < js.value.length; flat++) {
    let rem = flat;
    const coord: Record<string, string> = {};
    for (let di = js.id.length - 1; di >= 0; di--) {
      const d = js.id[di];
      const sz = js.size[di];
      coord[d] = codesByDim[d][rem % sz];
      rem = Math.floor(rem / sz);
    }
    yield { coord, value: js.value[flat] ?? null, status: js.status?.[String(flat)] };
  }
}

const item = (code: string, values: string[]) => ({ code, selection: { filter: "item", values } });
const kantonOf = (c: string) => (c === "8100" ? "CH" : c);

// ---------------------------------------------------------------------------
// Payload index for one nationality: dim-key -> observation.
// ---------------------------------------------------------------------------
function loadNat(code: string): Observation[] {
  const dir = join(NAT_DIR, code);
  const out: Observation[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    out.push(...decodeCanton(JSON.parse(readFileSync(join(dir, f), "utf8")) as CantonPayload));
  }
  return out;
}

function keyOf(o: { dataset: string; populationType: string; dim: Record<string, unknown> }): string {
  const d = o.dim;
  return [
    o.dataset, o.populationType, d.canton ?? "", d.year ?? "", d.sex ?? "", d.permit ?? "",
    d.ageClass ?? "", d.nationalityGroup ?? "", d.marital ?? "", d.nationality ?? "", d.birthCountry ?? "",
  ].join("|");
}

interface NatReport {
  code: string;
  queries: number;
  compared: number;
  matched: number;
  missing: number;
  mismatched: { key: string; api: number | null; payload: number | null }[];
}

interface Check {
  cube: string;
  query: object[];
  map: (coord: Record<string, string>) => { dataset: string; populationType: string; dim: Record<string, unknown> } | null;
}

function checksFor(entry: Registry["entries"][number], code: string): Check[] {
  const checks: Check[] = [];
  if (entry.bfs101) {
    const nat = entry.bfs101;
    // Full permit×sex×age cross for the latest year — the flagship slice.
    checks.push({
      cube: CUBE_101,
      query: [
        item("Jahr", ["2024"]),
        item("Kanton", ["8100", "ZH", "GE", "VD", "ZG", "AI"]),
        item("Bevölkerungstyp", ["1", "2"]),
        item("Anwesenheitsbewilligung", [TOTAL, "2", "3", "7"]),
        item("Geschlecht", [TOTAL, "1", "2"]),
        item("Altersklasse", AGES),
        item("Staatsangehörigkeit", [nat]),
      ],
      map: (c) => {
        const dim: Record<string, unknown> = {
          canton: kantonOf(c["Kanton"]), year: Number(c["Jahr"]), sex: SEX[c["Geschlecht"]], nationality: code,
        };
        if (c["Anwesenheitsbewilligung"] !== TOTAL) dim.permit = PERMIT[c["Anwesenheitsbewilligung"]];
        if (c["Altersklasse"] !== TOTAL) dim.ageClass = ageLabel(c["Altersklasse"]);
        return { dataset: CUBE_101, populationType: c["Bevölkerungstyp"] === "1" ? "permanent" : "non_permanent", dim };
      },
    });
    // Permit/sex time series at totals across a spread of years.
    checks.push({
      cube: CUBE_101,
      query: [
        item("Jahr", ["2010", "2015", "2020", "2023"]),
        item("Kanton", ["8100", "ZH", "TI", "ZG"]),
        item("Bevölkerungstyp", ["1", "2"]),
        item("Anwesenheitsbewilligung", [TOTAL, "2", "3", "7"]),
        item("Geschlecht", [TOTAL]),
        item("Altersklasse", [TOTAL]),
        item("Staatsangehörigkeit", [nat]),
      ],
      map: (c) => {
        const dim: Record<string, unknown> = {
          canton: kantonOf(c["Kanton"]), year: Number(c["Jahr"]), sex: "total", nationality: code,
        };
        if (c["Anwesenheitsbewilligung"] !== TOTAL) dim.permit = PERMIT[c["Anwesenheitsbewilligung"]];
        return { dataset: CUBE_101, populationType: c["Bevölkerungstyp"] === "1" ? "permanent" : "non_permanent", dim };
      },
    });
  }
  if (entry.bfs399Birth) {
    checks.push({
      cube: CUBE_399,
      query: [
        item("Jahr", ["2024"]),
        item("Kanton", ["8100", "ZH", "GE", "ZG"]),
        item("Bevölkerungstyp", ["1", "2"]),
        item("Staatsangehörigkeit (Auswahl)", [TOTAL, "1", "2", "7"]),
        item("Geburtsstaat", [entry.bfs399Birth]),
        item("Geschlecht", [TOTAL, "1", "2"]),
        item("Altersklasse", [TOTAL, "0", "30", "65"]),
      ],
      map: (c) => {
        const dim: Record<string, unknown> = {
          canton: kantonOf(c["Kanton"]), year: Number(c["Jahr"]), birthCountry: code,
          nationalityGroup: NATGROUP[c["Staatsangehörigkeit (Auswahl)"]], sex: SEX[c["Geschlecht"]],
        };
        if (c["Altersklasse"] !== TOTAL) dim.ageClass = ageLabel(c["Altersklasse"]);
        return { dataset: CUBE_399, populationType: c["Bevölkerungstyp"] === "1" ? "permanent" : "non_permanent", dim };
      },
    });
  }
  if (entry.bfs423Nat) {
    checks.push({
      cube: CUBE_423,
      query: [
        item("Jahr", ["2023"]),
        item("Kanton", ["8100", "ZH", "ZG"]),
        item("Bevölkerungstyp", ["1", "2"]),
        item("Staatsangehörigkeit", [entry.bfs423Nat]),
        item("Geburtsstaat", [TOTAL]),
        item("Geschlecht", [TOTAL, "1", "2"]),
        item("Zivilstand", [TOTAL, "1", "2", "3", "4", "-9"]),
      ],
      map: (c) => {
        const dim: Record<string, unknown> = {
          canton: kantonOf(c["Kanton"]), year: 2023, nationality: code, sex: SEX[c["Geschlecht"]],
        };
        if (c["Zivilstand"] !== TOTAL) dim.marital = MARITAL[c["Zivilstand"]];
        return { dataset: CUBE_423, populationType: c["Bevölkerungstyp"] === "1" ? "permanent" : "non_permanent", dim };
      },
    });
  }
  return checks;
}

async function verifyNat(reg: Registry, code: string, planOnly: boolean): Promise<NatReport | null> {
  const entry = reg.entries.find((e) => e.code === code);
  if (!entry || (!entry.bfs101 && !entry.bfs399Birth)) return null;
  const checks = checksFor(entry, code);
  const report: NatReport = { code, queries: checks.length, compared: 0, matched: 0, missing: 0, mismatched: [] };
  if (planOnly) return report;

  const index = new Map<string, Observation>();
  for (const o of loadNat(code)) {
    if (o.source === "BFS") index.set(keyOf(o as unknown as { dataset: string; populationType: string; dim: Record<string, unknown> }), o);
  }

  for (const check of checks) {
    const js = await postQuery(check.cube, check.query);
    for (const cell of walk(js)) {
      const mapped = check.map(cell.coord);
      if (!mapped) continue;
      const suppressed = cell.status === "." || cell.status === ".." || cell.status === "...";
      // Reproduce the harvest's classification: null w/o suppression is 0.
      const apiValue = suppressed ? null : (cell.value ?? 0) > 0 ? cell.value : 0;
      const k = keyOf(mapped);
      const found = index.get(k);
      report.compared++;
      if (!found) {
        report.missing++;
        if (report.mismatched.length < 20) report.mismatched.push({ key: k, api: apiValue, payload: null });
        continue;
      }
      if (found.value === apiValue) report.matched++;
      else if (report.mismatched.length < 50) report.mismatched.push({ key: k, api: apiValue, payload: found.value });
    }
  }
  return report;
}

function sampleNats(reg: Registry): string[] {
  const all = existsSync(NAT_DIR) ? readdirSync(NAT_DIR).sort() : [];
  if (process.env.VERIFY_BFS_NATS) return process.env.VERIFY_BFS_NATS.split(",").filter((c) => all.includes(c));
  const forced = ["CL", "DE", "PT", "ER", "XK", "IN", "PE", "NR"];
  return forced.filter((c) => all.includes(c) && reg.entries.some((e) => e.code === c));
}

async function main(): Promise<void> {
  const reg = JSON.parse(readFileSync(join(DATA, "registry.json"), "utf8")) as Registry;
  const planOnly = process.env.VERIFY_BFS_PLAN === "1";
  const nats = sampleNats(reg);
  console.log(`BFS verification via PxWeb POST API — nationalities: ${nats.join(", ")}${planOnly ? " (plan only)" : ""}`);

  const reports: NatReport[] = [];
  for (const code of nats) {
    const r = await verifyNat(reg, code, planOnly);
    if (!r) continue;
    reports.push(r);
    console.log(
      planOnly
        ? `  ${code}: ${r.queries} queries planned`
        : `  ${code}: ${r.matched}/${r.compared} matched, ${r.missing} missing, ${r.mismatched.length} mismatched`,
    );
  }
  if (planOnly) return;

  const totals = reports.reduce(
    (a, r) => ({ compared: a.compared + r.compared, matched: a.matched + r.matched, missing: a.missing + r.missing, mm: a.mm + r.mismatched.length }),
    { compared: 0, matched: 0, missing: 0, mm: 0 },
  );
  const pass = totals.matched === totals.compared;

  const lines: string[] = [];
  lines.push(`# BFS Harvest Verification Report (all nationalities)`);
  lines.push("");
  lines.push(`_Generated ${new Date().toISOString()} by \`scripts/verify-bfs.ts\` — independent re-query of the PxWeb POST API. The harvest read the full PC-Axis cube downloads; this report reaches the same published figures over the other access route, with its own query construction and coordinate mapping._`);
  lines.push("");
  lines.push(pass
    ? `**Verdict: PASS.** ${totals.matched}/${totals.compared} API-answered cells across ${reports.length} sampled nationalities reproduced exactly in the decoded payloads.`
    : `**Verdict: ATTENTION.** ${totals.mm} mismatched and ${totals.missing} missing of ${totals.compared} compared cells.`);
  lines.push("");
  lines.push(`| Nationality | Queries | Compared | Matched | Missing | Mismatched |`);
  lines.push(`| --- | --- | --- | --- | --- | --- |`);
  for (const r of reports) lines.push(`| ${r.code} | ${r.queries} | ${r.compared} | ${r.matched} | ${r.missing} | ${r.mismatched.length} |`);
  lines.push("");
  for (const r of reports.filter((x) => x.mismatched.length)) {
    lines.push(`## ${r.code} discrepancies`);
    lines.push("");
    lines.push(`| Cell | API | Payload |`);
    lines.push(`| --- | --- | --- |`);
    for (const m of r.mismatched) lines.push(`| \`${m.key}\` | ${m.api} | ${m.payload} |`);
    lines.push("");
  }
  writeFileSync(join(DATA, "verification-bfs.md"), lines.join("\n"));
  console.log(`\n${pass ? "PASS" : "ATTENTION"} — ${totals.matched}/${totals.compared} matched. Report: data/verification-bfs.md`);
  if (!pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
