import type { Observation } from "./types";

const COLUMNS: (keyof Observation | string)[] = [
  "source",
  "dataset",
  "metric",
  "populationType",
  "concept",
  "canton",
  "year",
  "month",
  "sex",
  "permit",
  "legalBasis",
  "ageClass",
  "marital",
  "marriedToSwiss",
  "lengthOfStay",
  "reason",
  "nationality",
  "birthCountry",
  "nationalityGroup",
  "value",
  "state",
  "referenceDate",
  "retrievedAt",
  "sourceUrl",
];

function row(o: Observation): (string | number | boolean | null)[] {
  return [
    o.source,
    o.dataset,
    o.metric,
    o.populationType,
    o.concept,
    o.dim.canton ?? "",
    o.dim.year ?? "",
    o.dim.month ?? "",
    o.dim.sex ?? "",
    o.dim.permit ?? "",
    o.dim.legalBasis ?? "",
    o.dim.ageClass ?? "",
    o.dim.marital ?? "",
    o.dim.marriedToSwiss ?? "",
    o.dim.lengthOfStay ?? "",
    o.dim.reason ?? "",
    o.dim.nationality ?? "",
    o.dim.birthCountry ?? "",
    o.dim.nationalityGroup ?? "",
    o.value ?? "",
    o.state,
    o.provenance.referenceDate,
    o.provenance.retrievedAt,
    o.provenance.url,
  ];
}

function csvEscape(v: string | number | boolean | null): string {
  if (v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(obs: Observation[]): string {
  const lines = [COLUMNS.join(",")];
  for (const o of obs) lines.push(row(o).map(csvEscape).join(","));
  return lines.join("\n");
}

export function toJson(obs: Observation[]): string {
  return JSON.stringify({ exportedView: obs }, null, 2);
}

export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
