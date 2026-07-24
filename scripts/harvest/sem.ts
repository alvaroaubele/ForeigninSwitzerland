// SEM Ausländerstatistik harvest: resolve archive-index links, download the ZG
// sheet of each target table, read the Chile row, and emit typed observations.
import * as XLSX from "xlsx";
import { fetchRaw } from "./fetcher.js";
import type { Metric, Observation, PopulationType } from "../../lib/types.js";

const SEM_ORIGIN = "https://www.sem.admin.ch";
const ARCHIVE = (y: number, m: number) =>
  `${SEM_ORIGIN}/sem/de/home/publiservice/statistik/auslaenderstatistik/archiv/${y}/${String(
    m,
  ).padStart(2, "0")}.html`;

type Cell = { value: number | null; concept: string; dim: Partial<Observation["dim"]>; metric: Metric; pop: PopulationType };

/** A column extractor turns a Chile row (array of cells) into observations. */
interface TableDef {
  table: string; // e.g. "2-10"
  metric: Metric;
  /** which time-variant of a flow table to select from the archive index */
  variant?: "J" | "12Mt" | "M";
  concept: string;
  extract: (row: (number | string | null)[]) => Cell[];
}

const n = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : v === 0 ? 0 : null;

// Canonical labels shared with the app.
const SEX = ["total", "female", "male"] as const;
function triplet(
  row: (number | string | null)[],
  start: number,
  base: Omit<Cell, "value" | "dim"> & { dim: Partial<Observation["dim"]> },
): Cell[] {
  return SEX.map((sex, i) => ({
    ...base,
    dim: { ...base.dim, sex },
    value: n(row[start + i]),
  }));
}

const STOCK_PERMIT_TABLE: TableDef = {
  table: "2-10",
  metric: "stock",
  concept: "Stock by permit category",
  extract: (r) => [
    ...triplet(r, 1, { metric: "stock", pop: "permanent", concept: "Permanent residents", dim: {} }),
    ...triplet(r, 4, { metric: "stock", pop: "permanent", concept: "Permit L (short-term >=12mo)", dim: { permit: "L" } }),
    ...triplet(r, 7, { metric: "stock", pop: "permanent", concept: "Permit B (residence)", dim: { permit: "B" } }),
    ...triplet(r, 10, { metric: "stock", pop: "permanent", concept: "Permit C (settled)", dim: { permit: "C" } }),
    ...triplet(r, 13, { metric: "stock", pop: "non_permanent", concept: "Non-permanent residents", dim: {} }),
    { metric: "stock", pop: "total", concept: "Total residents (perm + non-perm)", dim: { sex: "total" }, value: n(r[16]) },
  ],
};

const STOCK_LEGAL_BASIS: TableDef = {
  table: "2-20",
  metric: "stock",
  concept: "Stock by legal basis (FZA vs AIG)",
  extract: (r) => [
    ...triplet(r, 1, { metric: "stock", pop: "permanent", concept: "Permanent residents", dim: {} }),
    ...triplet(r, 4, { metric: "stock", pop: "permanent", concept: "FZA (free movement)", dim: { legalBasis: "FZA" } }),
    ...triplet(r, 7, { metric: "stock", pop: "permanent", concept: "AIG (third-country)", dim: { legalBasis: "AIG" } }),
  ],
};

const AGE_BANDS_STAE = ["0-5", "6-15", "16-17", "18-64", "65+"];
const STOCK_AGE: TableDef = {
  table: "2-21",
  metric: "stock",
  concept: "Stock by age band (permanent)",
  extract: (r) => {
    const cells: Cell[] = [
      { metric: "stock", pop: "permanent", concept: "Permanent residents", dim: { sex: "total" }, value: n(r[1]) },
    ];
    AGE_BANDS_STAE.forEach((band, bi) => {
      cells.push(
        ...triplet(r, 2 + bi * 3, {
          metric: "stock",
          pop: "permanent",
          concept: `Age ${band}`,
          dim: { ageClass: band },
        }),
      );
    });
    return cells;
  },
};

