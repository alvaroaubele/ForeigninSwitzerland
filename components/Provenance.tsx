"use client";
import { useState } from "react";
import type { CellState, Observation } from "@/lib/types";
import { CELL_STATE_DESCRIPTION, CELL_STATE_LABEL } from "@/lib/model";
import { fmtDate } from "@/lib/format";
import { StateSwatch } from "./StateBits";

/**
 * Wraps any value and reveals its full provenance on hover/focus/click: the
 * source, the exact sheet/row or cube query, the reference date, and the
 * retrieval timestamp. Every displayed figure is traceable this way.
 */
export function ProvenanceTip({
  observation,
  state,
  wouldBeCarriedBy,
  children,
}: {
  observation: Observation | null;
  state: CellState;
  wouldBeCarriedBy?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="prov-anchor"
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen((v) => !v)}
    >
      {children}
      {open && (
        <span className="prov-card panel" role="tooltip">
          <span className="prov-row">
            <StateSwatch state={state} />
            <strong>{CELL_STATE_LABEL[state]}</strong>
          </span>
          <span className="prov-desc">{CELL_STATE_DESCRIPTION[state]}</span>
          {observation ? (
            <>
              <span className="prov-kv">
                <span>Source</span>
                <span>
                  {observation.source} · {observation.dataset}
                </span>
              </span>
              <span className="prov-kv">
                <span>Concept</span>
                <span>{observation.concept}</span>
              </span>
              <span className="prov-kv">
                <span>Reference date</span>
                <span>{fmtDate(observation.provenance.referenceDate)}</span>
              </span>
              {observation.provenance.sheet && (
                <span className="prov-kv">
                  <span>Coordinates</span>
                  <span>
                    sheet {observation.provenance.sheet}, row “{observation.provenance.rowLabel}”
                  </span>
                </span>
              )}
              {observation.provenance.query != null && (
                <span className="prov-kv">
                  <span>Query</span>
                  <span className="mono prov-query">{summariseQuery(observation.provenance.query)}</span>
                </span>
              )}
              <span className="prov-kv">
                <span>Retrieved</span>
                <span>{fmtDate(observation.provenance.retrievedAt.slice(0, 10))}</span>
              </span>
              <a className="prov-link" href={observation.provenance.url} target="_blank" rel="noreferrer">
                Open source ↗
              </a>
            </>
          ) : (
            <span className="prov-desc">
              {wouldBeCarriedBy
                ? `This cross-tab would be carried by ${wouldBeCarriedBy}, but that combination was never published for this population.`
                : "No source in the harvest cross-tabulates these dimensions."}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function summariseQuery(q: unknown): string {
  try {
    const arr = q as { code: string; selection: { values: string[] } }[];
    return arr
      .filter((d) => d.selection.values.length <= 3)
      .map((d) => `${d.code}=${d.selection.values.join(",")}`)
      .join("  ");
  } catch {
    return "";
  }
}
