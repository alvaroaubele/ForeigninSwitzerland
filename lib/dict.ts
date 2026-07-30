// The four-language dictionary.
//
// Every user-facing sentence lives here, typed, so a missing translation is a
// compile error rather than a stray English sentence in the Spanish page.
// Parameterised strings are functions — the sentences compose computed figures,
// and word order differs between the languages, so template positions cannot be
// assumed. Anything set in mono as a register citation (table ids, cube names,
// "SEM · 2-10 · ref …") deliberately stays untranslated: those are source
// citations, not prose.
import type { CellState, Dimensions, Observation } from "./types";

export type Locale = "en" | "es" | "de" | "fr";

/** Number formatting follows the reader: 3,303 / 3.303 / 3'303 / 3 303. */
export const NUMBER_LOCALE: Record<Locale, string> = {
  en: "en-US",
  es: "es-CL",
  de: "de-CH",
  fr: "fr-CH",
};

export interface Dict {
  nav: { contrast: string; portrait: string; trend: string; movement: string; crossfilter: string; comparison: string; method: string };
  header: { title: string; cells: (n: string) => string; loading: string };
  /** Display names for the non-country population codes (the _ pseudo-codes). */
  nats: Record<string, string>;
  /** "nationals of <country>" in this locale, grammar-safe for any country name. */
  natOf: (name: string) => string;
  natPicker: { label: string; pickerLabel: string; search: string; empty: string };
  canton: { showing: string; back: string; backTitle: string; pickerLabel: string; rowTitle: (name: string) => string; view: string };
  theme: { toDark: string; toLight: string };
  main: { loadingCanton: string; error: (msg: string) => string };
  states: { label: Record<CellState, string>; desc: Record<CellState, string> };
  dims: Record<keyof Dimensions, string>;
  values: Record<string, string>;
  metrics: Record<Observation["metric"], string>;
  findings: {
    h: string;
    intro: (who: string, canton: string) => string;
    twoCountsH: string;
    twoCountsD: (nat: string, p: string, b: string) => string;
    twoCountsCta: string;
    becameSwissH: string;
    becameSwissD: (nat: string, b: string, swiss: string) => string;
    becameSwissCta: (b: string) => string;
    familyH: string;
    familyD: (all: string, years: number, family: string, leads: boolean) => string;
    familyCta: string;
    nobody: string;
    over65H0: string;
    over65H: string;
    over65D0: (p: string, recent: string | null) => string;
    over65D: (p: string, recent: string | null) => string;
    over65Cta: string;
  };
  hero: {
    eyebrow: string;
    h: string;
    lead: (nat: string, canton: string, p: string, b: string) => string;
    /** Group populations (all foreigners, EU/EFTA…) have no birth-country side. */
    leadGroup: (who: string, canton: string, p: string, tot: string) => string;
    kickerPassport: (nat: string) => string;
    kickerBorn: (nat: string) => string;
    footSem: (date: string) => string;
    footBfs: string;
    splitHead: (nat: string, b: string) => string;
    splitAria: string;
    insight: (swiss: string, born: string, pct: number) => string;
    awaiting: string;
    offsetNote: string;
  };
  portrait: {
    eyebrow: string;
    whoAre: (n: string) => string;
    nobodyPassport: (nat: string, canton: string) => string;
    nobodyBorn: (nat: string, canton: string) => string;
    leadNationals: (who: string, canton: string) => string;
    leadBorn: (nat: string, canton: string, swiss: string, rest: string) => string;
    popPassport: (nat: string) => string;
    popBorn: (nat: string) => string;
    everyone: string;
    splitBySex: string;
    women: string;
    men: string;
    refSem: (date: string) => string;
    refBfs: (year: number) => string;
    wallSem: string;
    wallBorn: string;
    marriedToSwiss: (n: string) => string;
    bornMaritalNote: (nat: string, year: number, total: string, head: string) => string;
    ageSumNote: string;
  };
  trend: {
    eyebrow: string;
    h: string;
    lead: (who: string, canton: string, small: boolean) => string;
    total: string;
    bySex: string;
    byPermit: string;
    yearly: string;
    monthly: string;
    seriesBfs: string;
    seriesSemDec: string;
    seriesSemMonthly: string;
    peak: (n: string) => string;
    low: (n: string) => string;
    permit: (code: string) => string;
    awaitBfs: string;
    chartAria: string;
  };
  movement: {
    eyebrow: string;
    last12Eyebrow: string;
    whyCame: string;
    whoLeft: string;
    becameSwiss: string;
    spanYears: (n: number) => string;
    spanYear: (y: number) => string;
    span12: string;
    leadArrivals: (grand: string, span: string) => string;
    leadTop: (label: string, val: string) => string;
    leadNoRefugees: string;
    leadDepartures: (grand: string, span: string) => string;
    leadSwiss: (who: string, grand: string, span: string) => string;
    periodAll: (a: number, b: number) => string;
    period12: string;
    periodAria: string;
    segAll: string;
    segPermVsNon: string;
    everyone: string;
    splitBySex: string;
    capPermanent: string;
    capNonPermanent: string;
    capWomen: string;
    capMen: string;
    wallArrivals: string;
    footArrivals: (perm: string, nonPerm: string) => string;
    footOther: (who: string) => string;
    footWomenMen: (w: string, m: string) => string;
    titlePartial: (total: string) => string;
    titleZero: string;
    titleTotal: (total: string) => string;
    srcYear: string;
    srcRolling: string;
  };
  xf: {
    eyebrow: string;
    h: string;
    lead: string;
    try: string;
    presetWomenC: string;
    presetUnder5: string;
    presetBornSwiss: (nat: string) => string;
    presetRetirement: string;
    presetWall: string;
    fieldSourceMetric: string;
    fieldMetric: string;
    fieldRefMonth: string;
    fieldRefYear: string;
    fieldPopType: string;
    popPermanent: string;
    popNonPermanent: string;
    popTotalStock: string;
    popTotal: string;
    hint: string;
    wallBanner: string;
    passportOfBorn: (nat: string) => string;
    any: string;
    neverPublished: string;
    notPubWithCarrier: (carrier: string) => string;
    notPubBare: string;
    dropBtn: (dim: string) => string;
    share: (pct: string, total: string) => string;
    siblingsH: (dim: string) => string;
    previewIdle: string;
    previewNever: string;
    persons: string;
    zeroSuffix: string;
    clear: (n: number) => string;
    chipNever: (label: string) => string;
    chipOutcome: (label: string, val: string, state: string) => string;
  };
  explorer: { exportLabel: string; csv: string; json: string };
  baselines: {
    eyebrow: string;
    h: (who: string) => string;
    leadTop3: (a: string, b: string, c: string) => string;
    leadRest: (date: string) => string;
    cardIn: (who: string, canton: string) => string;
    ofWhomPermanent: string;
    shareForeign: (canton: string) => string;
    foreignSub: (n: string) => string;
    shareNational: (who: string) => string;
    nationalSub: (n: string) => string;
    largest: (canton: string) => string;
    largestSub: (pct: string) => string;
    totalInclNP: string;
    permSub: (n: string) => string;
    segCount: string;
    segPer1000: string;
    segIndex: string;
    axis: (who: string) => string;
    refTitle: string;
    foot: string;
  };
  availability: {
    eyebrow: string;
    h: string;
    lead: string;
    crossTab: string;
    never: string;
    neverNote: string;
    hint: string;
  };
  method: {
    eyebrow: string;
    h: string;
    lead: string;
    offsetH: string;
    offsetP: string;
    synthH: string;
    synthP1: string;
    synthP2: string;
    sourcesH: string;
    colSource: string;
    colCarries: string;
    colCells: string;
  };
  appendix: { eyebrow: string; title: string; sub: string };
  footer: {
    note: string;
    sources: string;
    download: (canton: string) => string;
    csv: string;
    json: string;
    bottom: string;
  };
}

