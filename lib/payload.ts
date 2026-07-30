// Wire format for the harvested observations.
//
// v1 interned the long strings but kept one JSON object per observation. At
// Chile-scale that was fine; at every-nationality scale (~40 million cells)
// the per-observation envelope alone is gigabytes. v2 is grouped-columnar:
// observations that share their categorical fields (source, dataset, metric,
// population, concept, sheet, row label, query) form a group, and inside a
// group the per-cell data is four parallel arrays — dim-tuple index, refDate
// index, url index, value. Cell state is not stored at all: the harvest's
// classification is a pure function of the value (null -> suppressed,
// 0 -> structural zero, >0 -> observed), and any future exception goes into
// the sparse `st` array.
//
// The decoder still returns ordinary `Observation` objects — the model, the
// selectors, both verifiers and every component stay exactly as they were.
// Only the loader knows this format exists.
import type { CellState, Dimensions, Observation } from "./types";

export const PAYLOAD_VERSION = 2;

const SOURCES = ["SEM", "BFS"] as const;
const METRICS = ["stock", "immigration", "emigration", "naturalisation"] as const;
const POPS = ["permanent", "non_permanent", "total"] as const;
const STATES: CellState[] = ["observed", "structural_zero", "suppressed", "not_published"];

interface ObsGroup {
  /** SOURCES / datasets / METRICS / POPS / concepts indices */
  s: number;
  d: number;
  m: number;
  p: number;
  c: number;
  /** sheets / rowLabels / queries indices, when present */
  h?: number;
  l?: number;
  q?: number;
  /**
   * Per-cell parallel arrays: dim tuple, refDate, url, value. `r` and `u`
   * collapse to a scalar when every cell in the group shares the value —
   * which is every BFS group (one cube file, one reference date) and most of
   * the payload's bytes.
   */
  t: number[];
  r: number[] | number;
  u: number[] | number;
  v: (number | null)[];
  /** sparse state exceptions: [cellIndex, stateIndex] */
  st?: [number, number][];
}

export interface CantonPayload {
  v: number;
  canton: string;
  retrievedAt: string;
  datasets: string[];
  concepts: string[];
  urls: string[];
  refDates: string[];
  sheets: string[];
  rowLabels: string[];
  queries: string[];
  /**
   * Interned dim tuples, stringified. A tuple carries every dimension EXCEPT
   * canton (the file is the scope), year and — for SEM — month, which are
   * both re-derived from the cell's reference date. Stripping the temporal
   * fields is what makes tuples repeat across a 69-month series.
   */
  dims: string[];
  groups: ObsGroup[];
}

class Interner {
  private map = new Map<string, number>();
  readonly list: string[] = [];
  index(value: string): number {
    const hit = this.map.get(value);
    if (hit !== undefined) return hit;
    const i = this.list.length;
    this.list.push(value);
    this.map.set(value, i);
    return i;
  }
}

/** State a value classifies to when no exception is recorded. */
function defaultState(v: number | null): CellState {
  if (v === null) return "suppressed";
  return v > 0 ? "observed" : "structural_zero";
}

