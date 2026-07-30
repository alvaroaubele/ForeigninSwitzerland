// Build the nationality registry: the single mapping between SEM row labels,
// BFS PxWeb codes, and ISO 3166-1 alpha-2 codes.
//
// Both sources label countries in German, so both are matched against the
// German display names of every ISO code (Intl.DisplayNames), normalised, with
// a curated override table for each source's abbreviations. The rule of the
// whole project applies here hardest: a label that cannot be classified is a
// build failure, never a guess. Every label from every source ends up in
// exactly one of three buckets — a country entry, a named special entry
// (stateless / unknown / groups), or the explicit skip list — or this script
// throws and nothing downstream runs.
//
// Output: data/registry.json (committed). The harvest and the app both read it.

import { writeFileSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { fetchRaw } from "./harvest/fetcher.js";

// ---------------------------------------------------------------------------
// ISO 3166-1 alpha-2 codes (assigned, in use), plus XK for Kosovo which both
// sources publish and which has a de-facto code used by Intl.
// ---------------------------------------------------------------------------
const ISO_CODES = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS",
  "BT","BV","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN",
  "CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE",
  "EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR","GA","GB","GD","GE","GF",
  "GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY","HK","HM",
  "HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM",
  "JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC",
  "LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MH","MK",
  "ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA",
  "NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG",
  "PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW",
  "SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS",
  "ST","SV","SX","SY","SZ","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO",
  "TR","TT","TV","TW","TZ","UA","UG","US","UY","UZ","VA","VC","VE","VG","VI","VN",
  "VU","WF","WS","YE","ZA","ZM","ZW","XK",
];

