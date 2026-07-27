import type { CellState, Dimensions, Observation } from "./types";

// The active number/date locale. English default matches the prerendered HTML;
// lib/i18n.tsx swaps it (and the label maps below, in place) before the
// re-render that follows a language change, so every call site keeps reading
// plain objects and functions with zero API change.
let NUM_LOCALE = "en-US";

export function setFormatLocale(
  numberLocale: string,
  dims: Record<keyof Dimensions, string>,
  values: Record<string, string>,
  metrics: Record<Observation["metric"], string>,
): void {
  NUM_LOCALE = numberLocale;
  Object.assign(DIM_LABELS, dims);
  for (const k of Object.keys(VALUE_LABELS)) delete VALUE_LABELS[k];
  Object.assign(VALUE_LABELS, values);
  Object.assign(METRIC_LABELS, metrics);
}

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat(NUM_LOCALE).format(v);
}

/** "May 2026" / "mayo 2026" / "Mai 2026" / "mai 2026". */
export function fmtMonthYear(year: number, month: number): string {
  return new Intl.DateTimeFormat(NUM_LOCALE, { month: "short", year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, 15)),
  );
}

export function fmtSigned(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return (v > 0 ? "+" : "") + fmtInt(v);
}

export function fmtPer1000(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(2);
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (m && d) {
    return new Intl.DateTimeFormat(NUM_LOCALE, { day: "numeric", month: "short", year: "numeric" }).format(
      new Date(Date.UTC(y, m - 1, d)),
    );
  }
  return iso;
}

export const DIM_LABELS: Record<keyof Dimensions, string> = {
  canton: "Canton",
  year: "Year",
  month: "Month",
  sex: "Sex",
  permit: "Permit type",
  legalBasis: "Legal basis",
  ageClass: "Age class",
  marital: "Marital status",
  marriedToSwiss: "Married to a Swiss national",
  lengthOfStay: "Length of stay",
  reason: "Reason for immigration",
  nationality: "Citizenship",
  birthCountry: "Birth country",
  nationalityGroup: "Passport group",
  naturalisationType: "Naturalisation type",
};

export const VALUE_LABELS: Record<string, string> = {
  // Naturalisation routes, as SEM names them in table 3-60.
  ordinary: "Ordinary naturalisation",
  facilitated: "Facilitated (usually via a Swiss spouse)",
  reinstated: "Reinstated citizenship",
  all: "All naturalisations",

  total: "Total",
  female: "Female",
  male: "Male",
  permanent: "Permanent",
  non_permanent: "Non-permanent",
  CL: "Chile",
  CH: "Switzerland",
  single: "Single",
  married: "Married",
  widowed: "Widowed",
  divorced: "Divorced",
  registered_partnership: "Registered partnership",
  dissolved_partnership: "Dissolved partnership",
  unknown: "Unknown",
  quota_employment: "Quota employment",
  nonquota_employment: "Non-quota employment",
  family_reunification: "Family reunification",
  education: "Education & training",
  residence_no_employment: "Residence without employment",
  refugee: "Recognised refugee",
  hardship: "Hardship after asylum",
  asylum_ruling: "Immigration-law ruling",
  other: "Other",
  FZA: "FZA (free movement)",
  AIG: "AIG (third-country)",
};

export function label(value: string | number | boolean | undefined): string {
  if (value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const s = String(value);
  return VALUE_LABELS[s] ?? s;
}

export const METRIC_LABELS: Record<Observation["metric"], string> = {
  stock: "Resident stock",
  immigration: "Immigration (inflow)",
  emigration: "Emigration (outflow)",
  naturalisation: "Naturalisation",
};

export const STATE_CLASS: Record<CellState, string> = {
  observed: "sw-observed",
  structural_zero: "sw-zero",
  suppressed: "sw-suppressed",
  not_published: "sw-missing",
};

export const STATE_COLOR_VAR: Record<CellState, string> = {
  observed: "var(--state-observed)",
  structural_zero: "var(--state-zero)",
  suppressed: "var(--state-suppressed)",
  not_published: "var(--state-missing)",
};

export function sourceRefDate(o: Observation): string {
  return o.provenance.referenceDate;
}