// ---------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------
const en: Dict = {
  nav: { contrast: "Contrast", portrait: "Portrait", trend: "Trend", movement: "Movement", crossfilter: "Cross-filter", comparison: "Comparison", method: "Method" },
  header: { title: "Foreigners in Switzerland", cells: (n) => `${n} harvested cells`, loading: "loading…" },
  nats: {
    _ALL: "All foreign nationals",
    _EU_EFTA: "EU / EFTA nationals",
    _THIRD: "Third-country nationals",
    _SL: "Stateless",
    _NONAT: "Without nationality",
    _UNK: "Nationality unknown",
    _NA_BORDERS: "Not attributable to current borders",
  },
  natOf: (name) => `nationals of ${name}`,
  natPicker: { label: "Population", pickerLabel: "Nationality", search: "Type a country…", empty: "No match — the register carries no such country." },
  canton: { showing: "Showing", back: "← Switzerland", backTitle: "Back to the national view", pickerLabel: "Canton", rowTitle: (name) => `Show ${name} across the whole page`, view: "view →" },
  theme: { toDark: "Switch to dark theme", toLight: "Switch to light theme" },
  main: { loadingCanton: "Loading canton data…", error: (msg) => `Something failed to load: ${msg}. The figures shown may be for the previously selected canton — reloading the page usually fixes it.` },
  states: {
    label: { observed: "Observed", structural_zero: "Structural zero", suppressed: "Suppressed", not_published: "Not published" },
    desc: {
      observed: "A real published figure from the source.",
      structural_zero: "The source published this cell and the count is 0 — nobody is in it, as opposed to nobody having counted.",
      suppressed: "Exists but withheld below the source's publication threshold.",
      not_published: "The source never cross-tabulated these dimensions.",
    },
  },
  dims: {
    canton: "Canton", year: "Year", month: "Month", sex: "Sex", permit: "Permit type", legalBasis: "Legal basis",
    ageClass: "Age class", marital: "Marital status", marriedToSwiss: "Married to a Swiss national",
    lengthOfStay: "Length of stay", reason: "Reason for immigration", nationality: "Citizenship",
    birthCountry: "Birth country", nationalityGroup: "Passport group", naturalisationType: "Naturalisation type",
  },
  values: {
    ordinary: "Ordinary naturalisation", facilitated: "Facilitated (usually via a Swiss spouse)", reinstated: "Reinstated citizenship", all: "All naturalisations",
    total: "Total", female: "Female", male: "Male", permanent: "Permanent", non_permanent: "Non-permanent",
    CL: "Chile", CH: "Switzerland", single: "Single", married: "Married", widowed: "Widowed", divorced: "Divorced",
    registered_partnership: "Registered partnership", dissolved_partnership: "Dissolved partnership", unknown: "Unknown",
    quota_employment: "Quota employment", nonquota_employment: "Non-quota employment", family_reunification: "Family reunification",
    education: "Education & training", residence_no_employment: "Residence without employment", refugee: "Recognised refugee",
    hardship: "Hardship after asylum", asylum_ruling: "Immigration-law ruling", other: "Other",
    FZA: "FZA (free movement)", AIG: "AIG (third-country)", yes: "Yes", no: "No",
  },
  metrics: { stock: "Resident stock", immigration: "Immigration (inflow)", emigration: "Emigration (outflow)", naturalisation: "Naturalisation" },
  findings: {
    h: "What the official numbers say",
    intro: (who, canton) => `Four things worth knowing about ${who} in ${canton} — then the data itself, which you can pull apart however you like. Where a figure was never published, this page says so rather than showing a blank.`,
    twoCountsH: "Two counts, one community",
    twoCountsD: (nat, p, b) => `${p} people hold the passport; ${b} were born in ${nat}. Counting one misses most of the other.`,
    twoCountsCta: "See the split",
    becameSwissH: "Have become Swiss",
    becameSwissD: (nat, b, swiss) => `Of the ${b} born in ${nat}, ${swiss} now hold a Swiss passport.`,
    becameSwissCta: (b) => `Meet the ${b}`,
    familyH: "Came to join family",
    familyD: (all, years, family, leads) => `Of ${all} arrivals over ${years} years, ${family} came through family reunification${leads ? " — more than work and study together" : ""}.`,
    familyCta: "Why they came",
    nobody: "Nobody",
    over65H0: "Is over 65",
    over65H: "Are over 65",
    over65D0: (p, recent) => `Not one of the ${p} is of retirement age${recent ? `, and ${recent} arrived within the last five years` : ""}. A young, recently-arrived group.`,
    over65D: (p, recent) => `Out of ${p} passport holders${recent ? `, with ${recent} who arrived within the last five years` : ""}.`,
    over65Cta: "See the portrait",
  },
  hero: {
    eyebrow: "Two ways to count",
    h: "The community is bigger than the passport count",
    lead: (nat, canton, p, b) => `${canton} counts ${p} passport holders — and ${b} residents born in ${nat}. Many of those born there have since taken Swiss or other citizenship, so counting passports alone misses a large part of the community.`,
    leadGroup: (who, canton, p, tot) => `${canton} counts ${p} permanent residents among ${who} — ${tot} including non-permanent permits. Pick a country above to see how its passport count compares with the number of people actually born there.`,
    kickerPassport: (nat) => `Hold a passport — ${nat}`,
    kickerBorn: (nat) => `Were born in ${nat}`,
    footSem: (date) => `SEM · ${date} · permanent residents`,
    footBfs: "BFS STATPOP · 31 Dec 2024 · permanent residents",
    splitHead: (nat, b) => `The ${b} residents born in ${nat}, by the passport they actually hold`,
    splitAria: "Passport composition of the foreign-born residents",
    insight: (swiss, born, pct) => `${swiss} of the ${born} — ${pct}% — now hold a Swiss passport. Naturalisation and mixed-nationality families make birthplace and citizenship diverge sharply.`,
    awaiting: "The passport split comes from BFS STATPOP cube 399.",
    offsetNote: "These two reference dates are ~17 months apart. The offset is real and is preserved throughout this explorer — the two series are never reconciled to a single figure.",
  },
  portrait: {
    eyebrow: "Portrait",
    whoAre: (n) => `Who are the ${n}?`,
    nobodyPassport: (nat, canton) => `Nobody in ${canton} holds this passport — ${nat}`,
    nobodyBorn: (nat, canton) => `Nobody in ${canton} was born in ${nat}`,
    leadNationals: (who, canton) => `Every one of the ${who} in ${canton}, by every attribute the register carries. Split by sex to go one level deeper — as far as SEM goes, since it crosses these with sex and with nothing else. BFS goes further: the cross-filter below answers permit, sex and age together.`,
    leadBorn: (nat, canton, swiss, rest) => `Everyone in ${canton} born in ${nat} — a larger and mostly different group. ${swiss} hold Swiss citizenship; the other ${rest} carry the passports shown below and appear nowhere in the Swiss count.`,
    popPassport: (nat) => `Passport: ${nat}`,
    popBorn: (nat) => `Born in ${nat}`,
    everyone: "Everyone",
    splitBySex: "Split by sex",
    women: "Women",
    men: "Men",
    refSem: (date) => `SEM · ${date} · permanent`,
    refBfs: (year) => `BFS STATPOP · 31 Dec ${year} · permanent`,
    wallSem: "Not published by sex — SEM reports marital status for the group as a whole only.",
    wallBorn: "Not published by sex for this population.",
    marriedToSwiss: (n) => `Of the married, ${n} are married to a Swiss national.`,
    bornMaritalNote: (nat, year, total, head) => `Marital status for those born in ${nat} comes from a different cube and an earlier year (31 Dec ${year}), so it counts ${total} rather than ${head}. The dates are not reconciled.`,
    ageSumNote: "Summed from the 21 five-year bands BFS publishes — exact arithmetic, not an estimate.",
  },
  trend: {
    eyebrow: "Time · 2010–2026",
    h: "Sixteen years, two registers",
    lead: (who, canton, small) => `${who} in ${canton}, as counted by two registers that do not agree and are not reconciled here.${small ? " At this size a single family arriving moves the line." : ""}`,
    total: "Total", bySex: "By sex", byPermit: "By permit", yearly: "Yearly", monthly: "Monthly",
    seriesBfs: "BFS STATPOP (register, 31 Dec)",
    seriesSemDec: "SEM (administrative, 31 Dec)",
    seriesSemMonthly: "SEM (administrative, monthly)",
    peak: (n) => `peak ${n}`,
    low: (n) => `low ${n}`,
    permit: (code) => `Permit ${code}`,
    awaitBfs: "The annual series is carried by BFS STATPOP cube 101. It is not present in this build of the harvest yet.",
    chartAria: "Time series. Focus and use arrow keys to read each year.",
  },
  movement: {
    eyebrow: "Movement",
    last12Eyebrow: "last 12 months",
    whyCame: "Why they came", whoLeft: "Who left", becameSwiss: "Who became Swiss",
    spanYears: (n) => `over ${n} years`,
    spanYear: (y) => `in ${y}`,
    span12: "in the last twelve months",
    leadArrivals: (grand, span) => `${grand} people arrived ${span}.`,
    leadTop: (label, val) => ` The largest single reason is ${label} at ${val}.`,
    leadNoRefugees: " Nobody arrived as a refugee, on hardship grounds, or through an asylum ruling.",
    leadDepartures: (grand, span) => `${grand} people left ${span} — close to the number who arrived, which is why the population changes so slowly.`,
    leadSwiss: (who, grand, span) => `${grand} of the ${who} became Swiss citizens ${span}. Every one of them leaves the passport count while remaining in the birthplace count — a large part of why the two differ so much.`,
    periodAll: (a, b) => `Full period ${a}–${b}`,
    period12: "Last 12 months",
    periodAria: "Period",
    segAll: "All",
    segPermVsNon: "Permanent vs non-permanent",
    everyone: "Everyone",
    splitBySex: "Split by sex",
    capPermanent: "Permanent", capNonPermanent: "Non-permanent", capWomen: "Women", capMen: "Men",
    wallArrivals: "Arrivals cannot be split by sex or age. SEM table 3-30 is eleven columns wide — nation, total, and the nine reasons above — with no sex or age block anywhere in the sheet. Departures and naturalisations do carry sex; the other two tabs split.",
    footArrivals: (perm, nonPerm) => `Permanent arrivals ${perm} · non-permanent ${nonPerm}. Non-permanent covers short-stay permits, which is why study dominates it. A dash means that table does not carry the category at all, as opposed to a ring, which is a counted zero: the category exists and nobody used it.`,
    footOther: (who) => `${who} Rings are counted zeros — the category exists in the table and nobody appears in it across the whole period.`,
    footWomenMen: (w, m) => `Women ${w} · men ${m}.`,
    titlePartial: (total) => `${total} counted; one of the two tables does not carry this category, so this is a floor.`,
    titleZero: "A counted zero — the category exists and nobody used it in this period.",
    titleTotal: (total) => `${total} people in this period.`,
    srcYear: "calendar-year totals",
    srcRolling: "rolling 12-month release",
  },
  xf: {
    eyebrow: "Cross-filter",
    h: "Ask your own question",
    lead: "Every option shows its answer before you pick it. Dashed options were never published — no source crosses that combination. BFS answers up to three attributes at once; SEM answers one, plus sex.",
    try: "Try:",
    presetWomenC: "Women on a C permit",
    presetUnder5: "Here under 5 years",
    presetBornSwiss: (nat) => `Born in ${nat}, Swiss passport`,
    presetRetirement: "Of retirement age",
    presetWall: "Married newcomers — never counted",
    fieldSourceMetric: "Source & metric",
    fieldMetric: "Metric",
    fieldRefMonth: "Reference month",
    fieldRefYear: "Reference year",
    fieldPopType: "Population type",
    popPermanent: "Permanent",
    popNonPermanent: "Non-permanent",
    popTotalStock: "Total (perm + non-perm)",
    popTotal: "Total",
    hint: "Each option shows what it resolves to. A dotted mark means the sources never crossed those dimensions — still selectable, because that absence is itself the finding.",
    wallBanner: "Every option below is dashed because the current combination was never published — drop one of the selected dimensions to continue.",
    passportOfBorn: (nat) => `Passport group · of those born in ${nat}`,
    any: "Any",
    neverPublished: "never published",
    notPubWithCarrier: (carrier) => `The sources never cross-tabulated these dimensions for this population — the nearest table, ${carrier}, does not combine them.`,
    notPubBare: "The source never cross-tabulated these dimensions.",
    dropBtn: (dim) => `Nearest published answer: drop “${dim}” → `,
    share: (pct, total) => `= ${pct}% of ${total} in the whole group`,
    siblingsH: (dim) => `${dim} — the full split`,
    previewIdle: "Hover an option to preview its answer",
    previewNever: "never published",
    persons: "persons",
    zeroSuffix: " · a genuine zero, not missing data",
    clear: (n) => `Clear ${n} breakdown${n > 1 ? "s" : ""}`,
    chipNever: (label) => `${label} — never published for this population`,
    chipOutcome: (label, val, state) => `${label} → ${val} (${state})`,
  },
  explorer: { exportLabel: "Export current view with full provenance columns", csv: "Download CSV", json: "Download JSON" },
  baselines: {
    eyebrow: "Comparison",
    h: (who) => `Where ${who} actually live`,
    leadTop3: (a, b, c) => `${a}, ${b} and ${c} hold the largest communities. `,
    leadRest: (date) => `Measured per 1,000 foreign residents the ranking changes, because a big canton has more of everyone. Click any canton to view it across the whole page. SEM permanent residents, ${date}.`,
    cardIn: (who, canton) => `${who} in ${canton}`,
    ofWhomPermanent: "of whom permanent",
    shareForeign: (canton) => `Share of ${canton}’s foreign residents`,
    foreignSub: (n) => `${n} foreign residents`,
    shareNational: (who) => `Share of all ${who} in Switzerland`,
    nationalSub: (n) => `${n} in Switzerland`,
    largest: (canton) => `Largest community: ${canton}`,
    largestSub: (pct) => `${pct}% of the national total`,
    totalInclNP: "Total incl. non-permanent",
    permSub: (n) => `${n} permanent`,
    segCount: "Absolute count",
    segPer1000: "Per 1,000 foreign residents",
    segIndex: "Index vs national rate",
    axis: (who) => `permanent ${who}`,
    refTitle: "National average = 100",
    foot: "Per-capita uses SEM’s count of all foreign residents per canton as the denominator (register totals including Swiss nationals are a BFS concept with a different reference date). The index expresses each canton’s community-to-foreign ratio relative to the national ratio.",
  },
  availability: {
    eyebrow: "What is knowable",
    h: "What can be known at all",
    lead: "A filled square means some source publishes those two things together. Most of this grid is empty.",
    crossTab: "Cross-tabulated",
    never: "Never published",
    neverNote: "No harvested source crosses these two dimensions for this population.",
    hint: "Hover a square to see which source carries that cross-tab.",
  },
  method: {
    eyebrow: "Method",
    h: "Four states, two sources, one honest offset",
    lead: "In most cantons these populations number in the tens. At that size a blank usually means “never measured”, not “nobody here” — and every figure on this page says which of the two it is.",
    offsetH: "The reference-date offset",
    offsetP: "SEM Ausländerstatistik is an administrative count from the central migration register, published monthly; the latest here is 31 May 2026. BFS STATPOP is the annual population register, published for year-end; the latest complete year is 31 Dec 2024. The two are roughly seventeen months apart. Where both measure the same concept they will disagree slightly — that offset is recorded and never reconciled away. SEM answers “who holds which permit right now”; BFS answers “who was born where, as of last New Year’s Eve”.",
    synthH: "No synthesis",
    synthP1: "Nothing here is interpolated, imputed, smoothed, or estimated. Time-series lines are drawn straight between observed points. Percentages always carry their denominator. Every figure is traceable — hover any number to see its source table or cube query, the sheet/row or dimension selection, the reference date, and the retrieval timestamp — and the full harvest is reproducible via ",
    synthP2: ".",
    sourcesH: "Source inventory",
    colSource: "Source",
    colCarries: "What it carries",
    colCells: "Cells",
  },
  appendix: {
    eyebrow: "Method & coverage",
    title: "How these figures were made, and what they cannot say",
    sub: "The four states, the reference-date offset between the two registers, which cross-tabulations exist, and the full source inventory.",
  },
  footer: {
    note: "An honest exploration of official statistics on every foreign nationality in Switzerland, nationally and canton by canton. Built only from harvested open data; nothing is estimated.",
    sources: "Sources",
    download: (canton) => `Download ${canton}`,
    csv: "Every cell, CSV",
    json: "Every cell, JSON",
    bottom: "SEM 31 May 2026 · BFS STATPOP 31 Dec 2024 · reference dates preserved, never reconciled",
  },
};