/** Normalise a German country label for matching across spelling variants. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents/umlauts — both sides normalised alike
    .replace(/\r?\n/g, " ")
    .replace(/\bu\./g, "und")
    .replace(/[().,/']/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Curated overrides: normalised label -> ISO. Applied before the Intl index,
// so a wrong Intl collision can always be pinned down here. Entries cover both
// sources; harmless if only one uses the spelling.
const OVERRIDES: Record<string, string> = {
  // SEM abbreviations and older names
  "kongo dr": "CD",
  "kongo kinshasa": "CD",
  "kongo": "CG",
  "kongo brazzaville": "CG",
  "v a emirate": "AE",
  "vereinigte arabische emirate": "AE",
  "usa": "US",
  "vereinigte staaten": "US",
  "vereinigte staaten von amerika": "US",
  "korea nord": "KP",
  "korea republik nord": "KP",
  "nordkorea": "KP",
  "korea sud": "KR",
  "korea süd": "KR",
  "sudkorea": "KR",
  "südkorea": "KR",
  "china volksrepublik": "CN",
  "china": "CN",
  "guyana republik": "GY",
  "guyana": "GY",
  "st vincent grenadinen": "VC",
  "st vincent und die grenadinen": "VC",
  "zentralafr republik": "CF",
  "zentralafrikanische republik": "CF",
  "kapverden": "CV",
  "kap verde": "CV",
  "cabo verde": "CV",
  "marshall inseln": "MH",
  "marshallinseln": "MH",
  "bangladesh": "BD",
  "bangladesch": "BD",
  "moldova": "MD",
  "republik moldau": "MD",
  "moldau": "MD",
  "zimbabwe": "ZW",
  "simbabwe": "ZW",
  "sao tome und principe": "ST",
  "são tomé und príncipe": "ST",
  "slowakische republik": "SK",
  "slowakei": "SK",
  "tschechische republik": "CZ",
  "tschechien": "CZ",
  "timor leste": "TL",
  "osttimor": "TL",
  "salomoninseln": "SB",
  "salomonen": "SB",
  "cookinseln": "CK",
  "cook inseln": "CK",
  "mikronesien": "FM",
  "myanmar": "MM",
  "myanmar birma": "MM",
  "burma": "MM",
  "brunei": "BN",
  "brunei darussalam": "BN",
  "vereinigtes konigreich": "GB",
  "vereinigtes königreich": "GB",
  "grossbritannien": "GB",
  "weissrussland": "BY",
  "belarus": "BY",
  "vatikanstadt": "VA",
  "vatikan": "VA",
  "heiliger stuhl": "VA",
  "palastina": "PS",
  "palästina": "PS",
  "palastinensische gebiete": "PS",
  "palästinensische gebiete": "PS",
  "hongkong": "HK",
  "macau": "MO",
  "westsahara": "EH",
  "nordmazedonien": "MK",
  "mazedonien": "MK",
  "eswatini": "SZ",
  "swasiland": "SZ",
  "fidschi": "FJ",
  "cote d ivoire": "CI",
  "côte d ivoire": "CI",
  "elfenbeinkuste": "CI",
  "turkei": "TR",
  "türkei": "TR",
  "turkiye": "TR",
  "laos": "LA",
  "syrien": "SY",
  "iran": "IR",
  "russland": "RU",
  "tansania": "TZ",
  "vietnam": "VN",
  "libyen": "LY",
  "venezuela": "VE",
  "bolivien": "BO",
  "taiwan": "TW",
  "taiwan chinesisches taipei": "TW",
  "chinesisches taipei taiwan": "TW",
  "kosovo": "XK",
};

// Labels that are aggregates or sheet furniture, never country rows. Kept in
// the registry output for the harvester's row classifier.
const SEM_SKIP = [
  "Gesamttotal",
  "EU / EFTA",
  "Drittstaaten",
  "Afrika",
  "Amerika",
  "Asien",
  "Europa",
  "Ozeanien",
  "Herkunft unbekannt",
  "Total Europa",
  "Total Afrika",
  "Total Amerika",
  "Total Asien",
  "Total Ozeanien",
  "Total Herkunft unbek.",
  "EU / EFTA\r\nKontinente\r\nNationen",
  "2-10", "2-20", "2-21", "2-22", "2-23", "2-40", "2-41",
  "3-30", "3-31", "3-55", "3-60",
];

// Sheet title rows vary by table, month and canton; matched by shape not text.
const SEM_SKIP_PATTERNS = [
  /Bestand ausländische Wohnbevölkerung/i,
  /^Kanton /,
  /nach Nationalität/i,
  /^\d-\d\d$/,
  /Kontinente/,
];

// SEM special populations that are real rows but not ISO countries.
const SEM_SPECIAL: Record<string, string> = {
  "Staatenlos": "_SL",
  "Ohne Nationalität": "_NONAT",
  "Staat unbekannt": "_UNK",
};
// BFS special codes (cube 101 / 423 nationality, 399/423 birth country).
const BFS_SPECIAL: Record<string, string> = {
  "-1": "_SL", // Staatenlos
  "-9": "_UNK", // Ohne Angabe
  "-6": "_NA_BORDERS", // Nicht zuteilbar gemäss den aktuellen Grenzen
};
const BFS_SKIP = new Set(["-99999", "8100"]); // total population, Switzerland

interface RegistryEntry {
  /** ISO 3166-1 alpha-2, or a pseudo-code for specials/groups (starts with _). */
  code: string;
  /** Canonical German label (BFS where available, else SEM). */
  de: string;
  bfs101?: string;
  bfs399Birth?: string;
  bfs423Nat?: string;
  bfs423Birth?: string;
  sem?: string;
}

async function cubeMeta(cube: string): Promise<{ code: string; values: string[]; valueTexts: string[] }[]> {
  const url = `https://www.pxweb.bfs.admin.ch/api/v1/de/${cube}/${cube}.px`;
  const res = await fetchRaw(url, { ext: "json", transport: "curl", label: `meta ${cube}` });
  return JSON.parse(res.buffer.toString("utf8")).variables;
}

