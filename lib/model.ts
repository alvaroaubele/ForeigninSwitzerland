// Query engine over harvested observations. The application never synthesises,
// interpolates, or imputes: every returned cell is either a harvested value or a
// classified miss (structural zero / suppressed / not published).
import type {
  AvailabilityEntry,
  CellState,
  Dimensions,
  Manifest,
  Observation,
} from "./types";

export interface Dataset {
  observations: Observation[];
  manifest: Manifest;
}

export interface CellResult {
  value: number | null;
  state: CellState;
  observation: Observation | null;
  /** When not_published: which source would carry this cross-tab, if any. */
  wouldBeCarriedBy?: string;
}

/** A selection over dimensions; unset keys mean "not constrained / aggregated". */
export interface Selection {
  source?: Observation["source"];
  dataset?: string;
  metric?: Observation["metric"];
  populationType?: Observation["populationType"];
  dim: Partial<Dimensions>;
}

const DIM_KEYS: (keyof Dimensions)[] = [
  "canton", "year", "month", "sex", "permit", "legalBasis", "ageClass",
  "marital", "marriedToSwiss", "lengthOfStay", "reason", "nationality",
  "birthCountry", "nationalityGroup", "naturalisationType",
];

/** True when an observation matches every constrained key in the selection. */
export function matches(o: Observation, sel: Selection): boolean {
  if (sel.source && o.source !== sel.source) return false;
  if (sel.dataset && o.dataset !== sel.dataset) return false;
  if (sel.metric && o.metric !== sel.metric) return false;
  if (sel.populationType && o.populationType !== sel.populationType) return false;
  for (const k of DIM_KEYS) {
    const want = sel.dim[k];
    if (want === undefined) continue;
    if (o.dim[k] !== want) return false;
  }
  return true;
}

/** Which dimension keys are actively constrained (non-empty) in a selection. */
export function activeDims(sel: Selection): (keyof Dimensions)[] {
  return DIM_KEYS.filter((k) => sel.dim[k] !== undefined);
}

/**
 * Resolve a selection to a single cell. If exactly one observation matches, it is
 * returned. If several match (e.g. an aggregate the source published directly),
 * the most specific / total-sex one is preferred. If none match, the result is
 * classified as not_published (the harvest never carried this combination),
 * with a pointer to the dataset that would have.
 */
export function resolveCell(ds: Dataset, sel: Selection): CellResult {
  const hits = ds.observations.filter((o) => matches(o, sel));
  if (hits.length === 1) {
    const o = hits[0];
    return { value: o.value, state: o.state, observation: o };
  }
  if (hits.length > 1) {
    // Prefer an exact-specificity match: the observation whose active dims equal
    // the selection's active dims (no extra breakdown dimension present).
    const want = new Set(activeDims(sel));
    const exact = hits.filter((o) => {
      const has = DIM_KEYS.filter((k) => o.dim[k] !== undefined && k !== "canton" && k !== "year" && k !== "month");
      const wantBreakdown = [...want].filter((k) => k !== "canton" && k !== "year" && k !== "month");
      return has.length === wantBreakdown.length && wantBreakdown.every((k) => o.dim[k] !== undefined);
    });
    const chosen = (exact.length ? exact : hits).sort(
      (a, b) => scoreSpecificity(a) - scoreSpecificity(b),
    )[0];
    return { value: chosen.value, state: chosen.state, observation: chosen };
  }
  // No observation: is this cross-tab published anywhere?
  const carrier = carrierFor(ds.manifest.availability, activeDims(sel));
  return {
    value: null,
    state: "not_published",
    observation: null,
    wouldBeCarriedBy: carrier,
  };
}

function scoreSpecificity(o: Observation): number {
  return DIM_KEYS.reduce((n, k) => n + (o.dim[k] !== undefined ? 1 : 0), 0);
}

/** Find a dataset whose availability entry covers all the requested breakdown dims. */
export function carrierFor(
  availability: AvailabilityEntry[],
  dims: (keyof Dimensions)[],
): string | undefined {
  const breakdown = dims.filter((d) => d !== "canton" && d !== "year" && d !== "month" && d !== "nationality" && d !== "birthCountry");
  if (breakdown.length === 0) return undefined;
  const hit = availability.find((a) => breakdown.every((d) => a.dimensions.includes(d)));
  return hit?.datasets.join(", ");
}

/** Is a pair of breakdown dimensions cross-tabulated by any dataset? */
export function pairAvailable(
  availability: AvailabilityEntry[],
  a: keyof Dimensions,
  b: keyof Dimensions,
): AvailabilityEntry | null {
  return (
    availability.find((e) => e.dimensions.includes(a as string) && e.dimensions.includes(b as string)) ?? null
  );
}

/** A single point in a time series. */
export interface SeriesPoint {
  year: number;
  cell: CellResult;
}

/** Build an annual series for a selection across a range of years. */
export function yearSeries(ds: Dataset, sel: Selection, years: number[]): SeriesPoint[] {
  return years.map((year) => ({
    year,
    cell: resolveCell(ds, { ...sel, dim: { ...sel.dim, year } }),
  }));
}

export function setModelLocale(
  labels: Record<CellState, string>,
  descs: Record<CellState, string>,
): void {
  Object.assign(CELL_STATE_LABEL, labels);
  Object.assign(CELL_STATE_DESCRIPTION, descs);
}

export const CELL_STATE_LABEL: Record<CellState, string> = {
  observed: "Observed",
  structural_zero: "Structural zero",
  suppressed: "Suppressed",
  not_published: "Not published",
};

// "Structural zero" is used here in the weaker of its two senses: the source
// published this cell and the number it published was 0. It deliberately does
// not distinguish a count that is impossible by construction (Swiss nationals
// in the non-permanent foreign population) from one that merely happened to be
// empty (no Chilean nationals in Appenzell Innerrhoden in 2024). Most of these
// cells are the second kind. The distinction the app exists to make is between
// a published 0 and no published figure at all, and both kinds fall on the same
// side of it.
export const CELL_STATE_DESCRIPTION: Record<CellState, string> = {
  observed: "A real published figure from the source.",
  structural_zero:
    "The source published this cell and the count is 0 — nobody is in it, as opposed to nobody having counted.",
  suppressed: "Exists but withheld below the source's publication threshold.",
  not_published: "The source never cross-tabulated these dimensions.",
};
