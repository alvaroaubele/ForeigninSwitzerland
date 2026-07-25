// App-specific query helpers built on the generic model. Every value returned
// here is a harvested cell or a classified miss — never synthesised.
import type { CellState, Observation } from "./types";
import { resolveCell, type CellResult, type Dataset } from "./model";

export const YEARS = Array.from({ length: 15 }, (_, i) => 2010 + i); // 2010–2024 (BFS span)
export const CUBE_101 = "px-x-0103010000_101";
export const CUBE_399 = "px-x-0103010000_399";
export const CUBE_423 = "px-x-0103010000_423";

export const PASSPORT_GROUPS = [
  "Swiss",
  "EU",
  "Latin America & Caribbean",
  "North America",
  "Oceania",
  "EFTA",
  "Other Europe",
  "Africa",
  "Asia",
  "Stateless",
  "Unknown",
] as const;

/** Latest SEM month present in the dataset (e.g. {year:2026, month:5}). */
export function latestSemMonth(ds: Dataset): { year: number; month: number } {
  let best = { year: 0, month: 0 };
  for (const o of ds.observations) {
    if (o.source !== "SEM" || o.dim.year === undefined || o.dim.month === undefined) continue;
    if (o.dim.year > best.year || (o.dim.year === best.year && o.dim.month > best.month)) {
      best = { year: o.dim.year, month: o.dim.month };
    }
  }
  return best;
}

/** SEM permanent Chilean nationals at the latest month (the headline "35"). */
export function passportHeadline(ds: Dataset): CellResult {
  const { year, month } = latestSemMonth(ds);
  return resolveCell(ds, {
    source: "SEM",
    dataset: "2-10",
    metric: "stock",
    populationType: "permanent",
    dim: { canton: "ZG", year, month, nationality: "CL", sex: "total" },
  });
}

/** SEM total (permanent + non-permanent) at latest month. */
export function totalHeadline(ds: Dataset): CellResult {
  const { year, month } = latestSemMonth(ds);
  return resolveCell(ds, {
    source: "SEM",
    dataset: "2-10",
    metric: "stock",
    populationType: "total",
    dim: { canton: "ZG", year, month, nationality: "CL", sex: "total" },
  });
}

/** BFS Chilean-born residents (permanent) in a given year — the headline "99". */
export function bornHeadline(ds: Dataset, year = 2024): CellResult {
  return resolveCell(ds, {
    source: "BFS",
    dataset: CUBE_399,
    populationType: "permanent",
    dim: { canton: "ZG", year, birthCountry: "CL", nationalityGroup: "total", sex: "total" },
  });
}

export interface PassportSplitRow {
  group: string;
  cell: CellResult;
}

/** BFS: the Chilean-born population split by passport group. */
export function passportSplit(ds: Dataset, year = 2024): PassportSplitRow[] {
  return PASSPORT_GROUPS.map((group) => ({
    group,
    cell: resolveCell(ds, {
      source: "BFS",
      dataset: CUBE_399,
      populationType: "permanent",
      dim: { canton: "ZG", year, birthCountry: "CL", nationalityGroup: group, sex: "total" },
    }),
  })).filter((r) => r.cell.observation !== null || r.cell.state !== "not_published");
}

export interface AnnualPoint {
  year: number;
  value: number | null;
  state: CellState;
  refDate?: string;
  source?: string;
  /** Printed period name, when `year` is a fractional month position. */
  label?: string;
}

/** BFS Chilean-nationals stock time series (permanent) for the annual chart. */
export function bfsStockSeries(ds: Dataset, years = YEARS): AnnualPoint[] {
  return years.map((year) => {
    const c = resolveCell(ds, {
      source: "BFS",
      dataset: CUBE_101,
      populationType: "permanent",
      dim: { canton: "ZG", year, nationality: "CL", sex: "total" },
    });
    return { year, value: c.value, state: c.state, refDate: c.observation?.provenance.referenceDate, source: "BFS" };
  });
}

/** SEM December stock series (permanent), for years where a December snapshot exists. */
export function semDecemberSeries(ds: Dataset): AnnualPoint[] {
  const years = Array.from(
    new Set(
      ds.observations
        .filter((o) => o.source === "SEM" && o.dataset === "2-10" && o.dim.month === 12)
        .map((o) => o.dim.year as number),
    ),
  ).sort((a, b) => a - b);
  return years.map((year) => {
    const c = resolveCell(ds, {
      source: "SEM",
      dataset: "2-10",
      metric: "stock",
      populationType: "permanent",
      dim: { canton: "ZG", year, month: 12, nationality: "CL", sex: "total" },
    });
    return { year, value: c.value, state: c.state, refDate: c.observation?.provenance.referenceDate, source: "SEM" };
  });
}