const MARITAL_LABELS: [number, string, Partial<Observation["dim"]>][] = [
  [3, "single", { marital: "single" }],
  [4, "married", { marital: "married" }],
  [5, "married to a Swiss national", { marital: "married", marriedToSwiss: true }],
  [6, "widowed", { marital: "widowed" }],
  [7, "divorced", { marital: "divorced" }],
  [8, "registered partnership", { marital: "registered_partnership" }],
  [9, "registered partnership with a Swiss national", { marital: "registered_partnership", marriedToSwiss: true }],
  [10, "dissolved partnership / unmarried", { marital: "dissolved_partnership" }],
  [11, "unknown", { marital: "unknown" }],
];
const STOCK_MARITAL: TableDef = {
  table: "2-22",
  metric: "stock",
  concept: "Stock by marital status (permanent)",
  extract: (r) => {
    const cells: Cell[] = [
      { metric: "stock", pop: "permanent", concept: "Permanent residents", dim: { sex: "total" }, value: n(r[1]) },
      // Subset of Chilean nationals born in Switzerland. Left un-dimensioned on
      // birthCountry to avoid conflating "born in CH" with "born outside Chile".
      { metric: "stock", pop: "permanent", concept: "Born in Switzerland (of Chilean nationality)", dim: { sex: "total" }, value: n(r[2]) },
    ];
    for (const [col, concept, dim] of MARITAL_LABELS) {
      cells.push({ metric: "stock", pop: "permanent", concept, dim: { sex: "total", ...dim }, value: n(r[col]) });
    }
    return cells;
  },
};

const STAY_BANDS = ["0-4", "5-9", "10-14", "15-19", "20+"];
const STOCK_STAY: TableDef = {
  table: "2-23",
  metric: "stock",
  concept: "Stock by length of stay (permanent)",
  extract: (r) => {
    const cells: Cell[] = [
      { metric: "stock", pop: "permanent", concept: "Permanent residents", dim: { sex: "total" }, value: n(r[1]) },
    ];
    STAY_BANDS.forEach((band, bi) => {
      cells.push(
        ...triplet(r, 2 + bi * 3, {
          metric: "stock",
          pop: "permanent",
          concept: `Length of stay ${band} years`,
          dim: { lengthOfStay: band },
        }),
      );
    });
    return cells;
  },
};

const NONPERM_CATS: [number, string, string][] = [
  [4, "Short-term >4 <12 months", "L>4<12"],
  [7, "Service providers <=4 months", "DLE<=4"],
  [10, "Short-term <=4 months", "L<=4"],
  [13, "Musicians / artists <=8 months", "MK<=8"],
];
const STOCK_NONPERM_CAT: TableDef = {
  table: "2-40",
  metric: "stock",
  concept: "Non-permanent stock by category",
  extract: (r) => {
    const cells: Cell[] = [
      ...triplet(r, 1, { metric: "stock", pop: "non_permanent", concept: "Non-permanent residents", dim: {} }),
    ];
    for (const [col, concept, permit] of NONPERM_CATS) {
      cells.push(...triplet(r, col, { metric: "stock", pop: "non_permanent", concept, dim: { permit } }));
    }
    return cells;
  },
};

const AGE_BANDS_NSTAE = ["0-5", "6-15", "16-17", "18-65", "65+"];
const STOCK_NONPERM_AGE: TableDef = {
  table: "2-41",
  metric: "stock",
  concept: "Non-permanent stock by age band",
  extract: (r) => {
    const cells: Cell[] = [
      { metric: "stock", pop: "non_permanent", concept: "Non-permanent residents", dim: { sex: "total" }, value: n(r[1]) },
    ];
    AGE_BANDS_NSTAE.forEach((band, bi) => {
      cells.push(
        ...triplet(r, 2 + bi * 3, { metric: "stock", pop: "non_permanent", concept: `Age ${band}`, dim: { ageClass: band } }),
      );
    });
    return cells;
  },
};