async function main() {
  // German name -> ISO via Intl, overridable.
  const dn = new Intl.DisplayNames(["de"], { type: "region" });
  const intlIndex = new Map<string, string>();
  for (const iso of ISO_CODES) {
    const name = dn.of(iso);
    if (!name || name === iso) continue;
    const k = norm(name);
    // First writer wins; overrides exist to break any collision explicitly.
    if (!intlIndex.has(k)) intlIndex.set(k, iso);
  }
  const toIso = (label: string): string | null => OVERRIDES[norm(label)] ?? intlIndex.get(norm(label)) ?? null;

  const entries = new Map<string, RegistryEntry>();
  const upsert = (code: string, de: string): RegistryEntry => {
    let e = entries.get(code);
    if (!e) {
      e = { code, de };
      entries.set(code, e);
    }
    return e;
  };
  const failures: string[] = [];

  // ---- BFS dimensions ------------------------------------------------------
  const dims: { cube: string; dim: RegExp; field: keyof RegistryEntry }[] = [
    { cube: "px-x-0103010000_101", dim: /^Staatsangehörigkeit$/, field: "bfs101" },
    { cube: "px-x-0103010000_399", dim: /^Geburtsstaat$/, field: "bfs399Birth" },
    { cube: "px-x-0103010000_423", dim: /^Staatsangehörigkeit$/, field: "bfs423Nat" },
    { cube: "px-x-0103010000_423", dim: /^Geburtsstaat$/, field: "bfs423Birth" },
  ];
  for (const { cube, dim, field } of dims) {
    const vars = await cubeMeta(cube);
    const v = vars.find((x) => dim.test(x.code));
    if (!v) throw new Error(`${cube}: dimension ${dim} not found`);
    v.values.forEach((code, i) => {
      const text = v.valueTexts[i];
      if (BFS_SKIP.has(code)) return;
      const special = BFS_SPECIAL[code];
      if (special) {
        const e = upsert(special, text);
        (e as unknown as Record<string, string>)[field] = code;
        return;
      }
      const iso = toIso(text);
      if (!iso) {
        failures.push(`BFS ${cube} ${field}: unmatched label ${JSON.stringify(text)} (code ${code})`);
        return;
      }
      const e = upsert(iso, text);
      const prev = (e as unknown as Record<string, string | undefined>)[field];
      if (prev !== undefined && prev !== code) {
        failures.push(`BFS ${cube} ${field}: ISO ${iso} claimed by codes ${prev} and ${code}`);
        return;
      }
      (e as unknown as Record<string, string>)[field] = code;
    });
  }

  // ---- SEM rows (latest cached 2-10 workbook, CH-Nati sheet) ---------------
  const semLabels = readSemLabels();
  const semSkipNorm = new Set(SEM_SKIP.map(norm));
  for (const label of semLabels) {
    if (semSkipNorm.has(norm(label))) continue;
    if (SEM_SKIP_PATTERNS.some((p) => p.test(label))) continue;
    const special = SEM_SPECIAL[label.trim()];
    if (special) {
      upsert(special, label.trim()).sem = label.trim();
      continue;
    }
    const iso = toIso(label);
    if (!iso) {
      failures.push(`SEM: unmatched row label ${JSON.stringify(label)}`);
      continue;
    }
    const e = upsert(iso, label.trim());
    if (e.sem !== undefined && e.sem !== label.trim()) {
      failures.push(`SEM: ISO ${iso} claimed by rows ${JSON.stringify(e.sem)} and ${JSON.stringify(label)}`);
      continue;
    }
    e.sem = label.trim();
  }

  // ---- Groups & the all-foreigners entry -----------------------------------
  // These SEM aggregate rows are real published populations, not sums we make.
  upsert("_ALL", "Ausländische Wohnbevölkerung").sem = "Gesamttotal";
  upsert("_EU_EFTA", "EU / EFTA").sem = "EU / EFTA";
  upsert("_THIRD", "Drittstaaten").sem = "Drittstaaten";

  if (failures.length > 0) {
    console.error(`registry build FAILED — ${failures.length} unclassified label(s):`);
    for (const f of failures) console.error("  " + f);
    process.exit(1);
  }

  const list = [...entries.values()].sort((a, b) => a.code.localeCompare(b.code));
  const counts = {
    total: list.length,
    withSem: list.filter((e) => e.sem).length,
    withBfs101: list.filter((e) => e.bfs101).length,
    withBfs399: list.filter((e) => e.bfs399Birth).length,
    inBoth: list.filter((e) => e.sem && e.bfs101).length,
  };
  writeFileSync(
    "data/registry.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), counts, semSkip: SEM_SKIP, entries: list }, null, 1),
  );
  console.log("registry written:", JSON.stringify(counts));
}

function readSemLabels(): string[] {
  // Latest cached 2-10 workbook; the CH-Nati sheet carries the full national
  // inventory (canton sheets list only countries present in that canton).
  const key = "3d93c3b16b657527"; // 2-10-Best-Tot-Kat-d-2025-06
  const wb = XLSX.read(readFileSync(`data/raw/${key}.xlsx`), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets["CH-Nati"], {
    header: 1,
    raw: true,
    defval: null,
  });
  const labels: string[] = [];
  for (const r of rows) {
    if (r && typeof r[0] === "string" && r[0].trim()) labels.push(r[0]);
  }
  return labels;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
