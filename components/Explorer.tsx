"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDataset } from "@/lib/data-context";
import { latestSemMonth } from "@/lib/selectors";
import { useI18n } from "@/lib/i18n";
import { matches } from "@/lib/model";
import { toCsv, toJson, download } from "@/lib/export";
import { CrossFilter, type FilterState } from "./sections/CrossFilter";
import type { Dimensions, Observation } from "@/lib/types";

const DIM_KEYS: (keyof Dimensions)[] = [
  "sex", "permit", "legalBasis", "ageClass", "marital", "lengthOfStay", "reason", "naturalisationType",
];

function encodeState(f: FilterState, canton: string, locale: string): string {
  const p = new URLSearchParams();
  // Canton and language are owned elsewhere, but every URL this component
  // pushes replaces the whole query string — omitting them here would silently
  // strip them from the address on the next filter change.
  if (canton !== "CH") p.set("kt", canton);
  if (locale !== "en") p.set("lang", locale);
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
  const { dataset, canton } = useDataset();
  const { t, locale } = useI18n();
  const [filter, setFilter] = useState<FilterState | null>(null);
  /**
   * Set while we are applying a filter that came *from* the history stack, so the
   * sync effect below restores instead of pushing. Without it, going back would
   * push the state you just left and the button would never escape.
   */
  const fromHistory = useRef(false);
  const lastQs = useRef<string | null>(null);

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
    fromHistory.current = true;
    setFilter(decodeState(window.location.search.replace(/^\?/, ""), fallback));
  }, [dataset, filter]);

  // Back/forward should walk the queries you built, not leave the page. Each
  // committed filter change is a history entry; popstate replays it.
  useEffect(() => {
    const onPop = () => {
      if (!dataset) return;
      const latest = latestSemMonth(dataset);
      fromHistory.current = true;
      setFilter(
        decodeState(window.location.search.replace(/^\?/, ""), {
          source: "SEM",
          metric: "stock",
          year: latest.year,
          month: latest.month,
          populationType: "permanent",
          dim: {},
        }),
      );
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [dataset]);

  // Sync URL when filter changes (shareable views).
  useEffect(() => {
    if (!filter) return;
    const qs = encodeState(filter, canton, locale);
    if (qs === lastQs.current) return;
    const url = `${window.location.pathname}?${qs}${window.location.hash || "#cross-filter"}`;
    // First paint and history-driven changes replace; a user's own change pushes.
    if (fromHistory.current || lastQs.current === null) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    lastQs.current = qs;
    fromHistory.current = false;
  }, [filter, canton, locale]);

  const exportView = useCallback(
    (fmt: "csv" | "json") => {
      if (!dataset || !filter) return;
      const scope = canton.toLowerCase();
      const sel = {
        source: filter.source,
        metric: filter.metric,
        populationType: filter.populationType,
        dim: {
          year: filter.year,
          ...(filter.source === "SEM" ? { month: filter.month, nationality: "CL" } : { nationality: "CL" }),
          ...filter.dim,
        },
      };
      // Export exactly the current view. If the selected cross-tab was never
      // published, the view is empty and we export just the header row / an empty
      // set — we never silently substitute a different aggregate.
      const rows: Observation[] = dataset.observations.filter((o) => matches(o, sel));
      const stamp = `${filter.source.toLowerCase()}-${filter.metric}-${filter.year}${filter.month ? "-" + filter.month : ""}`;
      if (fmt === "csv") download(`chileans-${scope}-${stamp}.csv`, toCsv(rows), "text/csv");
      else download(`chileans-${scope}-${stamp}.json`, toJson(rows), "application/json");
    },
    [dataset, filter, canton],
  );

  if (!filter) return null;

  return (
    <>
      <CrossFilter filter={filter} setFilter={setFilter} />
      <div className="wrap">
        <div className="export-bar">
          <span className="export-label mono">{t.explorer.exportLabel}</span>
          <div className="export-btns">
            <button onClick={() => exportView("csv")}>{t.explorer.csv}</button>
            <button onClick={() => exportView("json")}>{t.explorer.json}</button>
          </div>
        </div>
      </div>
    </>
  );
}
