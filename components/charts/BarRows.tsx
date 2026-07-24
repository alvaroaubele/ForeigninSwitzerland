"use client";
import { scaleLinear } from "d3-scale";
import type { CellState } from "@/lib/types";
import { fmtInt, fmtPer1000 } from "@/lib/format";

export interface BarRow {
  label: string;
  value: number | null;
  state: CellState;
  /** optional secondary readout, e.g. per-1,000 or index */
  secondary?: string;
  highlight?: boolean;
}

/**
 * Horizontal bars for comparisons. Magnitude is carried by length only; colour
 * marks the highlighted subject vs comparison baselines (never magnitude).
 */
export function BarRows({
  rows,
  unit = "persons",
  perLabel,
}: {
  rows: BarRow[];
  unit?: string;
  perLabel?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  const x = scaleLinear().domain([0, max]).range([0, 100]);
  return (
    <div className="barrows">
      {rows.map((r) => (
        <div className={`barrow ${r.highlight ? "is-hl" : ""}`} key={r.label}>
          <div className="barrow-label" title={r.label}>
            {r.label}
          </div>
          <div className="barrow-track">
            <div
              className="barrow-fill"
              style={{
                width: `${x(r.value ?? 0)}%`,
                background: r.highlight ? "var(--accent)" : "var(--series-2)",
                opacity: r.state === "observed" ? 1 : 0.35,
              }}
            />
          </div>
          <div className="barrow-value mono">
            {fmtInt(r.value)}
            {r.secondary && <span className="barrow-secondary"> · {r.secondary}</span>}
          </div>
        </div>
      ))}
      <div className="barrow-foot mono">
        {unit}
        {perLabel ? ` · ${perLabel}` : ""}
      </div>
    </div>
  );
}

export { fmtPer1000 };
