// Registry access for the harvest: load data/registry.json and classify SEM
// row labels / BFS codes into registry entries. Classification is total — a
// label that matches nothing is returned as "unknown" and the harvest treats
// any unknown as a fatal error, because an unclassifiable row means the
// registry no longer describes the sources.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface RegistryEntry {
  code: string;
  de: string;
  bfs101?: string;
  bfs399Birth?: string;
  bfs423Nat?: string;
  bfs423Birth?: string;
  sem?: string;
}

export interface Registry {
  entries: RegistryEntry[];
  semSkip: string[];
  /** entries that have a SEM row (countries + specials + groups) */
  semEntries: RegistryEntry[];
  bySem: Map<string, RegistryEntry>;
  byCode: Map<string, RegistryEntry>;
  byBfs101: Map<string, RegistryEntry>;
  byBfs399Birth: Map<string, RegistryEntry>;
  byBfs423Nat: Map<string, RegistryEntry>;
  byBfs423Birth: Map<string, RegistryEntry>;
}

/** Same normalisation as build-registry.ts — the two must agree. */
export function normLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\r?\n/g, " ")
    .replace(/\bu\./g, "und")
    .replace(/[().,/']/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SEM_SKIP_PATTERNS = [
  /Bestand ausländische Wohnbevölkerung/i,
  /^Kanton /,
  /nach Nationalität/i,
  /^\d-\d\d$/,
  /Kontinente/,
  // Flow-table titles (3-x): movement phrasings that never label a data row we
  // read by name. The aggregate rows themselves (Gesamttotal etc.) are exact
  // entries in semSkip / the registry, not patterns.
  /Einwanderung|Auswanderung|Erwerb Schweizer|Erwerb des Schweizer/i,
  /ausländische[rn]? Wohnbevölkerung/i,
  /^Total Zunahme|^Total Abnahme/i,
  // Flow-table sub-aggregates within EU/EFTA and Europe. The EU/EFTA total
  // itself is a registry entry (see EU_EFTA_PATTERN); its internal splits and
  // the extra continent furniture are not harvested.
  /^EU-?\d+$/i,
  /^EU-Kroatien$/i,
  /^EFTA$/i,
  /^Übriges? /i, // "Übriges Europa" / "Übrige Europa" and canton-sheet kin
];

/**
 * The EU/EFTA aggregate's label has changed with the EU's own membership:
 * "EU28 / EFTA", "EU-28/EFTA", "EU-27/EFTA", "EU / EFTA" all name the same
 * published row. Matched as a shape, on the normalised form.
 */
const EU_EFTA_PATTERN = /^eu ?\d* ?efta( uk)?$/;

/**
 * Historic label spellings -> ISO. Country names drift across workbook years
 * (Mazedonien -> Nordmazedonien, Swasiland -> Eswatini, Weissrussland ->
 * Belarus…); the registry stores the current label, this table catches the
 * older ones. Keys are normLabel() output.
 */
export const SEM_LABEL_ALIASES: Record<string, string> = {
  "mazedonien": "MK",
  "nordmazedonien": "MK",
  "swasiland": "SZ",
  "eswatini": "SZ",
  "weissrussland": "BY",
  "belarus": "BY",
  "kap verde": "CV",
  "kapverden": "CV",
  "grossbritannien": "GB",
  "vereinigtes konigreich": "GB",
  "turkei": "TR",
  "turkiye": "TR",
  "tschechien": "CZ",
  "tschechische republik": "CZ",
  "slowakei": "SK",
  "slowakische republik": "SK",
  "burma": "MM",
  "myanmar": "MM",
  "moldau": "MD",
  "moldova": "MD",
  "republik moldau": "MD",
  "mazedonien eh jug rep": "MK",
  "botswana": "BW",
  "djibouti": "DJ",
  "china taiwan": "TW",
  "salomon inseln": "SB",
  // Microstates that first gained SEM rows after the registry's source month.
  "nauru": "NR",
  "palau": "PW",
  "tuvalu": "TV",
  "mikronesien": "FM",
  "cookinseln": "CK",
  "vatikanstadt": "VA",
  "vatikan": "VA",
  "heiliger stuhl": "VA",
  "palastina": "PS",
};

export function loadRegistry(cwd = process.cwd()): Registry {
  const raw = JSON.parse(readFileSync(join(cwd, "data", "registry.json"), "utf8")) as {
    entries: RegistryEntry[];
    semSkip: string[];
  };
  // The SEM zero-fill universe: every real country, plus the specials and
  // groups that carry a SEM row. SEM lists only countries with at least one
  // resident, and its inventory grows over time (Nauru first appears in late
  // 2025) — a country absent from a sheet has zero people there, whether or
  // not the registry's source month happened to list it.
  const semEntries = raw.entries.filter((e) => e.sem || !e.code.startsWith("_"));
  const index = <K extends keyof RegistryEntry>(k: K) => {
    const m = new Map<string, RegistryEntry>();
    for (const e of raw.entries) {
      const v = e[k];
      if (typeof v === "string") m.set(k === "sem" ? normLabel(v) : v, e);
    }
    return m;
  };
  return {
    entries: raw.entries,
    semSkip: raw.semSkip,
    semEntries,
    bySem: index("sem"),
    byCode: index("code"),
    byBfs101: index("bfs101"),
    byBfs399Birth: index("bfs399Birth"),
    byBfs423Nat: index("bfs423Nat"),
    byBfs423Birth: index("bfs423Birth"),
  };
}

export type RowClass =
  | { kind: "entry"; entry: RegistryEntry }
  | { kind: "skip" }
  | { kind: "unknown" };

export function classifySemLabel(reg: Registry, label: string, skipNorm: Set<string>): RowClass {
  const n = normLabel(label);
  // Entry match first: the group entries (_ALL, _EU_EFTA, _THIRD) carry labels
  // that also appear in the skip list, and they are entries, not furniture.
  const entry = reg.bySem.get(n);
  if (entry) return { kind: "entry", entry };
  if (EU_EFTA_PATTERN.test(n)) {
    const g = reg.byCode.get("_EU_EFTA");
    if (g) return { kind: "entry", entry: g };
  }
  const alias = SEM_LABEL_ALIASES[n];
  if (alias) {
    const a = reg.byCode.get(alias);
    if (a) return { kind: "entry", entry: a };
  }
  if (skipNorm.has(n)) return { kind: "skip" };
  if (SEM_SKIP_PATTERNS.some((p) => p.test(label))) return { kind: "skip" };
  return { kind: "unknown" };
}

export function semSkipNormSet(reg: Registry): Set<string> {
  return new Set(reg.semSkip.map(normLabel));
}
