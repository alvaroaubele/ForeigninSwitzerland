// Shared data model for the Chileans-in-Zug data explorer.
// The same types drive the harvest script and the Next.js application.

/**
 * Every displayed cell resolves to exactly one of four states. The distinction
 * between "the count is genuinely 0" and "this was never published" is the
 * central design problem for a population of ~35 people.
 */
export type CellState =
  | "observed" // a real published figure (may itself be any non-negative number)
  | "structural_zero" // the combination exists in the source and the count is 0
  | "suppressed" // exists but withheld below a publication/confidentiality threshold
  | "not_published"; // the source never cross-tabulated these dimensions

export type SourceId = "SEM" | "BFS";

/** Flow direction / concept a figure measures. */
export type Metric =
  | "stock" // point-in-time resident count
  | "immigration" // inflow
  | "emigration" // outflow
  | "naturalisation"; // acquisition of Swiss citizenship

/** Population type. */
export type PopulationType = "permanent" | "non_permanent" | "total";

/**
 * A single harvested fact in long format. The application pivots these; it
 * never stores derived or interpolated values.
 */
export interface Observation {
  id: string;
  source: SourceId;
  dataset: string; // SEM table id (e.g. "2-10") or BFS cube id (e.g. "px-x-0103010000_101")
  metric: Metric;
  populationType: PopulationType;
  /** Structured dimension coordinates. Absent keys mean "aggregated over / not applicable". */
  dim: Dimensions;
  value: number | null;
  state: CellState;
  unit: "persons";
  /** Human-readable label for the concept this cell measures. */
  concept: string;
  provenance: Provenance;
}

export interface Dimensions {
  canton?: string; // "ZG", "CH" (Switzerland), or another canton code
  year?: number;
  month?: number; // 1-12 when the figure is a specific month-end / period-end
  sex?: "total" | "female" | "male";
  permit?: string; // L, B, C, Ci, F, N, S, ... (SEM/BFS permit categories)
  legalBasis?: "FZA" | "AIG"; // free-movement vs third-country legal basis (SEM 2-20)
  ageClass?: string; // canonical age-band label
  marital?: string; // canonical marital-status label
  marriedToSwiss?: boolean; // subset flag from SEM 2-22
  lengthOfStay?: string; // canonical stay-band label
  reason?: string; // reason for immigration (SEM 3-30 / 3-31)
  nationality?: string; // "CL" (Chile) or a nationality-group label
  birthCountry?: string; // "CL" (born in Chile) or "other"
  nationalityGroup?: string; // BFS 399 passport group for the Chilean-born population
  naturalisationType?: string; // ordinary / facilitated / reinstated (SEM 3-60)
}

export interface Provenance {
  url: string;
  /** How the figure was retrieved, when a source offers more than one route
   *  (e.g. the BFS query API vs. the full PC-Axis cube download). */
  access?: string;
  publicationDate?: string; // ISO date the source file/table was published
  referenceDate: string; // ISO date the figure refers to (SEM month-end, BFS 31.12)
  retrievedAt: string; // ISO timestamp of retrieval
  // SEM coordinates:
  sheet?: string;
  rowLabel?: string;
  rowIndex?: number;
  colIndex?: number;
  colConcept?: string;
  // BFS coordinates:
  query?: unknown;
}

/** Source-inventory entry for the manifest. */
export interface SourceRecord {
  id: string;
  source: SourceId;
  title: string;
  checkedFor: string;
  yielded: string;
  observationCount: number;
  urls: string[];
}

/** Which two dimensions a dataset genuinely cross-tabulates (for the availability matrix). */
export interface AvailabilityEntry {
  datasets: string[];
  dimensions: string[];
  note?: string;
}

export interface Manifest {
  generatedAt: string;
  observationCount: number;
  cellStateCounts: Record<CellState, number>;
  sources: SourceRecord[];
  availability: AvailabilityEntry[];
  anchors: AnchorCheck[];
  referenceDates: { sem: string; bfsStatpop: string };
}

export interface AnchorCheck {
  label: string;
  expected: number;
  observed: number | null;
  pass: boolean;
  source: string;
}