// ---------------------------------------------------------------------------
// Spanish (Chilean conventions; numbers format as 3.303)
// ---------------------------------------------------------------------------
const es: Dict = {
  nav: { contrast: "Contraste", portrait: "Retrato", trend: "Evolución", movement: "Movimientos", crossfilter: "Explorador", comparison: "Comparación", method: "Método" },
  header: { title: "Extranjeros en Suiza", cells: (n) => `${n} celdas cosechadas`, loading: "cargando…" },
  nats: {
    _ALL: "Todos los extranjeros",
    _EU_EFTA: "Nacionales UE / AELC",
    _THIRD: "Nacionales de terceros países",
    _SL: "Apátridas",
    _NONAT: "Sin nacionalidad",
    _UNK: "Nacionalidad desconocida",
    _NA_BORDERS: "No atribuible a las fronteras actuales",
  },
  natOf: (name) => `nacionales de ${name}`,
  natPicker: { label: "Población", pickerLabel: "Nacionalidad", search: "Escribe un país…", empty: "Sin coincidencias — el registro no trae ese país." },
  canton: { showing: "Mostrando", back: "← Suiza", backTitle: "Volver a la vista nacional", pickerLabel: "Cantón", rowTitle: (name) => `Ver ${name} en toda la página`, view: "ver →" },
  theme: { toDark: "Cambiar a tema oscuro", toLight: "Cambiar a tema claro" },
  main: { loadingCanton: "Cargando datos del cantón…", error: (msg) => `Algo no se pudo cargar: ${msg}. Las cifras mostradas pueden ser del cantón anterior — recargar la página suele resolverlo.` },
  states: {
    label: { observed: "Observado", structural_zero: "Cero estructural", suppressed: "Suprimido", not_published: "No publicado" },
    desc: {
      observed: "Una cifra real publicada por la fuente.",
      structural_zero: "La fuente publicó esta celda y el conteo es 0: no hay nadie, no que nadie haya contado.",
      suppressed: "Existe, pero se retiene por estar bajo el umbral de publicación de la fuente.",
      not_published: "La fuente nunca cruzó estas dimensiones.",
    },
  },
  dims: {
    canton: "Cantón", year: "Año", month: "Mes", sex: "Sexo", permit: "Tipo de permiso", legalBasis: "Base legal",
    ageClass: "Tramo de edad", marital: "Estado civil", marriedToSwiss: "Casado/a con persona suiza",
    lengthOfStay: "Años de residencia", reason: "Motivo de inmigración", nationality: "Nacionalidad",
    birthCountry: "País de nacimiento", nationalityGroup: "Grupo de pasaporte", naturalisationType: "Tipo de naturalización",
  },
  values: {
    ordinary: "Naturalización ordinaria", facilitated: "Facilitada (por lo general vía cónyuge suizo)", reinstated: "Reintegración de ciudadanía", all: "Todas las naturalizaciones",
    total: "Total", female: "Mujeres", male: "Hombres", permanent: "Permanente", non_permanent: "No permanente",
    CL: "Chile", CH: "Suiza", single: "Solteros/as", married: "Casados/as", widowed: "Viudos/as", divorced: "Divorciados/as",
    registered_partnership: "Unión registrada", dissolved_partnership: "Unión disuelta", unknown: "Sin dato",
    quota_employment: "Empleo con contingente", nonquota_employment: "Empleo sin contingente", family_reunification: "Reagrupación familiar",
    education: "Estudios y formación", residence_no_employment: "Residencia sin empleo", refugee: "Refugiado reconocido",
    hardship: "Caso de rigor tras asilo", asylum_ruling: "Resolución migratoria", other: "Otros",
    FZA: "ALCP (libre circulación)", AIG: "LEI (terceros países)", yes: "Sí", no: "No",
  },
  metrics: { stock: "Población residente", immigration: "Inmigración (entradas)", emigration: "Emigración (salidas)", naturalisation: "Naturalización" },
  findings: {
    h: "Lo que dicen las cifras oficiales",
    intro: (who, canton) => `Cuatro cosas que vale la pena saber sobre ${who} en ${canton} — y luego los datos mismos, para explorarlos como quieras. Cuando una cifra nunca se publicó, esta página lo dice en vez de mostrar un vacío.`,
    twoCountsH: "Dos conteos, una comunidad",
    twoCountsD: (nat, p, b) => `${p} personas tienen el pasaporte; ${b} nacieron en ${nat}. Contar solo una deja fuera a la mayor parte de la otra.`,
    twoCountsCta: "Ver el desglose",
    becameSwissH: "Se hicieron suizos",
    becameSwissD: (nat, b, swiss) => `De los ${b} nacidos en ${nat}, ${swiss} tienen hoy pasaporte suizo.`,
    becameSwissCta: (b) => `Conoce a los ${b}`,
    familyH: "Llegaron por la familia",
    familyD: (all, years, family, leads) => `De ${all} llegadas en ${years} años, ${family} fueron por reagrupación familiar${leads ? " — más que trabajo y estudios juntos" : ""}.`,
    familyCta: "Por qué llegaron",
    nobody: "Nadie",
    over65H0: "Tiene más de 65",
    over65H: "Tienen más de 65",
    over65D0: (p, recent) => `Ninguna de las ${p} personas está en edad de jubilar${recent ? `, y ${recent} llegaron en los últimos cinco años` : ""}. Un grupo joven y de llegada reciente.`,
    over65D: (p, recent) => `De ${p} personas con este pasaporte${recent ? `, ${recent} llegaron en los últimos cinco años` : ""}.`,
    over65Cta: "Ver el retrato",
  },
  hero: {
    eyebrow: "Dos formas de contar",
    h: "La comunidad es más grande que el conteo de pasaportes",
    lead: (nat, canton, p, b) => `${canton} registra ${p} personas con el pasaporte — y ${b} residentes nacidos en ${nat}. Muchos de los nacidos allí ya tomaron la ciudadanía suiza u otra, así que contar solo pasaportes deja fuera a gran parte de la comunidad.`,
    leadGroup: (who, canton, p, tot) => `${canton} registra ${p} residentes permanentes (${who}) — ${tot} incluyendo permisos no permanentes. Elige un país arriba para ver cómo su conteo de pasaportes se compara con las personas realmente nacidas allí.`,
    kickerPassport: (nat) => `Tienen pasaporte — ${nat}`,
    kickerBorn: (nat) => `Nacieron en ${nat}`,
    footSem: (date) => `SEM · ${date} · residentes permanentes`,
    footBfs: "BFS STATPOP · 31 dic 2024 · residentes permanentes",
    splitHead: (nat, b) => `Los ${b} residentes nacidos en ${nat}, según el pasaporte que realmente tienen`,
    splitAria: "Composición por pasaporte de los residentes nacidos en el país seleccionado",
    insight: (swiss, born, pct) => `${swiss} de los ${born} — el ${pct}% — tienen hoy pasaporte suizo. La naturalización y las familias de nacionalidad mixta hacen que lugar de nacimiento y ciudadanía diverjan fuertemente.`,
    awaiting: "El desglose por pasaporte proviene del cubo 399 de BFS STATPOP.",
    offsetNote: "Estas dos fechas de referencia están separadas por ~17 meses. El desfase es real y se preserva en todo el explorador — las dos series nunca se reconcilian en una sola cifra.",
  },
  portrait: {
    eyebrow: "Retrato",
    whoAre: (n) => `¿Quiénes son los ${n}?`,
    nobodyPassport: (nat, canton) => `Nadie en ${canton} tiene este pasaporte — ${nat}`,
    nobodyBorn: (nat, canton) => `Nadie en ${canton} nació en ${nat}`,
    leadNationals: (who, canton) => `Cada una de las personas (${who}) en ${canton}, según cada atributo que registra la fuente. Divide por sexo para bajar un nivel más — hasta ahí llega el SEM, que solo cruza estos atributos con sexo. BFS llega más lejos: el explorador de abajo responde permiso, sexo y edad a la vez.`,
    leadBorn: (nat, canton, swiss, rest) => `Todas las personas de ${canton} nacidas en ${nat} — un grupo más grande y en su mayoría distinto. ${swiss} tienen ciudadanía suiza; los otros ${rest} llevan los pasaportes que se muestran abajo y no aparecen en el conteo suizo.`,
    popPassport: (nat) => `Pasaporte: ${nat}`,
    popBorn: (nat) => `Nacidos en ${nat}`,
    everyone: "Todos",
    splitBySex: "Por sexo",
    women: "Mujeres",
    men: "Hombres",
    refSem: (date) => `SEM · ${date} · permanentes`,
    refBfs: (year) => `BFS STATPOP · 31 dic ${year} · permanentes`,
    wallSem: "No se publica por sexo — el SEM informa el estado civil solo para el grupo completo.",
    wallBorn: "No se publica por sexo para esta población.",
    marriedToSwiss: (n) => `De los casados, ${n} están casados con una persona suiza.`,
    bornMaritalNote: (nat, year, total, head) => `El estado civil de los nacidos en ${nat} viene de otro cubo y de un año anterior (31 dic ${year}), por eso cuenta ${total} y no ${head}. Las fechas no se reconcilian.`,
    ageSumNote: "Sumado de los 21 tramos quinquenales que publica BFS — aritmética exacta, no una estimación.",
  },
  trend: {
    eyebrow: "Tiempo · 2010–2026",
    h: "Dieciséis años, dos registros",
    lead: (who, canton, small) => `${who} en ${canton}, según dos registros que no coinciden y que aquí no se reconcilian.${small ? " A este tamaño, una sola familia que llega mueve la línea." : ""}`,
    total: "Total", bySex: "Por sexo", byPermit: "Por permiso", yearly: "Anual", monthly: "Mensual",
    seriesBfs: "BFS STATPOP (registro, 31 dic)",
    seriesSemDec: "SEM (administrativo, 31 dic)",
    seriesSemMonthly: "SEM (administrativo, mensual)",
    peak: (n) => `máximo ${n}`,
    low: (n) => `mínimo ${n}`,
    permit: (code) => `Permiso ${code}`,
    awaitBfs: "La serie anual proviene del cubo 101 de BFS STATPOP. Aún no está presente en esta cosecha.",
    chartAria: "Serie de tiempo. Enfoca y usa las flechas para leer cada año.",
  },
  movement: {
    eyebrow: "Movimientos",
    last12Eyebrow: "últimos 12 meses",
    whyCame: "Por qué llegaron", whoLeft: "Quiénes se fueron", becameSwiss: "Quiénes se hicieron suizos",
    spanYears: (n) => `en ${n} años`,
    spanYear: (y) => `en ${y}`,
    span12: "en los últimos doce meses",
    leadArrivals: (grand, span) => `${grand} personas llegaron ${span}.`,
    leadTop: (label, val) => ` El motivo más frecuente es ${label}, con ${val}.`,
    leadNoRefugees: " Nadie llegó como refugiado, por caso de rigor ni por resolución de asilo.",
    leadDepartures: (grand, span) => `${grand} personas se fueron ${span} — casi tantas como las que llegaron, y por eso la población cambia tan lento.`,
    leadSwiss: (who, grand, span) => `${grand} personas (${who}) se hicieron ciudadanas suizas ${span}. Cada una sale del conteo por pasaporte pero sigue en el de lugar de nacimiento — gran parte de por qué ambos difieren tanto.`,
    periodAll: (a, b) => `Período completo ${a}–${b}`,
    period12: "Últimos 12 meses",
    periodAria: "Período",
    segAll: "Todos",
    segPermVsNon: "Permanente vs no permanente",
    everyone: "Todos",
    splitBySex: "Por sexo",
    capPermanent: "Permanente", capNonPermanent: "No permanente", capWomen: "Mujeres", capMen: "Hombres",
    wallArrivals: "Las llegadas no se pueden dividir por sexo ni edad. La tabla 3-30 del SEM tiene once columnas — nación, total y los nueve motivos de arriba — sin ningún bloque de sexo o edad en la hoja. Las salidas y naturalizaciones sí traen sexo; las otras dos pestañas se dividen.",
    footArrivals: (perm, nonPerm) => `Llegadas permanentes ${perm} · no permanentes ${nonPerm}. Lo no permanente cubre permisos de corta duración, por eso dominan los estudios. Un guion significa que esa tabla no trae la categoría; un anillo es un cero contado: la categoría existe y nadie la usó.`,
    footOther: (who) => `${who} Los anillos son ceros contados — la categoría existe en la tabla y nadie aparece en ella en todo el período.`,
    footWomenMen: (w, m) => `Mujeres ${w} · hombres ${m}.`,
    titlePartial: (total) => `${total} contados; una de las dos tablas no trae esta categoría, así que es un piso, no un total.`,
    titleZero: "Un cero contado — la categoría existe y nadie la usó en este período.",
    titleTotal: (total) => `${total} personas en este período.`,
    srcYear: "totales por año calendario",
    srcRolling: "publicación móvil de 12 meses",
  },
  xf: {
    eyebrow: "Explorador",
    h: "Haz tu propia pregunta",
    lead: "Cada opción muestra su respuesta antes de elegirla. Las opciones punteadas nunca se publicaron — ninguna fuente cruza esa combinación. BFS responde hasta tres atributos a la vez; el SEM responde uno, más sexo.",
    try: "Prueba:",
    presetWomenC: "Mujeres con permiso C",
    presetUnder5: "Menos de 5 años aquí",
    presetBornSwiss: (nat) => `Nacidos en ${nat} con pasaporte suizo`,
    presetRetirement: "En edad de jubilar",
    presetWall: "Recién llegados casados — nunca contados",
    fieldSourceMetric: "Fuente y métrica",
    fieldMetric: "Métrica",
    fieldRefMonth: "Mes de referencia",
    fieldRefYear: "Año de referencia",
    fieldPopType: "Tipo de población",
    popPermanent: "Permanente",
    popNonPermanent: "No permanente",
    popTotalStock: "Total (perm + no perm)",
    popTotal: "Total",
    hint: "Cada opción muestra a qué resuelve. Una marca punteada significa que las fuentes nunca cruzaron esas dimensiones — igual se puede elegir, porque esa ausencia es en sí el hallazgo.",
    wallBanner: "Todas las opciones de abajo aparecen punteadas porque la combinación actual nunca se publicó — quita una de las dimensiones seleccionadas para continuar.",
    passportOfBorn: (nat) => `Grupo de pasaporte · de los nacidos en ${nat}`,
    any: "Cualquiera",
    neverPublished: "nunca publicado",
    notPubWithCarrier: (carrier) => `Las fuentes nunca cruzaron estas dimensiones para esta población — la tabla más cercana, ${carrier}, no las combina.`,
    notPubBare: "La fuente nunca cruzó estas dimensiones.",
    dropBtn: (dim) => `Respuesta publicada más cercana: quita “${dim}” → `,
    share: (pct, total) => `= ${pct}% de ${total} en el grupo completo`,
    siblingsH: (dim) => `${dim} — el desglose completo`,
    previewIdle: "Pasa el cursor sobre una opción para ver su respuesta",
    previewNever: "nunca publicado",
    persons: "personas",
    zeroSuffix: " · un cero real, no un dato faltante",
    clear: (n) => `Quitar ${n} filtro${n > 1 ? "s" : ""}`,
    chipNever: (label) => `${label} — nunca publicado para esta población`,
    chipOutcome: (label, val, state) => `${label} → ${val} (${state})`,
  },
  explorer: { exportLabel: "Exporta la vista actual con columnas de procedencia completas", csv: "Descargar CSV", json: "Descargar JSON" },
  baselines: {
    eyebrow: "Comparación",
    h: (who) => `Dónde viven realmente (${who})`,
    leadTop3: (a, b, c) => `${a}, ${b} y ${c} concentran las comunidades más grandes. `,
    leadRest: (date) => `Medido por cada 1.000 residentes extranjeros el ranking cambia, porque un cantón grande tiene más de todo. Haz clic en cualquier cantón para verlo en toda la página. Residentes permanentes del SEM, ${date}.`,
    cardIn: (who, canton) => `${who} en ${canton}`,
    ofWhomPermanent: "de ellos permanentes",
    shareForeign: (canton) => `Proporción de los extranjeros de ${canton}`,
    foreignSub: (n) => `${n} residentes extranjeros`,
    shareNational: (who) => `Proporción del total en Suiza (${who})`,
    nationalSub: (n) => `${n} en Suiza`,
    largest: (canton) => `Mayor comunidad: ${canton}`,
    largestSub: (pct) => `${pct}% del total nacional`,
    totalInclNP: "Total incl. no permanentes",
    permSub: (n) => `${n} permanentes`,
    segCount: "Conteo absoluto",
    segPer1000: "Por 1.000 residentes extranjeros",
    segIndex: "Índice vs tasa nacional",
    axis: (who) => `${who} permanentes`,
    refTitle: "Promedio nacional = 100",
    foot: "El per cápita usa como denominador el conteo del SEM de todos los residentes extranjeros por cantón (los totales con nacionales suizos son un concepto de BFS con otra fecha de referencia). El índice expresa la razón comunidad/extranjeros de cada cantón relativa a la razón nacional.",
  },
  availability: {
    eyebrow: "Lo que se puede saber",
    h: "Qué se puede saber, y qué no",
    lead: "Un cuadro lleno significa que alguna fuente publica esas dos cosas juntas. La mayor parte de esta grilla está vacía.",
    crossTab: "Cruzado",
    never: "Nunca publicado",
    neverNote: "Ninguna fuente cosechada cruza estas dos dimensiones para esta población.",
    hint: "Pasa el cursor por un cuadro para ver qué fuente trae ese cruce.",
  },
  method: {
    eyebrow: "Método",
    h: "Cuatro estados, dos fuentes, un desfase honesto",
    lead: "En la mayoría de los cantones estas poblaciones se cuentan en decenas. A ese tamaño, un vacío suele significar “nunca se midió”, no “aquí no hay nadie” — y cada cifra de esta página dice cuál de los dos es.",
    offsetH: "El desfase de fechas de referencia",
    offsetP: "La Ausländerstatistik del SEM es un conteo administrativo del registro central de migración, publicado mensualmente; el más reciente aquí es del 31 de mayo de 2026. BFS STATPOP es el registro anual de población, publicado a fin de año; el último año completo es el 31 de diciembre de 2024. Los separan unos diecisiete meses. Donde ambos miden lo mismo, difieren levemente — ese desfase se registra y nunca se reconcilia. El SEM responde “quién tiene qué permiso ahora mismo”; BFS responde “quién nació dónde, al último fin de año”.",
    synthH: "Sin síntesis",
    synthP1: "Nada aquí se interpola, imputa, suaviza ni estima. Las líneas de las series se trazan rectas entre puntos observados. Los porcentajes siempre llevan su denominador. Cada cifra es rastreable — pasa el cursor por cualquier número para ver su tabla o consulta de origen, la hoja/fila o selección de dimensiones, la fecha de referencia y el momento de descarga — y la cosecha completa es reproducible con ",
    synthP2: ".",
    sourcesH: "Inventario de fuentes",
    colSource: "Fuente",
    colCarries: "Qué contiene",
    colCells: "Celdas",
  },
  appendix: {
    eyebrow: "Método y cobertura",
    title: "Cómo se hicieron estas cifras, y qué no pueden decir",
    sub: "Los cuatro estados, el desfase de fechas entre los dos registros, qué cruces existen y el inventario completo de fuentes.",
  },
  footer: {
    note: "Una exploración honesta de las estadísticas oficiales sobre todas las nacionalidades extranjeras en Suiza, a nivel nacional y cantón por cantón. Construida solo con datos abiertos cosechados; nada se estima.",
    sources: "Fuentes",
    download: (canton) => `Descargar ${canton}`,
    csv: "Todas las celdas, CSV",
    json: "Todas las celdas, JSON",
    bottom: "SEM 31 may 2026 · BFS STATPOP 31 dic 2024 · fechas de referencia preservadas, nunca reconciliadas",
  },
};

