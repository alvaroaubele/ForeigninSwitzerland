// Declarative BFS cube query set. Each entry is one PxWeb slice; the orchestrator
// runs it, walks json-stat2, and maps coordinates to app dimensions.
import type { Observation, PopulationType } from "../../lib/types.js";
import type { PxQuery } from "./bfs.js";

export const CUBE_101 = "px-x-0103010000_101";
export const CUBE_399 = "px-x-0103010000_399";
export const CUBE_423 = "px-x-0103010000_423";

export const CHILE = "8407";
export const ZG = "ZG";
export const CH = "8100";
export const TOTAL = "-99999";

// ---- code -> app-label maps -------------------------------------------------
export const PERMIT_101: Record<string, string> = {
  "2": "B",
  "3": "C",
  "4": "Ci",
  "5": "F",
  "7": "L",
  "8": "N",
  "9": "S",
};
export const SEX_101: Record<string, "total" | "male" | "female"> = {
  "-99999": "total",
  "1": "male",
  "2": "female",
};
export const POP_101: Record<string, PopulationType> = { "1": "permanent", "2": "non_permanent" };
export const NATGROUP_399: Record<string, string> = {
  "-99999": "total",
  "1": "Swiss",
  "2": "EU",
  "3": "EFTA",
  "4": "Other Europe",
  "5": "Africa",
  "6": "North America",
  "7": "Latin America & Caribbean",
  "8": "Asia",
  "9": "Oceania",
  "-1": "Stateless",
  "-9": "Unknown",
};
export const MARITAL_423: Record<string, string> = {
  "-99999": "total",
  "1": "single",
  "2": "married",
  "3": "widowed",
  "4": "divorced",
  "-9": "unknown",
};

export function ageLabel(code: string): string {
  if (code === "-99999") return "total";
  if (code === "100") return "100+";
  const start = Number(code);
  return `${start}-${start + 4}`;
}

const ALL_AGE = [
  "-99999", "0", "5", "10", "15", "20", "25", "30", "35", "40", "45", "50",
  "55", "60", "65", "70", "75", "80", "85", "90", "95", "100",
];
const ALL_YEARS_101 = Array.from({ length: 15 }, (_, i) => String(2010 + i));
const ALL_YEARS_399 = ["2020", "2021", "2022", "2023", "2024"];
const ALL_CANTONS = [
  "8100", "ZH", "BE", "LU", "UR", "SZ", "OW", "NW", "GL", "ZG", "FR", "SO",
  "BS", "BL", "SH", "AR", "AI", "SG", "GR", "AG", "TG", "TI", "VD", "VS",
  "NE", "GE", "JU",
];

export interface CubeQuerySpec {
  id: string;
  cube: string;
  concept: string;
  query: PxQuery[];
  /** dims (by BFS id) whose codes map onto app dimensions; the rest are fixed filters */
  map: (coord: Record<string, string>) => Partial<Observation["dim"]> & {
    metric?: Observation["metric"];
    populationType?: PopulationType;
  };
  metric: Observation["metric"];
  referenceDateFor: (coord: Record<string, string>) => string;
  /** which app-dimension pair(s) this slice cross-tabulates, for the availability matrix */
  crossTab: string[];
}

const item = (code: string, values: string[]): PxQuery => ({
  code,
  selection: { filter: "item", values },
});

// ---- Cube 101: Chilean nationals --------------------------------------------
const q101Base = (canton: string[], nat: string[], years: string[], permit: string[], sex: string[], age: string[]) => [
  item("Jahr", years),
  item("Kanton", canton),
  item("Bevölkerungstyp", ["1", "2"]),
  item("Anwesenheitsbewilligung", permit),
  item("Geschlecht", sex),
  item("Altersklasse", age),
  item("Staatsangehörigkeit", nat),
];

const map101 = (coord: Record<string, string>): Partial<Observation["dim"]> => {
  const d: Partial<Observation["dim"]> = {
    canton: coord["Kanton"] === CH ? "CH" : coord["Kanton"],
    year: Number(coord["Jahr"]),
    sex: SEX_101[coord["Geschlecht"]] ?? "total",
  };
  const p = coord["Anwesenheitsbewilligung"];
  if (p && p !== TOTAL && PERMIT_101[p]) d.permit = PERMIT_101[p];
  const a = coord["Altersklasse"];
  if (a && a !== TOTAL) d.ageClass = ageLabel(a);
  const nat = coord["Staatsangehörigkeit"];
  d.nationality = nat === CHILE ? "CL" : nat === CH ? "CH" : "total";
  return d;
};
const pop101 = (coord: Record<string, string>) => POP_101[coord["Bevölkerungstyp"]];
const refDec = (coord: Record<string, string>) => `${coord["Jahr"]}-12-31`;