const REASONS_STAE: [number, string, string][] = [
  [2, "Quota employment", "quota_employment"],
  [3, "Non-quota employment", "nonquota_employment"],
  [4, "Family reunification", "family_reunification"],
  [5, "Education and training", "education"],
  [6, "Residence without employment", "residence_no_employment"],
  [7, "Recognised refugee", "refugee"],
  [8, "Hardship after asylum process", "hardship"],
  [9, "Immigration-law ruling after asylum", "asylum_ruling"],
  [10, "Other", "other"],
];
const flowReason = (table: string, pop: PopulationType, reasons: [number, string, string][]): TableDef => ({
  table,
  metric: "immigration",
  variant: "12Mt",
  concept: `Immigration by reason (${pop})`,
  extract: (r) => {
    const cells: Cell[] = [
      { metric: "immigration", pop, concept: "Total immigration", dim: { sex: "total" }, value: n(r[1]) },
    ];
    for (const [col, concept, reason] of reasons) {
      cells.push({ metric: "immigration", pop, concept, dim: { sex: "total", reason }, value: n(r[col]) });
    }
    return cells;
  },
});

const REASONS_NSTAE: [number, string, string][] = [
  [2, "Quota employment", "quota_employment"],
  [3, "Non-quota employment", "nonquota_employment"],
  [4, "Family reunification", "family_reunification"],
  [5, "Education and training", "education"],
  [6, "Residence without employment", "residence_no_employment"],
  [7, "Other", "other"],
];

const EMIGRATION: TableDef = {
  table: "3-55",
  metric: "emigration",
  variant: "12Mt",
  concept: "Emigration by permit category",
  extract: (r) => [
    ...triplet(r, 1, { metric: "emigration", pop: "permanent", concept: "Permanent emigration", dim: {} }),
    ...triplet(r, 4, { metric: "emigration", pop: "permanent", concept: "Permit L emigration", dim: { permit: "L" } }),
    ...triplet(r, 7, { metric: "emigration", pop: "permanent", concept: "Permit B emigration", dim: { permit: "B" } }),
    ...triplet(r, 10, { metric: "emigration", pop: "permanent", concept: "Permit C emigration", dim: { permit: "C" } }),
    ...triplet(r, 13, { metric: "emigration", pop: "non_permanent", concept: "Non-permanent emigration", dim: {} }),
  ],
};

const NATURALISATION: TableDef = {
  table: "3-60",
  metric: "naturalisation",
  variant: "12Mt",
  concept: "Acquisition of Swiss citizenship",
  extract: (r) => [
    { metric: "naturalisation", pop: "total", concept: "Total acquisition of citizenship", dim: { sex: "total" }, value: n(r[1]) },
    ...triplet(r, 2, { metric: "naturalisation", pop: "total", concept: "Naturalisations (total)", dim: { naturalisationType: "all" } }),
    ...triplet(r, 5, { metric: "naturalisation", pop: "total", concept: "Ordinary naturalisations", dim: { naturalisationType: "ordinary" } }),
    ...triplet(r, 8, { metric: "naturalisation", pop: "total", concept: "Facilitated naturalisations", dim: { naturalisationType: "facilitated" } }),
    ...triplet(r, 11, { metric: "naturalisation", pop: "total", concept: "Reinstated naturalisations", dim: { naturalisationType: "reinstated" } }),
  ],
};

/** Stock tables harvested from every visited month. */
export const STOCK_TABLES: TableDef[] = [
  STOCK_PERMIT_TABLE,
  STOCK_LEGAL_BASIS,
  STOCK_AGE,
  STOCK_MARITAL,
  STOCK_STAY,
  STOCK_NONPERM_CAT,
  STOCK_NONPERM_AGE,
];