// ---------------------------------------------------------------------------
// German (Swiss conventions: ss, apostrophe thousands)
// ---------------------------------------------------------------------------
const de: Dict = {
  nav: { contrast: "Kontrast", portrait: "Porträt", trend: "Verlauf", movement: "Bewegungen", crossfilter: "Explorer", comparison: "Vergleich", method: "Methode" },
  header: { title: "Ausländer:innen in der Schweiz", cells: (n) => `${n} erhobene Zellen`, loading: "lädt…" },
  nats: {
    _ALL: "Alle ausländischen Staatsangehörigen",
    _EU_EFTA: "EU-/EFTA-Staatsangehörige",
    _THIRD: "Drittstaatsangehörige",
    _SL: "Staatenlos",
    _NONAT: "Ohne Nationalität",
    _UNK: "Staat unbekannt",
    _NA_BORDERS: "Nach heutigen Grenzen nicht zuteilbar",
  },
  natOf: (name) => `Staatsangehörige von ${name}`,
  natPicker: { label: "Bevölkerung", pickerLabel: "Staatsangehörigkeit", search: "Land eintippen…", empty: "Kein Treffer — das Register führt kein solches Land." },
  canton: { showing: "Ansicht", back: "← Schweiz", backTitle: "Zurück zur nationalen Ansicht", pickerLabel: "Kanton", rowTitle: (name) => `${name} auf der ganzen Seite anzeigen`, view: "ansehen →" },
  theme: { toDark: "Zum dunklen Thema wechseln", toLight: "Zum hellen Thema wechseln" },
  main: { loadingCanton: "Kantonsdaten werden geladen…", error: (msg) => `Etwas konnte nicht geladen werden: ${msg}. Die angezeigten Zahlen stammen möglicherweise vom zuvor gewählten Kanton — ein Neuladen der Seite behebt das meist.` },
  states: {
    label: { observed: "Beobachtet", structural_zero: "Struktureller Nullwert", suppressed: "Unterdrückt", not_published: "Nicht publiziert" },
    desc: {
      observed: "Eine real publizierte Zahl aus der Quelle.",
      structural_zero: "Die Quelle hat diese Zelle publiziert, und der Wert ist 0 — es ist niemand da, nicht: es wurde nicht gezählt.",
      suppressed: "Existiert, wird aber unterhalb der Publikationsschwelle der Quelle zurückgehalten.",
      not_published: "Die Quelle hat diese Dimensionen nie gekreuzt.",
    },
  },
  dims: {
    canton: "Kanton", year: "Jahr", month: "Monat", sex: "Geschlecht", permit: "Bewilligungsart", legalBasis: "Rechtsgrundlage",
    ageClass: "Altersklasse", marital: "Zivilstand", marriedToSwiss: "Mit Schweizer/in verheiratet",
    lengthOfStay: "Aufenthaltsdauer", reason: "Einwanderungsgrund", nationality: "Staatsangehörigkeit",
    birthCountry: "Geburtsland", nationalityGroup: "Passgruppe", naturalisationType: "Einbürgerungsart",
  },
  values: {
    ordinary: "Ordentliche Einbürgerung", facilitated: "Erleichterte Einbürgerung (meist über Schweizer Ehepartner)", reinstated: "Wiedereinbürgerung", all: "Alle Einbürgerungen",
    total: "Total", female: "Frauen", male: "Männer", permanent: "Ständig", non_permanent: "Nichtständig",
    CL: "Chile", CH: "Schweiz", single: "Ledig", married: "Verheiratet", widowed: "Verwitwet", divorced: "Geschieden",
    registered_partnership: "Eingetragene Partnerschaft", dissolved_partnership: "Aufgelöste Partnerschaft", unknown: "Unbekannt",
    quota_employment: "Kontingentierte Erwerbstätigkeit", nonquota_employment: "Nicht kontingentierte Erwerbstätigkeit", family_reunification: "Familiennachzug",
    education: "Aus- und Weiterbildung", residence_no_employment: "Aufenthalt ohne Erwerbstätigkeit", refugee: "Anerkannter Flüchtling",
    hardship: "Härtefall nach Asyl", asylum_ruling: "Ausländerrechtliche Regelung", other: "Übrige",
    FZA: "FZA (Freizügigkeit)", AIG: "AIG (Drittstaaten)", yes: "Ja", no: "Nein",
  },
  metrics: { stock: "Wohnbevölkerung", immigration: "Einwanderung", emigration: "Auswanderung", naturalisation: "Einbürgerung" },
  findings: {
    h: "Was die offiziellen Zahlen sagen",
    intro: (who, canton) => `Vier Dinge, die man über ${who} in ${canton} wissen sollte — und danach die Daten selbst, frei erkundbar. Wo eine Zahl nie publiziert wurde, sagt diese Seite das, statt eine Lücke zu zeigen.`,
    twoCountsH: "Zwei Zählungen, eine Gemeinschaft",
    twoCountsD: (nat, p, b) => `${p} Personen führen den Pass; ${b} wurden in ${nat} geboren. Wer nur eines zählt, verpasst den Grossteil des anderen.`,
    twoCountsCta: "Zur Aufteilung",
    becameSwissH: "Sind Schweizer geworden",
    becameSwissD: (nat, b, swiss) => `Von den ${b} in ${nat} Geborenen haben heute ${swiss} einen Schweizer Pass.`,
    becameSwissCta: (b) => `Die ${b} kennenlernen`,
    familyH: "Kamen zur Familie",
    familyD: (all, years, family, leads) => `Von ${all} Zuzügen in ${years} Jahren erfolgten ${family} über den Familiennachzug${leads ? " — mehr als Arbeit und Ausbildung zusammen" : ""}.`,
    familyCta: "Warum sie kamen",
    nobody: "Niemand",
    over65H0: "Ist über 65",
    over65H: "Sind über 65",
    over65D0: (p, recent) => `Keine der ${p} Personen ist im Rentenalter${recent ? `, und ${recent} sind in den letzten fünf Jahren angekommen` : ""}. Eine junge, erst kürzlich angekommene Gruppe.`,
    over65D: (p, recent) => `Von ${p} Passinhaberinnen und -inhabern${recent ? `, davon ${recent} in den letzten fünf Jahren angekommen` : ""}.`,
    over65Cta: "Zum Porträt",
  },
  hero: {
    eyebrow: "Zwei Arten zu zählen",
    h: "Die Gemeinschaft ist grösser als die Passzählung",
    lead: (nat, canton, p, b) => `${canton} zählt ${p} Passinhaberinnen und -inhaber — und ${b} Einwohner, die in ${nat} geboren wurden. Viele der dort Geborenen haben inzwischen die Schweizer oder eine andere Staatsbürgerschaft angenommen; wer nur Pässe zählt, verpasst einen grossen Teil der Gemeinschaft.`,
    leadGroup: (who, canton, p, tot) => `${canton} zählt ${p} ständige Einwohner (${who}) — ${tot} inklusive nichtständiger Bewilligungen. Wähle oben ein Land, um dessen Passzählung mit den tatsächlich dort Geborenen zu vergleichen.`,
    kickerPassport: (nat) => `Führen den Pass — ${nat}`,
    kickerBorn: (nat) => `Wurden in ${nat} geboren`,
    footSem: (date) => `SEM · ${date} · ständige Wohnbevölkerung`,
    footBfs: "BFS STATPOP · 31. Dez 2024 · ständige Wohnbevölkerung",
    splitHead: (nat, b) => `Die ${b} in ${nat} geborenen Einwohner, nach dem Pass, den sie tatsächlich haben`,
    splitAria: "Passzusammensetzung der im gewählten Land geborenen Einwohner",
    insight: (swiss, born, pct) => `${swiss} von ${born} — ${pct}% — haben heute einen Schweizer Pass. Einbürgerung und gemischt-nationale Familien lassen Geburtsort und Staatsangehörigkeit stark auseinanderlaufen.`,
    awaiting: "Die Passaufteilung stammt aus BFS-STATPOP-Würfel 399.",
    offsetNote: "Diese beiden Referenzdaten liegen ~17 Monate auseinander. Der Versatz ist real und bleibt im ganzen Explorer erhalten — die beiden Reihen werden nie zu einer Zahl verrechnet.",
  },
  portrait: {
    eyebrow: "Porträt",
    whoAre: (n) => `Wer sind die ${n}?`,
    nobodyPassport: (nat, canton) => `Niemand in ${canton} führt diesen Pass — ${nat}`,
    nobodyBorn: (nat, canton) => `Niemand in ${canton} wurde in ${nat} geboren`,
    leadNationals: (who, canton) => `Alle ${who} in ${canton}, nach jedem Merkmal, das das Register führt. Nach Geschlecht aufteilen für eine Ebene mehr — weiter kommt das SEM nicht, denn es kreuzt diese Merkmale nur mit dem Geschlecht. Das BFS geht weiter: der Explorer unten beantwortet Bewilligung, Geschlecht und Alter zusammen.`,
    leadBorn: (nat, canton, swiss, rest) => `Alle Personen in ${canton}, die in ${nat} geboren wurden — eine grössere und mehrheitlich andere Gruppe. ${swiss} besitzen die Schweizer Staatsbürgerschaft; die übrigen ${rest} führen die unten gezeigten Pässe und erscheinen in keiner Schweizer Zählung.`,
    popPassport: (nat) => `Pass: ${nat}`,
    popBorn: (nat) => `In ${nat} geboren`,
    everyone: "Alle",
    splitBySex: "Nach Geschlecht",
    women: "Frauen",
    men: "Männer",
    refSem: (date) => `SEM · ${date} · ständig`,
    refBfs: (year) => `BFS STATPOP · 31. Dez ${year} · ständig`,
    wallSem: "Nicht nach Geschlecht publiziert — das SEM weist den Zivilstand nur für die Gruppe als Ganzes aus.",
    wallBorn: "Für diese Bevölkerung nicht nach Geschlecht publiziert.",
    marriedToSwiss: (n) => `Von den Verheirateten sind ${n} mit einer Schweizerin oder einem Schweizer verheiratet.`,
    bornMaritalNote: (nat, year, total, head) => `Der Zivilstand der in ${nat} Geborenen stammt aus einem anderen Würfel und einem früheren Jahr (31. Dez ${year}) und zählt darum ${total} statt ${head}. Die Daten werden nicht verrechnet.`,
    ageSumNote: "Summiert aus den 21 Fünfjahresklassen, die das BFS publiziert — exakte Arithmetik, keine Schätzung.",
  },
  trend: {
    eyebrow: "Zeit · 2010–2026",
    h: "Sechzehn Jahre, zwei Register",
    lead: (who, canton, small) => `${who} in ${canton}, gezählt von zwei Registern, die nicht übereinstimmen und hier nicht verrechnet werden.${small ? " Bei dieser Grösse bewegt eine einzige ankommende Familie die Linie." : ""}`,
    total: "Total", bySex: "Nach Geschlecht", byPermit: "Nach Bewilligung", yearly: "Jährlich", monthly: "Monatlich",
    seriesBfs: "BFS STATPOP (Register, 31. Dez)",
    seriesSemDec: "SEM (administrativ, 31. Dez)",
    seriesSemMonthly: "SEM (administrativ, monatlich)",
    peak: (n) => `Höchststand ${n}`,
    low: (n) => `Tiefststand ${n}`,
    permit: (code) => `Bewilligung ${code}`,
    awaitBfs: "Die Jahresreihe stammt aus BFS-STATPOP-Würfel 101. Sie ist in dieser Erhebung noch nicht vorhanden.",
    chartAria: "Zeitreihe. Fokussieren und mit den Pfeiltasten jedes Jahr ablesen.",
  },
  movement: {
    eyebrow: "Bewegungen",
    last12Eyebrow: "letzte 12 Monate",
    whyCame: "Warum sie kamen", whoLeft: "Wer wegzog", becameSwiss: "Wer Schweizer wurde",
    spanYears: (n) => `in ${n} Jahren`,
    spanYear: (y) => `im Jahr ${y}`,
    span12: "in den letzten zwölf Monaten",
    leadArrivals: (grand, span) => `${grand} Personen sind ${span} zugezogen.`,
    leadTop: (label, val) => ` Der häufigste Grund ist ${label} mit ${val}.`,
    leadNoRefugees: " Niemand kam als Flüchtling, als Härtefall oder über eine Asylregelung.",
    leadDepartures: (grand, span) => `${grand} Personen sind ${span} weggezogen — fast so viele wie zugezogen sind, weshalb sich die Bevölkerung so langsam verändert.`,
    leadSwiss: (who, grand, span) => `${grand} der ${who} wurden ${span} Schweizer Bürgerinnen und Bürger. Jede und jeder davon verlässt die Passzählung, bleibt aber in der Geburtsort-Zählung — ein grosser Teil des Unterschieds zwischen beiden.`,
    periodAll: (a, b) => `Ganzer Zeitraum ${a}–${b}`,
    period12: "Letzte 12 Monate",
    periodAria: "Zeitraum",
    segAll: "Alle",
    segPermVsNon: "Ständig vs nichtständig",
    everyone: "Alle",
    splitBySex: "Nach Geschlecht",
    capPermanent: "Ständig", capNonPermanent: "Nichtständig", capWomen: "Frauen", capMen: "Männer",
    wallArrivals: "Zuzüge lassen sich nicht nach Geschlecht oder Alter aufteilen. SEM-Tabelle 3-30 hat elf Spalten — Nation, Total und die neun Gründe oben — ohne jeden Geschlechts- oder Altersblock im Blatt. Wegzüge und Einbürgerungen führen das Geschlecht; die anderen beiden Reiter teilen auf.",
    footArrivals: (perm, nonPerm) => `Ständige Zuzüge ${perm} · nichtständige ${nonPerm}. Nichtständig umfasst Kurzaufenthalte, weshalb die Ausbildung dort dominiert. Ein Strich heisst, die Tabelle führt die Kategorie gar nicht; ein Ring ist eine gezählte Null: die Kategorie existiert, und niemand hat sie genutzt.`,
    footOther: (who) => `${who} Ringe sind gezählte Nullen — die Kategorie existiert in der Tabelle, und über den ganzen Zeitraum erscheint niemand darin.`,
    footWomenMen: (w, m) => `Frauen ${w} · Männer ${m}.`,
    titlePartial: (total) => `${total} gezählt; eine der beiden Tabellen führt diese Kategorie nicht — dies ist eine Untergrenze, kein Total.`,
    titleZero: "Eine gezählte Null — die Kategorie existiert, und niemand hat sie in diesem Zeitraum genutzt.",
    titleTotal: (total) => `${total} Personen in diesem Zeitraum.`,
    srcYear: "Kalenderjahres-Totale",
    srcRolling: "rollende 12-Monats-Publikation",
  },
  xf: {
    eyebrow: "Explorer",
    h: "Stelle deine eigene Frage",
    lead: "Jede Option zeigt ihre Antwort, bevor du sie wählst. Gestrichelte Optionen wurden nie publiziert — keine Quelle kreuzt diese Kombination. Das BFS beantwortet bis zu drei Merkmale zugleich; das SEM eines, plus Geschlecht.",
    try: "Versuch:",
    presetWomenC: "Frauen mit C-Bewilligung",
    presetUnder5: "Weniger als 5 Jahre hier",
    presetBornSwiss: (nat) => `In ${nat} Geborene mit Schweizer Pass`,
    presetRetirement: "Im Rentenalter",
    presetWall: "Verheiratete Neuzugezogene — nie gezählt",
    fieldSourceMetric: "Quelle & Metrik",
    fieldMetric: "Metrik",
    fieldRefMonth: "Referenzmonat",
    fieldRefYear: "Referenzjahr",
    fieldPopType: "Bevölkerungstyp",
    popPermanent: "Ständig",
    popNonPermanent: "Nichtständig",
    popTotalStock: "Total (ständig + nichtständig)",
    popTotal: "Total",
    hint: "Jede Option zeigt, wozu sie auflöst. Eine gepunktete Markierung heisst, die Quellen haben diese Dimensionen nie gekreuzt — trotzdem wählbar, denn genau diese Absenz ist der Befund.",
    wallBanner: "Alle Optionen unten sind gestrichelt, weil die aktuelle Kombination nie publiziert wurde — entferne eine der gewählten Dimensionen, um weiterzukommen.",
    passportOfBorn: (nat) => `Passgruppe · der in ${nat} Geborenen`,
    any: "Alle",
    neverPublished: "nie publiziert",
    notPubWithCarrier: (carrier) => `Die Quellen haben diese Dimensionen für diese Bevölkerung nie gekreuzt — die nächstliegende Tabelle, ${carrier}, kombiniert sie nicht.`,
    notPubBare: "Die Quelle hat diese Dimensionen nie gekreuzt.",
    dropBtn: (dim) => `Nächste publizierte Antwort: «${dim}» entfernen → `,
    share: (pct, total) => `= ${pct}% von ${total} in der ganzen Gruppe`,
    siblingsH: (dim) => `${dim} — die ganze Aufteilung`,
    previewIdle: "Fahre über eine Option, um ihre Antwort zu sehen",
    previewNever: "nie publiziert",
    persons: "Personen",
    zeroSuffix: " · eine echte Null, keine fehlende Zahl",
    clear: (n) => `${n} Filter entfernen`,
    chipNever: (label) => `${label} — für diese Bevölkerung nie publiziert`,
    chipOutcome: (label, val, state) => `${label} → ${val} (${state})`,
  },
  explorer: { exportLabel: "Aktuelle Ansicht mit vollständigen Herkunftsspalten exportieren", csv: "CSV herunterladen", json: "JSON herunterladen" },
  baselines: {
    eyebrow: "Vergleich",
    h: (who) => `Wo ${who} tatsächlich leben`,
    leadTop3: (a, b, c) => `${a}, ${b} und ${c} haben die grössten Gemeinschaften. `,
    leadRest: (date) => `Pro 1'000 ausländische Einwohner gemessen ändert sich die Rangfolge, denn ein grosser Kanton hat von allem mehr. Klicke auf einen Kanton, um ihn auf der ganzen Seite anzuzeigen. Ständige Wohnbevölkerung SEM, ${date}.`,
    cardIn: (who, canton) => `${who} in ${canton}`,
    ofWhomPermanent: "davon ständig",
    shareForeign: (canton) => `Anteil an den Ausländern von ${canton}`,
    foreignSub: (n) => `${n} ausländische Einwohner`,
    shareNational: (who) => `Anteil am Schweizer Total (${who})`,
    nationalSub: (n) => `${n} in der Schweiz`,
    largest: (canton) => `Grösste Gemeinschaft: ${canton}`,
    largestSub: (pct) => `${pct}% des nationalen Totals`,
    totalInclNP: "Total inkl. nichtständige",
    permSub: (n) => `${n} ständig`,
    segCount: "Absolute Zahl",
    segPer1000: "Pro 1'000 ausländische Einwohner",
    segIndex: "Index vs nationale Rate",
    axis: (who) => `ständige ${who}`,
    refTitle: "Nationaler Durchschnitt = 100",
    foot: "Pro Kopf verwendet als Nenner die SEM-Zahl aller ausländischen Einwohner pro Kanton (Gesamtbestände inkl. Schweizer sind ein BFS-Konzept mit anderem Referenzdatum). Der Index setzt das Verhältnis Gemeinschaft/Ausländer jedes Kantons ins Verhältnis zur nationalen Quote.",
  },
  availability: {
    eyebrow: "Was wissbar ist",
    h: "Was sich überhaupt wissen lässt",
    lead: "Ein gefülltes Quadrat heisst, irgendeine Quelle publiziert diese zwei Dinge zusammen. Der grösste Teil dieses Rasters ist leer.",
    crossTab: "Gekreuzt",
    never: "Nie publiziert",
    neverNote: "Keine erhobene Quelle kreuzt diese beiden Dimensionen für diese Bevölkerung.",
    hint: "Fahre über ein Quadrat, um zu sehen, welche Quelle diesen Kreuz führt.",
  },
  method: {
    eyebrow: "Methode",
    h: "Vier Zustände, zwei Quellen, ein ehrlicher Versatz",
    lead: "In den meisten Kantonen zählen diese Bevölkerungen einige Dutzend Personen. Bei dieser Grösse heisst eine Lücke meist «nie gemessen», nicht «hier ist niemand» — und jede Zahl auf dieser Seite sagt, welches von beiden zutrifft.",
    offsetH: "Der Versatz der Referenzdaten",
    offsetP: "Die SEM-Ausländerstatistik ist eine administrative Zählung aus dem zentralen Migrationsregister, monatlich publiziert; die neueste hier ist vom 31. Mai 2026. BFS STATPOP ist das jährliche Bevölkerungsregister zum Jahresende; das letzte vollständige Jahr ist der 31. Dezember 2024. Die beiden liegen rund siebzehn Monate auseinander. Wo beide dasselbe messen, weichen sie leicht voneinander ab — dieser Versatz wird festgehalten und nie weggerechnet. Das SEM beantwortet «wer hat jetzt welche Bewilligung»; das BFS «wer wurde wo geboren, per letztem Silvester».",
    synthH: "Keine Synthese",
    synthP1: "Nichts hier wird interpoliert, imputiert, geglättet oder geschätzt. Zeitreihen werden gerade zwischen beobachteten Punkten gezogen. Prozentwerte tragen immer ihren Nenner. Jede Zahl ist rückverfolgbar — fahre über eine Zahl, um Quelltabelle oder Würfelabfrage, Blatt/Zeile bzw. Dimensionsauswahl, Referenzdatum und Abrufzeitpunkt zu sehen — und die ganze Erhebung ist reproduzierbar mit ",
    synthP2: ".",
    sourcesH: "Quelleninventar",
    colSource: "Quelle",
    colCarries: "Inhalt",
    colCells: "Zellen",
  },
  appendix: {
    eyebrow: "Methode & Abdeckung",
    title: "Wie diese Zahlen entstanden sind — und was sie nicht sagen können",
    sub: "Die vier Zustände, der Referenzdaten-Versatz zwischen den beiden Registern, welche Kreuztabellen existieren und das vollständige Quelleninventar.",
  },
  footer: {
    note: "Eine ehrliche Auswertung der offiziellen Statistik über jede ausländische Staatsangehörigkeit in der Schweiz, national und Kanton für Kanton. Ausschliesslich aus erhobenen offenen Daten gebaut; nichts wird geschätzt.",
    sources: "Quellen",
    download: (canton) => `${canton} herunterladen`,
    csv: "Jede Zelle, CSV",
    json: "Jede Zelle, JSON",
    bottom: "SEM 31. Mai 2026 · BFS STATPOP 31. Dez 2024 · Referenzdaten erhalten, nie verrechnet",
  },
};