export const CUBE_101_QUERIES: CubeQuerySpec[] = [
  {
    id: "101-permit-ts",
    cube: CUBE_101,
    concept: "Chilean nationals in Zug by permit category and year",
    query: q101Base([ZG], [CHILE], ALL_YEARS_101, [TOTAL, "2", "3", "4", "5", "7", "8", "9"], [TOTAL], [TOTAL]),
    map: (c) => ({ ...map101(c), populationType: pop101(c) }),
    metric: "stock",
    referenceDateFor: refDec,
    crossTab: ["year", "permit"],
  },
  {
    id: "101-sex-ts",
    cube: CUBE_101,
    concept: "Chilean nationals in Zug by sex and year",
    query: q101Base([ZG], [CHILE], ALL_YEARS_101, [TOTAL], [TOTAL, "1", "2"], [TOTAL]),
    map: (c) => ({ ...map101(c), populationType: pop101(c) }),
    metric: "stock",
    referenceDateFor: refDec,
    crossTab: ["year", "sex"],
  },
  {
    id: "101-age-ts",
    cube: CUBE_101,
    concept: "Chilean nationals in Zug by 5-year age class and year",
    query: q101Base([ZG], [CHILE], ALL_YEARS_101, [TOTAL], [TOTAL], ALL_AGE),
    map: (c) => ({ ...map101(c), populationType: pop101(c) }),
    metric: "stock",
    referenceDateFor: refDec,
    crossTab: ["year", "ageClass"],
  },
  {
    id: "101-switzerland-ts",
    cube: CUBE_101,
    concept: "All Chilean nationals in Switzerland by year (baseline)",
    query: q101Base([CH], [CHILE], ALL_YEARS_101, [TOTAL], [TOTAL], [TOTAL]),
    map: (c) => ({ ...map101(c), populationType: pop101(c) }),
    metric: "stock",
    referenceDateFor: refDec,
    crossTab: ["year", "canton"],
  },
  {
    id: "101-cantons-2024",
    cube: CUBE_101,
    concept: "Chilean nationals by canton, 2024 (baseline)",
    query: q101Base(ALL_CANTONS, [CHILE], ["2024"], [TOTAL], [TOTAL], [TOTAL]),
    map: (c) => ({ ...map101(c), populationType: pop101(c) }),
    metric: "stock",
    referenceDateFor: refDec,
    crossTab: ["canton", "nationality"],
  },
  {
    id: "101-canton-denominator-2024",
    cube: CUBE_101,
    concept: "Total resident population by canton, 2024 (per-capita denominator)",
    query: q101Base(ALL_CANTONS, [TOTAL], ["2024"], [TOTAL], [TOTAL], [TOTAL]),
    map: (c) => ({ ...map101(c), populationType: pop101(c) }),
    metric: "stock",
    referenceDateFor: refDec,
    crossTab: ["canton", "populationType"],
  },
  {
    id: "101-zug-foreign-ts",
    cube: CUBE_101,
    concept: "Zug total and Swiss population by year (foreign-total baseline)",
    query: q101Base([ZG], [TOTAL, CH], ALL_YEARS_101, [TOTAL], [TOTAL], [TOTAL]),
    map: (c) => ({ ...map101(c), populationType: pop101(c) }),
    metric: "stock",
    referenceDateFor: refDec,
    crossTab: ["year", "nationality"],
  },
];

// ---- Cube 399: Chilean-born residents ---------------------------------------
const q399Base = (natgroup: string[], sex: string[], age: string[]) => [
  item("Jahr", ALL_YEARS_399),
  item("Kanton", [ZG]),
  item("Bevölkerungstyp", ["1", "2"]),
  item("Staatsangehörigkeit (Auswahl)", natgroup),
  item("Geburtsstaat", [CHILE]),
  item("Geschlecht", sex),
  item("Altersklasse", age),
];
const map399 = (coord: Record<string, string>): Partial<Observation["dim"]> => {
  const d: Partial<Observation["dim"]> = {
    canton: ZG,
    year: Number(coord["Jahr"]),
    birthCountry: "CL",
    sex: SEX_101[coord["Geschlecht"]] ?? "total",
  };
  const g = coord["Staatsangehörigkeit (Auswahl)"];
  if (g) d.nationalityGroup = NATGROUP_399[g] ?? g;
  const a = coord["Altersklasse"];
  if (a && a !== TOTAL) d.ageClass = ageLabel(a);
  return d;
};