/** Flow tables (rolling 12-month variant) harvested from the latest month. */
export const FLOW_TABLES_12MT: TableDef[] = [
  flowReason("3-30", "permanent", REASONS_STAE),
  flowReason("3-31", "non_permanent", REASONS_NSTAE),
  EMIGRATION,
  NATURALISATION,
];

/** Flow tables (annual calendar-year variant) harvested from December releases. */
export const FLOW_TABLES_J: TableDef[] = FLOW_TABLES_12MT.map((t) => ({ ...t, variant: "J" as const }));

export interface ArchiveIndex {
  year: number;
  month: number;
  ok: boolean;
  links: string[];
}

/** Fetch a month's archive index and return all xlsx links (empty if 404). */
export async function fetchArchiveIndex(year: number, month: number): Promise<ArchiveIndex> {
  const url = ARCHIVE(year, month);
  const res = (await fetchRaw(url, { ext: "html" })) as { buffer: Buffer; notFound?: boolean };
  if (res.notFound || res.buffer.length === 0) return { year, month, ok: false, links: [] };
  const html = res.buffer.toString("utf8");
  const links = [...html.matchAll(/href="([^"]*\.xlsx)"/g)].map((m) => m[1]);
  return { year, month, ok: true, links };
}

/** Resolve a table's download URL from an archive index, respecting capitalisation + variant. */
export function resolveTableUrl(index: ArchiveIndex, table: string, variant?: "J" | "12Mt" | "M"): string | null {
  const cands = index.links.filter((l) => {
    const base = (l.split("/").pop() ?? "").toLowerCase();
    if (!base.startsWith(table.toLowerCase() + "-")) return false;
    if (!variant) return true;
    // Variant token appears as -j-, -12mt-, or -m- in the filename.
    const token = variant.toLowerCase();
    return new RegExp(`-${token}-`).test(base);
  });
  if (cands.length === 0) return null;
  const href = cands[0];
  return href.startsWith("http") ? href : SEM_ORIGIN + href;
}

/** Find the Chile row in a ZG sheet (whitespace-tolerant). Returns null if absent. */
export function findChileRow(buffer: Buffer): { row: (number | string | null)[]; index: number } | null {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets["ZG"];
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json<(number | string | null)[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r && typeof r[0] === "string" && r[0].replace(/\s+/g, "").toLowerCase() === "chile") {
      return { row: r, index: i };
    }
  }
  return null;
}

/**
 * Read one canton sheet of the 2-10 table: the Chile row (Total/F/M permanent)
 * and the Gesamttotal row (all foreign residents — the per-capita denominator).
 */
export function readCantonSheet(
  buffer: Buffer,
  sheetName: string,
): { chile: [number | null, number | null, number | null] | null; foreignTotal: number | null } | null {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json<(number | string | null)[]>(sheet, { header: 1, raw: true, defval: null });
  let chile: [number | null, number | null, number | null] | null = null;
  let foreignTotal: number | null = null;
  for (const r of rows) {
    if (!r || typeof r[0] !== "string") continue;
    const c0 = r[0].replace(/\s+/g, "").toLowerCase();
    if (c0 === "gesamttotal" && foreignTotal === null) {
      foreignTotal = typeof r[1] === "number" ? r[1] : null;
    }
    if (c0 === "chile") {
      chile = [
        typeof r[1] === "number" ? r[1] : null,
        typeof r[2] === "number" ? r[2] : null,
        typeof r[3] === "number" ? r[3] : null,
      ];
    }
  }
  return { chile, foreignTotal };
}

/** The 26 canton sheet codes in the 2-10 workbook (excludes CH-Kt/CH-Nati). */
export const CANTON_SHEETS = [
  "AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR", "JU", "LU", "NE",
  "NW", "OW", "SG", "SH", "SO", "SZ", "TG", "TI", "UR", "VD", "VS", "ZG", "ZH",
];

export { SEM_ORIGIN };
export type { TableDef, Cell };
