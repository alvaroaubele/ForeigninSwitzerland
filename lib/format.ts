import type { CellState, Dimensions, Observation } from "./types";

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("en-CH").format(v);
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
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (m && d) return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
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