/**
 * SEM stock at every month the archive publishes, not just year-ends.
 *
 * The x value is a fractional year (2023-04 -> 2023.25) so the same linear
 * year scale carries both resolutions and the two series stay comparable; the
 * printed month label rides along on the point for the tooltip.
 */
export function semMonthlySeries(ds: Dataset): AnnualPoint[] {
  const periods = new Map<string, { year: number; month: number }>();
  for (const o of ds.observations) {
    if (o.source === "SEM" && o.dataset === "2-10" && o.dim.year !== undefined && o.dim.month !== undefined) {
      periods.set(`${o.dim.year}-${o.dim.month}`, { year: o.dim.year, month: o.dim.month });
    }
  }
  return [...periods.values()]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map(({ year, month }) => {
      const c = resolveCell(ds, {
        source: "SEM",
        dataset: "2-10",
        metric: "stock",
        populationType: "permanent",
        dim: { canton: "ZG", year, month, nationality: "CL", sex: "total" },
      });
      return {
        year: year + (month - 1) / 12,
        value: c.value,
        state: c.state,
        refDate: c.observation?.provenance.referenceDate,
        source: "SEM",
        label: `${MONTH_NAMES[month - 1]} ${year}`,
      };
    });
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isBfsLoaded(ds: Dataset): boolean {
  return ds.observations.some((o) => o.source === "BFS");
}

export interface CantonBaseline {
  canton: string;
  chile: CellResult;
  foreign: CellResult;
  per1000Foreign: number | null;
  indexVsNational: number | null;
}

const CANTON_NAMES: Record<string, string> = {
  ZG: "Zug", VD: "Vaud", ZH: "Zürich", GE: "Genève", BE: "Bern", FR: "Fribourg",
  CH: "Switzerland", AG: "Aargau", BS: "Basel-Stadt", BL: "Basel-Land", LU: "Luzern",
  SG: "St. Gallen", TI: "Ticino", VS: "Valais", NE: "Neuchâtel", SO: "Solothurn",
  TG: "Thurgau", GR: "Graubünden", SZ: "Schwyz", SH: "Schaffhausen", JU: "Jura",
  AR: "Appenzell A.Rh.", AI: "Appenzell I.Rh.", GL: "Glarus", NW: "Nidwalden",
  OW: "Obwalden", UR: "Uri",
};
export const cantonName = (code: string): string => CANTON_NAMES[code] ?? code;

function cantonalCell(ds: Dataset, canton: string, nationality: string): CellResult {
  const { year, month } = latestSemMonth(ds);
  return resolveCell(ds, {
    source: "SEM",
    dataset: "2-10",
    metric: "stock",
    populationType: "permanent",
    dim: { canton, year, month, sex: "total", nationality },
  });
}

/** Cantonal comparison baselines from SEM 2-10 (all cantons + Switzerland). */
export function cantonBaselines(ds: Dataset, cantons: string[]): CantonBaseline[] {
  const national = cantonalCell(ds, "CH", "CL");
  const nationalForeign = cantonalCell(ds, "CH", "all_foreign");
  const nationalRatio =
    national.value !== null && nationalForeign.value && nationalForeign.value > 0
      ? national.value / nationalForeign.value
      : null;
  return cantons.map((canton) => {
    const chile = cantonalCell(ds, canton, "CL");
    const foreign = cantonalCell(ds, canton, "all_foreign");
    const per1000 =
      chile.value !== null && foreign.value && foreign.value > 0 ? (chile.value / foreign.value) * 1000 : null;
    const ratio = chile.value !== null && foreign.value && foreign.value > 0 ? chile.value / foreign.value : null;
    const index = ratio !== null && nationalRatio ? (ratio / nationalRatio) * 100 : null;
    return { canton, chile, foreign, per1000Foreign: per1000, indexVsNational: index };
  });
}

export function cantonsWithChile(ds: Dataset): string[] {
  const set = new Set<string>();
  for (const o of ds.observations) {
    if (o.dataset === "2-10" && o.concept === "Chilean nationals (cantonal comparison)" && o.dim.canton && o.dim.canton !== "CH") {
      set.add(o.dim.canton);
    }
  }
  return [...set];
}

/** Distinct values present in the harvest for a given dimension + dataset filter. */
export function distinctValues(
  ds: Dataset,
  key: keyof Observation["dim"],
  filter?: (o: Observation) => boolean,
): string[] {
  const set = new Set<string>();
  for (const o of ds.observations) {
    if (filter && !filter(o)) continue;
    const v = o.dim[key];
    if (v !== undefined && typeof v !== "boolean") set.add(String(v));
  }
  return [...set];
}