export function encodeCanton(canton: string, observations: Observation[]): CantonPayload {
  const datasets = new Interner();
  const concepts = new Interner();
  const urls = new Interner();
  const refDates = new Interner();
  const sheets = new Interner();
  const rowLabels = new Interner();
  const queries = new Interner();
  const dims = new Interner();

  const groups = new Map<string, ObsGroup>();

  for (const o of observations) {
    const s = SOURCES.indexOf(o.source as (typeof SOURCES)[number]);
    const d = datasets.index(o.dataset);
    const m = METRICS.indexOf(o.metric);
    const p = POPS.indexOf(o.populationType);
    const c = concepts.index(o.concept);
    const h = o.provenance.sheet !== undefined ? sheets.index(o.provenance.sheet) : undefined;
    const l = o.provenance.rowLabel !== undefined ? rowLabels.index(o.provenance.rowLabel) : undefined;
    const q = o.provenance.query !== undefined ? queries.index(JSON.stringify(o.provenance.query)) : undefined;

    const key = `${s}|${d}|${m}|${p}|${c}|${h ?? ""}|${l ?? ""}|${q ?? ""}`;
    let g = groups.get(key);
    if (!g) {
      g = { s, d, m, p, c, t: [], r: [], u: [], v: [] };
      if (h !== undefined) g.h = h;
      if (l !== undefined) g.l = l;
      if (q !== undefined) g.q = q;
      groups.set(key, g);
    }

    // The tuple drops canton (when it equals the file scope — the cross-canton
    // summary files keep it), year, and month (derived from the reference date
    // at decode time).
    const { canton: oc, year: _y, month: _mo, ...rest } = o.dim as Record<string, unknown>;
    void _y; void _mo;
    const tuple = oc !== undefined && oc !== canton ? { ...rest, canton: oc } : rest;
    g.t.push(dims.index(JSON.stringify(tuple)));
    (g.r as number[]).push(refDates.index(o.provenance.referenceDate));
    (g.u as number[]).push(urls.index(o.provenance.url));
    g.v.push(o.value);
    if (o.state !== defaultState(o.value)) {
      (g.st ??= []).push([g.v.length - 1, STATES.indexOf(o.state)]);
    }
  }

  // Collapse uniform per-cell arrays to scalars.
  for (const g of groups.values()) {
    const rArr = g.r as number[];
    if (rArr.length > 0 && rArr.every((x) => x === rArr[0])) g.r = rArr[0];
    const uArr = g.u as number[];
    if (uArr.length > 0 && uArr.every((x) => x === uArr[0])) g.u = uArr[0];
  }

  return {
    v: PAYLOAD_VERSION,
    canton,
    retrievedAt: String(observations[0]?.provenance.retrievedAt ?? new Date().toISOString()),
    datasets: datasets.list,
    concepts: concepts.list,
    urls: urls.list,
    refDates: refDates.list,
    sheets: sheets.list,
    rowLabels: rowLabels.list,
    queries: queries.list,
    dims: dims.list,
    groups: [...groups.values()],
  };
}

export function decodeCanton(p: CantonPayload): Observation[] {
  if (p.v !== PAYLOAD_VERSION) {
    throw new Error(`payload ${p.canton}: version ${p.v}, expected ${PAYLOAD_VERSION} — re-run the harvest`);
  }
  // Dim tuples parse once; each observation gets its own shallow copy with the
  // scope and temporal fields restored.
  const tuples = p.dims.map((s) => JSON.parse(s) as Partial<Dimensions>);
  const out: Observation[] = [];
  let n = 0;
  for (const g of p.groups) {
    const source = SOURCES[g.s];
    const dataset = p.datasets[g.d];
    const metric = METRICS[g.m];
    const populationType = POPS[g.p];
    const concept = p.concepts[g.c];
    const sheet = g.h !== undefined ? p.sheets[g.h] : undefined;
    const rowLabel = g.l !== undefined ? p.rowLabels[g.l] : undefined;
    const query = g.q !== undefined ? JSON.parse(p.queries[g.q]) : undefined;
    const exceptions = new Map(g.st ?? []);
    const rOf = (i: number) => (typeof g.r === "number" ? g.r : g.r[i]);
    const uOf = (i: number) => (typeof g.u === "number" ? g.u : g.u[i]);
    for (let i = 0; i < g.v.length; i++) {
      const refDate = p.refDates[rOf(i)];
      const year = Number(refDate.slice(0, 4));
      const value = g.v[i];
      const stEx = exceptions.get(i);
      const tuple = tuples[g.t[i]];
      const dim: Partial<Dimensions> = { canton: p.canton, ...tuple, year };
      if (source === "SEM") dim.month = Number(refDate.slice(5, 7));
      out.push({
        // Positional ids: nothing joins on them across files; they exist so the
        // verifiers can sample deterministically.
        id: `${p.canton}-${n++}`,
        source,
        dataset,
        metric,
        populationType,
        dim,
        value,
        state: stEx !== undefined ? STATES[stEx] : defaultState(value),
        concept,
        unit: "persons",
        provenance: {
          url: p.urls[uOf(i)],
          referenceDate: refDate,
          retrievedAt: p.retrievedAt,
          ...(sheet !== undefined ? { sheet } : {}),
          ...(rowLabel !== undefined ? { rowLabel } : {}),
          ...(query !== undefined ? { query } : {}),
        },
      } as Observation);
    }
  }
  return out;
}
