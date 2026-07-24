"use client";
import { useCallback, useEffect, useState } from "react";
import { useDataset } from "@/lib/data-context";
import { latestSemMonth } from "@/lib/selectors";
import { matches } from "@/lib/model";
import { toCsv, toJson, download } from "@/lib/export";
import { CrossFilter, type FilterState } from "./sections/CrossFilter";
import type { Dimensions, Observation } from "@/lib/types";

const DIM_KEYS: (keyof Dimensions)[] = [
  "sex", "permit", "legalBasis", "ageClass", "marital", "lengthOfStay", "reason", "naturalisationType",
];

function encodeState(f: FilterState): string {
  const p = new URLSearchParams();
  p.set("src", f.source);
  p.set("m", f.metric);
  p.set("y", String(f.year));
  if (f.month) p.set("mo", String(f.month));
  p.set("pop", f.populationType);
  for (const k of DIM_KEYS) {
    const v = f.dim[k];
    if (v !== undefined) p.set(k, String(v));
  }
  return p.toString();
}

function decodeState(qs: string, fallback: FilterState): FilterState {
  const p = new URLSearchParams(qs);
  if (![...p.keys()].length) return fallback;
  const dim: Partial<Dimensions> = {};
  for (const k of DIM_KEYS) {
    const v = p.get(k);
    if (v) (dim as Record<string, unknown>)[k] = v;
  }
  return {
    source: (p.get("src") as FilterState["source"]) ?? fallback.source,
    metric: (p.get("m") as FilterState["metric"]) ?? fallback.metric,
    year: p.get("y") ? Number(p.get("y")) : fallback.year,
    month: p.get("mo") ? Number(p.get("mo")) : fallback.month,
    populationType: (p.get("pop") as FilterState["populationType"]) ?? fallback.populationType,
    dim,
  };
}

export function Explorer() {
  const { dataset } = useDataset();
  const [filter, setFilter] = useState<FilterState | null>(null);

  // Initialise from URL once the dataset is available.
  useEffect(() => {
    if (!dataset || filter) return;
    const latest = latestSemMonth(dataset);
    const fallback: FilterState = {
      source: "SEM",
      metric: "stock",
      year: latest.year,
      month: latest.month,
      populationType: "permanent",
      dim: {},
    };
    setFilter(decodeState(window.location.search.replace(/^\?/, ""), fallback));
  }, [dataset, filter]);

  // Sync URL when filter changes (shareable views).
  useEffect(() => {
    if (!filter) return;
    const qs = encodeState(filter);
    const url = `${window.location.pathname}?${qs}${window.location.hash || "#cross-filter"}`;
    window.history.replaceState(null, "", url);
  }, [filter]);

  const exportView = useCallback(
    (fmt: "csv" | "json") => {
      if (!dataset || !filter) return;
      const sel = {
        source: filter.source,
        metric: filter.metric,
        populationType: filter.populationType,
        dim: {
          canton: "ZG",
          year: filter.year,
          ...(filter.source === "SEM" ? { month: filter.month, nationality: "CL" } : { nationality: "CL" }),
          ...filter.dim,
        },
      };
      const view: Observation[] = dataset.observations.filter((o) => matches(o, sel));
      const rows = view.length ? view : dataset.observations.filter((o) => matches(o, { ...sel, dim: { ...sel.dim, ...clearBreak(filter.dim) } }));
      const stamp = `${filter.source.toLowerCase()}-${filter.metric}-${filter.year}${filter.month ? "-" + filter.month : ""}`;
      if (fmt === "csv") download(`chileans-zug-${stamp}.csv`, toCsv(rows), "text/csv");
      else download(`chileans-zug-${stamp}.json`, toJson(rows), "application/json");
    },
    [dataset, filter],
  );

  if (!filter) return null;

  return (
    <>
      <CrossFilter filter={filter} setFilter={setFilter} />
      <div className="wrap">
        <div className="export-bar">
          <span className="export-label mono">Export current view with full provenance columns</span>
          <div className="export-btns">
            <button onClick={() => exportView("csv")}>Download CSV</button>
            <button onClick={() => exportView("json")}>Download JSON</button>
          </div>
        </div>
      </div>
    </>
  );
}

function clearBreak(dim: Partial<Dimensions>): Partial<Dimensions> {
  const out: Partial<Dimensions> = {};
  for (const k of DIM_KEYS) if (dim[k] !== undefined) (out as Record<string, unknown>)[k] = undefined;
  return out;
}
