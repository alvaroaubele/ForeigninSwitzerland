// Wire format for the harvested observations.
//
// Zug alone was ~12 500 observations and shipped as one file. All 26 cantons
// plus Switzerland is roughly thirty times that, and the verbose form does not
// survive the multiplication: a single observation spends ~200 bytes on a
// provenance URL that repeats thousands of times within its own file, plus a
// retrieval timestamp identical across the run and a hashed id nothing reads.
//
// So the payload interns the repeated strings and is split one file per canton.
// The decoder returns ordinary `Observation` objects, which is the point — the
// model, the selectors and every component stay exactly as they were, and only
// the loader knows this format exists.
import type { CellState, Dimensions, Observation } from "./types";

export const PAYLOAD_VERSION = 1;

const SOURCES = ["SEM", "BFS"] as const;
const METRICS = ["stock", "immigration", "emigration", "naturalisation"] as const;
const POPS = ["permanent", "non_permanent", "total"] as const;
const STATES: CellState[] = ["observed", "structural_zero", "suppressed", "not_published"];

export interface EncodedObs {
  /** index into SOURCES */
  s: number;
  /** index into the payload's `datasets` table */
  d: number;
  /** index into METRICS */
  m: number;
  /** index into POPS */
  p: number;
  /** the figure, or null where there is none */
  v: number | null;
  /** index into STATES */
  t: number;
  /** index into the payload's `concepts` table */
  c: number;
  /** index into the payload's `urls` table */
  u: number;
  /** index into the payload's `refDates` table */
  r: number;
  /** index into the payload's `sheets` table, when the source is a spreadsheet */
  h?: number;
  /** index into the payload's `rowLabels` table */
  l?: number;
  /** index into the payload's `queries` table */
  q?: number;
  dim: Partial<Dimensions>;
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
  /**
   * API query bodies, serialised and interned.
   *
   * These are provenance and have to survive, but a BFS query naming all 27
   * cantons and 22 age bands is over a kilobyte and every cell it returned
   * carried its own copy. Interning them took the Zug file from 6.1 MB to a
   * fraction of that; they repeat a few dozen times each.
   */
  queries: string[];
  obs: EncodedObs[];
}

/** Small helper for building the string tables while encoding. */
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

export function encodeCanton(canton: string, observations: Observation[]): CantonPayload {
  const datasets = new Interner();
  const concepts = new Interner();
  const urls = new Interner();
  const refDates = new Interner();
  const sheets = new Interner();
  const rowLabels = new Interner();
  const queries = new Interner();

  const obs: EncodedObs[] = observations.map((o) => {
    const e: EncodedObs = {
      s: SOURCES.indexOf(o.source as (typeof SOURCES)[number]),
      d: datasets.index(o.dataset),
      m: METRICS.indexOf(o.metric),
      p: POPS.indexOf(o.populationType),
      v: o.value,
      t: STATES.indexOf(o.state),
      c: concepts.index(o.concept),
      u: urls.index(o.provenance.url),
      r: refDates.index(o.provenance.referenceDate),
      dim: o.dim,
    };
    if (o.provenance.sheet) e.h = sheets.index(o.provenance.sheet);
    if (o.provenance.rowLabel) e.l = rowLabels.index(o.provenance.rowLabel);
    if (o.provenance.query !== undefined) e.q = queries.index(JSON.stringify(o.provenance.query));
    return e;
  });

  return {
    v: PAYLOAD_VERSION,
    canton,
    // One timestamp for the file: it is the same run for every row, and repeating
    // an ISO string 14 000 times is 400 kB of nothing.
    retrievedAt: String(observations[0]?.provenance.retrievedAt ?? new Date().toISOString()),
    datasets: datasets.list,
    concepts: concepts.list,
    urls: urls.list,
    refDates: refDates.list,
    sheets: sheets.list,
    rowLabels: rowLabels.list,
    queries: queries.list,
    obs,
  };
}

export function decodeCanton(p: CantonPayload): Observation[] {
  return p.obs.map((e, i) => ({
    // Ids are positional rather than hashed. Nothing joins on them across files;
    // they exist so the verifiers can sample deterministically, and re-deriving a
    // SHA for every row in the browser would cost more than the format saves.
    id: `${p.canton}-${i}`,
    source: SOURCES[e.s],
    dataset: p.datasets[e.d],
    metric: METRICS[e.m],
    populationType: POPS[e.p],
    dim: e.dim,
    value: e.v,
    state: STATES[e.t],
    concept: p.concepts[e.c],
    unit: "persons",
    provenance: {
      url: p.urls[e.u],
      referenceDate: p.refDates[e.r],
      retrievedAt: p.retrievedAt,
      ...(e.h !== undefined ? { sheet: p.sheets[e.h] } : {}),
      ...(e.l !== undefined ? { rowLabel: p.rowLabels[e.l] } : {}),
      ...(e.q !== undefined ? { query: JSON.parse(p.queries[e.q]) } : {}),
    },
  })) as Observation[];
}