// ---------------------------------------------------------------------------
// French (Swiss conventions)
// ---------------------------------------------------------------------------
const fr: Dict = {
  nav: { contrast: "Contraste", portrait: "Portrait", trend: "Évolution", movement: "Mouvements", crossfilter: "Explorateur", comparison: "Comparaison", method: "Méthode" },
  header: { title: "Étrangers en Suisse", cells: (n) => `${n} cellules collectées`, loading: "chargement…" },
  nats: {
    _ALL: "Tous les ressortissants étrangers",
    _EU_EFTA: "Ressortissants UE / AELE",
    _THIRD: "Ressortissants d'États tiers",
    _SL: "Apatrides",
    _NONAT: "Sans nationalité",
    _UNK: "Nationalité inconnue",
    _NA_BORDERS: "Non attribuable aux frontières actuelles",
  },
  natOf: (name) => `les ressortissants — ${name}`,
  natPicker: { label: "Population", pickerLabel: "Nationalité", search: "Tapez un pays…", empty: "Aucun résultat — le registre ne porte pas ce pays." },
  canton: { showing: "Affichage", back: "← Suisse", backTitle: "Retour à la vue nationale", pickerLabel: "Canton", rowTitle: (name) => `Afficher ${name} sur toute la page`, view: "voir →" },
  theme: { toDark: "Passer au thème sombre", toLight: "Passer au thème clair" },
  main: { loadingCanton: "Chargement des données cantonales…", error: (msg) => `Un chargement a échoué : ${msg}. Les chiffres affichés peuvent être ceux du canton précédent — recharger la page règle généralement le problème.` },
  states: {
    label: { observed: "Observé", structural_zero: "Zéro structurel", suppressed: "Supprimé", not_published: "Non publié" },
    desc: {
      observed: "Un chiffre réellement publié par la source.",
      structural_zero: "La source a publié cette cellule et le compte est 0 — il n'y a personne, et non : personne n'a compté.",
      suppressed: "Existe, mais retenu sous le seuil de publication de la source.",
      not_published: "La source n'a jamais croisé ces dimensions.",
    },
  },
  dims: {
    canton: "Canton", year: "Année", month: "Mois", sex: "Sexe", permit: "Type d'autorisation", legalBasis: "Base légale",
    ageClass: "Classe d'âge", marital: "État civil", marriedToSwiss: "Marié·e à un·e Suisse·sse",
    lengthOfStay: "Durée de séjour", reason: "Motif d'immigration", nationality: "Nationalité",
    birthCountry: "Pays de naissance", nationalityGroup: "Groupe de passeport", naturalisationType: "Type de naturalisation",
  },
  values: {
    ordinary: "Naturalisation ordinaire", facilitated: "Facilitée (le plus souvent via un conjoint suisse)", reinstated: "Réintégration", all: "Toutes les naturalisations",
    total: "Total", female: "Femmes", male: "Hommes", permanent: "Permanent", non_permanent: "Non permanent",
    CL: "Chili", CH: "Suisse", single: "Célibataire", married: "Marié·e·s", widowed: "Veuf·ve·s", divorced: "Divorcé·e·s",
    registered_partnership: "Partenariat enregistré", dissolved_partnership: "Partenariat dissous", unknown: "Inconnu",
    quota_employment: "Activité lucrative contingentée", nonquota_employment: "Activité lucrative non contingentée", family_reunification: "Regroupement familial",
    education: "Formation et perfectionnement", residence_no_employment: "Séjour sans activité lucrative", refugee: "Réfugié reconnu",
    hardship: "Cas de rigueur après asile", asylum_ruling: "Réglementation du droit des étrangers", other: "Autres",
    FZA: "ALCP (libre circulation)", AIG: "LEI (États tiers)", yes: "Oui", no: "Non",
  },
  metrics: { stock: "Population résidante", immigration: "Immigration (entrées)", emigration: "Émigration (sorties)", naturalisation: "Naturalisation" },
  findings: {
    h: "Ce que disent les chiffres officiels",
    intro: (who, canton) => `Quatre choses à savoir sur ${who} à ${canton} — puis les données elles-mêmes, à explorer librement. Quand un chiffre n'a jamais été publié, cette page le dit au lieu d'afficher un vide.`,
    twoCountsH: "Deux comptages, une communauté",
    twoCountsD: (nat, p, b) => `${p} personnes détiennent le passeport ; ${b} sont nées dans le pays (${nat}). Ne compter que l'un des deux fait manquer l'essentiel de l'autre.`,
    twoCountsCta: "Voir la répartition",
    becameSwissH: "Sont devenus suisses",
    becameSwissD: (nat, b, swiss) => `Sur les ${b} personnes nées dans le pays (${nat}), ${swiss} ont aujourd'hui un passeport suisse.`,
    becameSwissCta: (b) => `Rencontrer les ${b}`,
    familyH: "Venus rejoindre la famille",
    familyD: (all, years, family, leads) => `Sur ${all} arrivées en ${years} ans, ${family} sont passées par le regroupement familial${leads ? " — plus que travail et études réunis" : ""}.`,
    familyCta: "Pourquoi ils sont venus",
    nobody: "Personne",
    over65H0: "N'a plus de 65 ans",
    over65H: "Ont plus de 65 ans",
    over65D0: (p, recent) => `Aucune des ${p} personnes n'est à l'âge de la retraite${recent ? `, et ${recent} sont arrivées ces cinq dernières années` : ""}. Un groupe jeune, arrivé récemment.`,
    over65D: (p, recent) => `Sur ${p} détenteurs du passeport${recent ? `, dont ${recent} arrivés ces cinq dernières années` : ""}.`,
    over65Cta: "Voir le portrait",
  },
  hero: {
    eyebrow: "Deux façons de compter",
    h: "La communauté est plus grande que le compte des passeports",
    lead: (nat, canton, p, b) => `${canton} compte ${p} détenteurs du passeport — et ${b} résidents nés dans le pays (${nat}). Beaucoup des personnes qui y sont nées ont depuis pris la nationalité suisse ou une autre ; ne compter que les passeports fait manquer une grande partie de la communauté.`,
    leadGroup: (who, canton, p, tot) => `${canton} compte ${p} résidents permanents (${who}) — ${tot} en incluant les autorisations non permanentes. Choisissez un pays ci-dessus pour comparer son compte de passeports aux personnes réellement nées là-bas.`,
    kickerPassport: (nat) => `Détiennent le passeport — ${nat}`,
    kickerBorn: (nat) => `Nés dans le pays — ${nat}`,
    footSem: (date) => `SEM · ${date} · résidents permanents`,
    footBfs: "BFS STATPOP · 31 déc 2024 · résidents permanents",
    splitHead: (nat, b) => `Les ${b} résidents nés dans le pays (${nat}), selon le passeport qu'ils détiennent réellement`,
    splitAria: "Composition par passeport des résidents nés dans le pays sélectionné",
    insight: (swiss, born, pct) => `${swiss} des ${born} — ${pct}% — détiennent aujourd'hui un passeport suisse. La naturalisation et les familles binationales font fortement diverger lieu de naissance et nationalité.`,
    awaiting: "La répartition par passeport provient du cube 399 de BFS STATPOP.",
    offsetNote: "Ces deux dates de référence sont séparées d'environ 17 mois. Le décalage est réel et préservé dans tout l'explorateur — les deux séries ne sont jamais réconciliées en un seul chiffre.",
  },
  portrait: {
    eyebrow: "Portrait",
    whoAre: (n) => `Qui sont les ${n} ?`,
    nobodyPassport: (nat, canton) => `Personne à ${canton} ne détient ce passeport — ${nat}`,
    nobodyBorn: (nat, canton) => `Personne à ${canton} n'est né dans ce pays — ${nat}`,
    leadNationals: (who, canton) => `Toutes les personnes (${who}) à ${canton}, selon chaque attribut du registre. Divisez par sexe pour descendre d'un niveau — le SEM ne va pas plus loin, il ne croise ces attributs qu'avec le sexe. Le BFS va plus loin : l'explorateur ci-dessous répond autorisation, sexe et âge à la fois.`,
    leadBorn: (nat, canton, swiss, rest) => `Toutes les personnes de ${canton} nées dans le pays (${nat}) — un groupe plus grand et largement différent. ${swiss} ont la nationalité suisse ; les ${rest} autres portent les passeports montrés ci-dessous et n'apparaissent dans aucun compte suisse.`,
    popPassport: (nat) => `Passeport : ${nat}`,
    popBorn: (nat) => `Nés dans le pays — ${nat}`,
    everyone: "Tous",
    splitBySex: "Par sexe",
    women: "Femmes",
    men: "Hommes",
    refSem: (date) => `SEM · ${date} · permanents`,
    refBfs: (year) => `BFS STATPOP · 31 déc ${year} · permanents`,
    wallSem: "Non publié par sexe — le SEM ne donne l'état civil que pour le groupe entier.",
    wallBorn: "Non publié par sexe pour cette population.",
    marriedToSwiss: (n) => `Parmi les personnes mariées, ${n} le sont à un·e Suisse·sse.`,
    bornMaritalNote: (nat, year, total, head) => `L'état civil des personnes nées dans le pays (${nat}) provient d'un autre cube et d'une année antérieure (31 déc ${year}) ; il compte donc ${total} et non ${head}. Les dates ne sont pas réconciliées.`,
    ageSumNote: "Somme des 21 classes quinquennales publiées par le BFS — arithmétique exacte, pas une estimation.",
  },
  trend: {
    eyebrow: "Temps · 2010–2026",
    h: "Seize ans, deux registres",
    lead: (who, canton, small) => `${who} à ${canton}, comptés par deux registres qui ne concordent pas et ne sont pas réconciliés ici.${small ? " À cette taille, une seule famille qui arrive déplace la courbe." : ""}`,
    total: "Total", bySex: "Par sexe", byPermit: "Par autorisation", yearly: "Annuel", monthly: "Mensuel",
    seriesBfs: "BFS STATPOP (registre, 31 déc)",
    seriesSemDec: "SEM (administratif, 31 déc)",
    seriesSemMonthly: "SEM (administratif, mensuel)",
    peak: (n) => `pic ${n}`,
    low: (n) => `creux ${n}`,
    permit: (code) => `Autorisation ${code}`,
    awaitBfs: "La série annuelle provient du cube 101 de BFS STATPOP. Elle n'est pas encore présente dans cette collecte.",
    chartAria: "Série temporelle. Mettez le focus et utilisez les flèches pour lire chaque année.",
  },
  movement: {
    eyebrow: "Mouvements",
    last12Eyebrow: "12 derniers mois",
    whyCame: "Pourquoi ils sont venus", whoLeft: "Qui est parti", becameSwiss: "Qui est devenu suisse",
    spanYears: (n) => `en ${n} ans`,
    spanYear: (y) => `en ${y}`,
    span12: "au cours des douze derniers mois",
    leadArrivals: (grand, span) => `${grand} personnes sont arrivées ${span}.`,
    leadTop: (label, val) => ` Le motif le plus fréquent est ${label}, avec ${val}.`,
    leadNoRefugees: " Personne n'est arrivé comme réfugié, pour cas de rigueur ou par décision d'asile.",
    leadDepartures: (grand, span) => `${grand} personnes sont parties ${span} — presque autant que d'arrivées, d'où la lenteur avec laquelle la population change.`,
    leadSwiss: (who, grand, span) => `${grand} personnes (${who}) sont devenues citoyennes suisses ${span}. Chacune quitte le compte par passeport mais reste dans celui par lieu de naissance — une grande partie de l'écart entre les deux.`,
    periodAll: (a, b) => `Période complète ${a}–${b}`,
    period12: "12 derniers mois",
    periodAria: "Période",
    segAll: "Tous",
    segPermVsNon: "Permanent vs non permanent",
    everyone: "Tous",
    splitBySex: "Par sexe",
    capPermanent: "Permanent", capNonPermanent: "Non permanent", capWomen: "Femmes", capMen: "Hommes",
    wallArrivals: "Les arrivées ne peuvent pas être divisées par sexe ou âge. La table SEM 3-30 compte onze colonnes — nation, total et les neuf motifs ci-dessus — sans aucun bloc sexe ou âge dans la feuille. Les départs et les naturalisations portent le sexe ; les deux autres onglets se divisent.",
    footArrivals: (perm, nonPerm) => `Arrivées permanentes ${perm} · non permanentes ${nonPerm}. Le non-permanent couvre les courts séjours, d'où la dominance des études. Un tiret signifie que la table ne porte pas la catégorie ; un anneau est un zéro compté : la catégorie existe et personne ne l'a utilisée.`,
    footOther: (who) => `${who} Les anneaux sont des zéros comptés — la catégorie existe dans la table et personne n'y apparaît sur toute la période.`,
    footWomenMen: (w, m) => `Femmes ${w} · hommes ${m}.`,
    titlePartial: (total) => `${total} comptés ; l'une des deux tables ne porte pas cette catégorie — c'est un plancher, pas un total.`,
    titleZero: "Un zéro compté — la catégorie existe et personne ne l'a utilisée sur cette période.",
    titleTotal: (total) => `${total} personnes sur cette période.`,
    srcYear: "totaux par année civile",
    srcRolling: "publication glissante sur 12 mois",
  },
  xf: {
    eyebrow: "Explorateur",
    h: "Posez votre propre question",
    lead: "Chaque option montre sa réponse avant que vous la choisissiez. Les options en pointillé n'ont jamais été publiées — aucune source ne croise cette combinaison. Le BFS répond jusqu'à trois attributs à la fois ; le SEM un seul, plus le sexe.",
    try: "Essayez :",
    presetWomenC: "Femmes avec autorisation C",
    presetUnder5: "Ici depuis moins de 5 ans",
    presetBornSwiss: (nat) => `Nés dans le pays (${nat}), passeport suisse`,
    presetRetirement: "À l'âge de la retraite",
    presetWall: "Nouveaux arrivants mariés — jamais comptés",
    fieldSourceMetric: "Source & métrique",
    fieldMetric: "Métrique",
    fieldRefMonth: "Mois de référence",
    fieldRefYear: "Année de référence",
    fieldPopType: "Type de population",
    popPermanent: "Permanent",
    popNonPermanent: "Non permanent",
    popTotalStock: "Total (perm + non perm)",
    popTotal: "Total",
    hint: "Chaque option montre ce à quoi elle résout. Une marque pointillée signifie que les sources n'ont jamais croisé ces dimensions — sélectionnable quand même, car cette absence est en soi le résultat.",
    wallBanner: "Toutes les options ci-dessous sont en pointillé parce que la combinaison actuelle n'a jamais été publiée — retirez une des dimensions sélectionnées pour continuer.",
    passportOfBorn: (nat) => `Groupe de passeport · des personnes nées dans le pays (${nat})`,
    any: "Tous",
    neverPublished: "jamais publié",
    notPubWithCarrier: (carrier) => `Les sources n'ont jamais croisé ces dimensions pour cette population — la table la plus proche, ${carrier}, ne les combine pas.`,
    notPubBare: "La source n'a jamais croisé ces dimensions.",
    dropBtn: (dim) => `Réponse publiée la plus proche : retirer « ${dim} » → `,
    share: (pct, total) => `= ${pct}% des ${total} du groupe entier`,
    siblingsH: (dim) => `${dim} — la répartition complète`,
    previewIdle: "Survolez une option pour prévisualiser sa réponse",
    previewNever: "jamais publié",
    persons: "personnes",
    zeroSuffix: " · un vrai zéro, pas une donnée manquante",
    clear: (n) => `Retirer ${n} filtre${n > 1 ? "s" : ""}`,
    chipNever: (label) => `${label} — jamais publié pour cette population`,
    chipOutcome: (label, val, state) => `${label} → ${val} (${state})`,
  },
  explorer: { exportLabel: "Exporter la vue actuelle avec les colonnes de provenance complètes", csv: "Télécharger CSV", json: "Télécharger JSON" },
  baselines: {
    eyebrow: "Comparaison",
    h: (who) => `Où vivent réellement ${who}`,
    leadTop3: (a, b, c) => `${a}, ${b} et ${c} abritent les plus grandes communautés. `,
    leadRest: (date) => `Mesuré pour 1 000 résidents étrangers, le classement change, car un grand canton a plus de tout. Cliquez sur un canton pour l'afficher sur toute la page. Résidents permanents SEM, ${date}.`,
    cardIn: (who, canton) => `${who} — ${canton}`,
    ofWhomPermanent: "dont permanents",
    shareForeign: (canton) => `Part des résidents étrangers de ${canton}`,
    foreignSub: (n) => `${n} résidents étrangers`,
    shareNational: (who) => `Part du total suisse (${who})`,
    nationalSub: (n) => `${n} en Suisse`,
    largest: (canton) => `Plus grande communauté : ${canton}`,
    largestSub: (pct) => `${pct}% du total national`,
    totalInclNP: "Total incl. non permanents",
    permSub: (n) => `${n} permanents`,
    segCount: "Nombre absolu",
    segPer1000: "Pour 1 000 résidents étrangers",
    segIndex: "Indice vs taux national",
    axis: (who) => `permanents · ${who}`,
    refTitle: "Moyenne nationale = 100",
    foot: "Le par-habitant utilise comme dénominateur le compte SEM de tous les résidents étrangers par canton (les totaux incluant les Suisses sont un concept BFS avec une autre date de référence). L'indice exprime le rapport communauté/étrangers de chaque canton relativement au rapport national.",
  },
  availability: {
    eyebrow: "Ce qui est connaissable",
    h: "Ce qu'on peut savoir, et ce qu'on ne peut pas",
    lead: "Un carré plein signifie qu'une source publie ces deux choses ensemble. La plus grande partie de cette grille est vide.",
    crossTab: "Croisé",
    never: "Jamais publié",
    neverNote: "Aucune source collectée ne croise ces deux dimensions pour cette population.",
    hint: "Survolez un carré pour voir quelle source porte ce croisement.",
  },
  method: {
    eyebrow: "Méthode",
    h: "Quatre états, deux sources, un décalage honnête",
    lead: "Dans la plupart des cantons, ces populations se comptent en dizaines. À cette taille, un vide signifie généralement « jamais mesuré », pas « personne ici » — et chaque chiffre de cette page dit lequel des deux s'applique.",
    offsetH: "Le décalage des dates de référence",
    offsetP: "La statistique des étrangers du SEM est un comptage administratif du registre central des migrations, publié mensuellement ; le plus récent ici date du 31 mai 2026. BFS STATPOP est le registre annuel de la population, publié en fin d'année ; la dernière année complète est le 31 décembre 2024. Environ dix-sept mois les séparent. Là où les deux mesurent la même chose, ils divergent légèrement — ce décalage est consigné et jamais réconcilié. Le SEM répond « qui détient quelle autorisation en ce moment » ; le BFS « qui est né où, au dernier réveillon ».",
    synthH: "Aucune synthèse",
    synthP1: "Rien ici n'est interpolé, imputé, lissé ou estimé. Les courbes sont tracées droites entre points observés. Les pourcentages portent toujours leur dénominateur. Chaque chiffre est traçable — survolez un nombre pour voir sa table ou requête source, la feuille/ligne ou la sélection de dimensions, la date de référence et l'horodatage de collecte — et toute la collecte est reproductible via ",
    synthP2: ".",
    sourcesH: "Inventaire des sources",
    colSource: "Source",
    colCarries: "Contenu",
    colCells: "Cellules",
  },
  appendix: {
    eyebrow: "Méthode & couverture",
    title: "Comment ces chiffres ont été produits, et ce qu'ils ne peuvent pas dire",
    sub: "Les quatre états, le décalage de dates entre les deux registres, quels croisements existent et l'inventaire complet des sources.",
  },
  footer: {
    note: "Une exploration honnête des statistiques officielles sur chaque nationalité étrangère en Suisse, au niveau national et canton par canton. Construite uniquement à partir de données ouvertes collectées ; rien n'est estimé.",
    sources: "Sources",
    download: (canton) => `Télécharger ${canton}`,
    csv: "Chaque cellule, CSV",
    json: "Chaque cellule, JSON",
    bottom: "SEM 31 mai 2026 · BFS STATPOP 31 déc 2024 · dates de référence préservées, jamais réconciliées",
  },
};

export const DICTS: Record<Locale, Dict> = { en, es, de, fr };