export const CUBE_399_QUERIES: CubeQuerySpec[] = [
  {
    id: "399-natgroup-ts",
    cube: CUBE_399,
    concept: "Chilean-born residents of Zug by passport group and year",
    query: q399Base(["-99999", "1", "2", "3", "4", "5", "6", "7", "8", "9", "-1", "-9"], [TOTAL], [TOTAL]),
    map: (c) => ({ ...map399(c), populationType: POP_101[c["Bevölkerungstyp"]] }),
    metric: "stock",
    referenceDateFor: refDec,
    crossTab: ["birthCountry", "nationalityGroup"],
  },
  {
    id: "399-sex-ts",
    cube: CUBE_399,
    concept: "Chilean-born residents of Zug by sex and year",
    query: q399Base([TOTAL], [TOTAL, "1", "2"], [TOTAL]),
    map: (c) => ({ ...map399(c), populationType: POP_101[c["Bevölkerungstyp"]] }),
    metric: "stock",
    referenceDateFor: refDec,
    crossTab: ["birthCountry", "sex"],
  },
  {
    id: "399-age-ts",
    cube: CUBE_399,
    concept: "Chilean-born residents of Zug by 5-year age class and year",
    query: q399Base([TOTAL], [TOTAL], ALL_AGE),
    map: (c) => ({ ...map399(c), populationType: POP_101[c["Bevölkerungstyp"]] }),
    metric: "stock",
    referenceDateFor: refDec,
    crossTab: ["birthCountry", "ageClass"],
  },
];

// ---- Cube 423: marital status (2023) ----------------------------------------
const q423 = (nat: string[], birth: string[], sex: string[], marital: string[]) => [
  item("Jahr", ["2023"]),
  item("Kanton", [ZG]),
  item("Bevölkerungstyp", ["1", "2"]),
  item("Staatsangehörigkeit", nat),
  item("Geburtsstaat", birth),
  item("Geschlecht", sex),
  item("Zivilstand", marital),
];
const map423 = (coord: Record<string, string>, kind: "nationality" | "birthCountry"): Partial<Observation["dim"]> => {
  const d: Partial<Observation["dim"]> = {
    canton: ZG,
    year: 2023,
    sex: SEX_101[coord["Geschlecht"]] ?? "total",
  };
  const z = coord["Zivilstand"];
  if (z && z !== TOTAL) d.marital = MARITAL_423[z] ?? z;
  if (kind === "nationality") d.nationality = "CL";
  else d.birthCountry = "CL";
  const b = coord["Geburtsstaat"];
  if (b === CHILE) d.birthCountry = "CL";
  return d;
};

export const CUBE_423_QUERIES: CubeQuerySpec[] = [
  {
    id: "423-nationality-marital",
    cube: CUBE_423,
    concept: "Chilean nationals in Zug by marital status and sex, 2023",
    query: q423([CHILE], [TOTAL], [TOTAL, "1", "2"], ["-99999", "1", "2", "3", "4", "-9"]),
    map: (c) => ({ ...map423(c, "nationality"), populationType: POP_101[c["Bevölkerungstyp"]] }),
    metric: "stock",
    referenceDateFor: () => "2023-12-31",
    crossTab: ["marital", "sex"],
  },
  {
    id: "423-born-marital",
    cube: CUBE_423,
    concept: "Chilean-born residents of Zug by marital status, 2023",
    query: q423([TOTAL], [CHILE], [TOTAL], ["-99999", "1", "2", "3", "4", "-9"]),
    map: (c) => ({ ...map423(c, "birthCountry"), populationType: POP_101[c["Bevölkerungstyp"]] }),
    metric: "stock",
    referenceDateFor: () => "2023-12-31",
    crossTab: ["birthCountry", "marital"],
  },
  {
    id: "423-nationality-birth",
    cube: CUBE_423,
    concept: "Chilean nationals in Zug born in Chile vs elsewhere, 2023",
    query: q423([CHILE], [CHILE, TOTAL], [TOTAL], [TOTAL]),
    map: (c) => {
      const d = map423(c, "nationality");
      d.birthCountry = c["Geburtsstaat"] === CHILE ? "CL" : "any";
      return { ...d, populationType: POP_101[c["Bevölkerungstyp"]] };
    },
    metric: "stock",
    referenceDateFor: () => "2023-12-31",
    crossTab: ["nationality", "birthCountry"],
  },
];

export const ALL_CUBE_QUERIES = [...CUBE_101_QUERIES, ...CUBE_399_QUERIES, ...CUBE_423_QUERIES];
