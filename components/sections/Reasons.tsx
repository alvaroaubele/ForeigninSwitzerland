"use client";
import { useMemo, useState } from "react";
import { useDataset } from "@/lib/data-context";
import { resolveCell, type Dataset } from "@/lib/model";
import { distinctValues } from "@/lib/selectors";
import { fmtInt, label, STATE_CLASS } from "@/lib/format";
import type { CellState, Observation } from "@/lib/types";

const PERMANENT = "3-30";
const NON_PERMANENT = "3-31";

interface ReasonRow {
  reason: string;
  label: string;
  perm: number | null;
  nonPerm: number | null;
  state: CellState;
}

/**
 * Why people arrived, summed over the whole published run of annual flows.
 *
 * A single year of arrivals into this population is three or four people, which
 * says nothing. Nine calendar years is 68, and the shape is unambiguous. The
 * figures are calendar-year totals from the December "-J-" releases; the rolling
 * 12-month release is excluded so no period is counted twice.
 */
export function Reasons() {
  const { dataset, loading } = useDataset();
  const [split, setSplit] = useState(false);

  const model = useMemo(() => (dataset ? build(dataset) : null), [dataset]);

  if (loading || !dataset || !model) {
    return (
      <section className="section" id="reasons">
        <div className="wrap">
          <div className="skeleton" style={{ height: 280 }} />
        </div>
      </section>
    );
  }

  const { rows, years, totalPerm, totalNonPerm } = model;
  const grand = totalPerm + totalNonPerm;
  const max = Math.max(1, ...rows.map((r) => (split ? Math.max(r.perm ?? 0, r.nonPerm ?? 0) : (r.perm ?? 0) + (r.nonPerm ?? 0))));
  const family = rows.find((r) => r.reason === "family_reunification");

  return (
    <section className="section" id="reasons">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Arrivals · {years[0]}–{years[years.length - 1]}</span>
          <h2>Why they came</h2>
          <p>
            {fmtInt(grand)} people arrived over {years.length} years — too few for any single year to mean much, so
            these are the totals for the whole run.{" "}
            {family && family.perm !== null && (
              <>
                Family reunification accounts for <strong>{fmtInt(family.perm)}</strong> of the{" "}
                {fmtInt(totalPerm)} permanent arrivals. Nobody at all came as a refugee, on hardship grounds, or
                through an asylum ruling.
              </>
            )}
          </p>
        </div>

        <div className="controls-row">
          <div className="seg">
            <button className={`seg-btn ${!split ? "is-on" : ""}`} onClick={() => setSplit(false)}>
              All arrivals
            </button>
            <button className={`seg-btn ${split ? "is-on" : ""}`} onClick={() => setSplit(true)}>
              Permanent vs non-permanent
            </button>
          </div>
          <span className="portrait-ref mono">SEM {PERMANENT} + {NON_PERMANENT} · calendar-year totals</span>
        </div>

        <div className="reasons">
          {rows.map((r) => {
            const total = (r.perm ?? 0) + (r.nonPerm ?? 0);
            // One side missing means the total is a floor, not a count: table
            // 3-31 does not carry refugee, hardship or asylum-ruling at all, so
            // adding its absence in as a zero would turn "not asked" into
            // "nobody" — the exact substitution this page exists to refuse.
            const partial = r.perm === null || r.nonPerm === null;
            const totalTitle = partial
              ? `${fmtInt(total)} counted; the ${r.perm === null ? "permanent" : "non-permanent"} table does not carry this reason, so it is a floor rather than a total.`
              : total === 0
                ? "A counted zero — the reason exists in both tables and nobody used it in nine years."
                : `${fmtInt(total)} arrivals over nine years.`;
            return (
              <div className="reason-row" key={r.reason}>
                <div className="reason-name">{r.label}</div>
                <div className="reason-track">
                  {split ? (
                    <div className="reason-split">
                      <ReasonBar value={r.perm} max={max} tone="perm" caption="Permanent" />
                      <ReasonBar value={r.nonPerm} max={max} tone="nonperm" caption="Non-permanent" />
                    </div>
                  ) : (
                    <ReasonBar value={total} max={max} tone="perm" />
                  )}
                </div>
                <div className={`reason-total mono ${total === 0 ? "is-zero" : ""}`} title={totalTitle}>
                  {total === 0 ? (
                    <span className={`reason-ring ${STATE_CLASS[r.state]}`}>0</span>
                  ) : (
                    <>
                      {fmtInt(total)}
                      {partial && <span className="reason-partial" aria-hidden>+</span>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="reasons-foot">
          Permanent arrivals {fmtInt(totalPerm)} · non-permanent {fmtInt(totalNonPerm)}. Non-permanent covers
          short-stay permits, which is why study dominates it. A dash means that table does not carry the reason at
          all — refugee, hardship and asylum-ruling arrivals have no non-permanent category — as opposed to a ring,
          which is a counted zero: the reason exists and nobody used it.
        </p>
      </div>
    </section>
  );
}

function ReasonBar({
  value,
  max,
  tone,
  caption,
}: {
  value: number | null;
  max: number;
  tone: "perm" | "nonperm";
  caption?: string;
}) {
  const w = value === null ? 0 : (value / max) * 100;
  return (
    <div className="reason-bar-wrap">
      {caption && <span className="reason-caption">{caption}</span>}
      <div className="reason-bar-track">
        <div className={`reason-bar is-${tone}`} style={{ width: `${w}%` }} />
      </div>
      {caption && <span className="reason-caption-val mono">{value === null ? "—" : fmtInt(value)}</span>}
    </div>
  );
}

function build(ds: Dataset) {
  // Calendar-year releases only. The rolling 12-month figures cover a window
  // that overlaps the last annual one, so including them would double-count.
  const years = [
    ...new Set(
      ds.observations
        .filter(
          (o: Observation) =>
            (o.dataset === PERMANENT || o.dataset === NON_PERMANENT) &&
            o.dim.reason !== undefined &&
            o.provenance.referenceDate.endsWith("-12-31"),
        )
        .map((o) => o.dim.year as number),
    ),
  ].sort((a, b) => a - b);

  const reasons = distinctValues(ds, "reason", (o) => o.dataset === PERMANENT || o.dataset === NON_PERMANENT);

  const sumOver = (dataset: string, reason: string): { value: number | null; state: CellState } => {
    let total = 0;
    let anyObserved = false;
    for (const year of years) {
      const c = resolveCell(ds, {
        source: "SEM",
        dataset,
        populationType: dataset === PERMANENT ? "permanent" : "non_permanent",
        dim: { canton: "ZG", nationality: "CL", year, month: 12, sex: "total", reason },
      });
      if (c.state === "not_published" || c.state === "suppressed") continue;
      total += c.value ?? 0;
      anyObserved = true;
    }
    return { value: anyObserved ? total : null, state: anyObserved ? (total > 0 ? "observed" : "structural_zero") : "not_published" };
  };

  const rows: ReasonRow[] = reasons
    .map((reason) => {
      const p = sumOver(PERMANENT, reason);
      const n = sumOver(NON_PERMANENT, reason);
      const state: CellState =
        p.state === "observed" || n.state === "observed"
          ? "observed"
          : p.state === "structural_zero" || n.state === "structural_zero"
            ? "structural_zero"
            : "not_published";
      return { reason, label: label(reason), perm: p.value, nonPerm: n.value, state };
    })
    .sort((a, b) => (b.perm ?? 0) + (b.nonPerm ?? 0) - ((a.perm ?? 0) + (a.nonPerm ?? 0)));

  return {
    rows,
    years,
    totalPerm: rows.reduce((n, r) => n + (r.perm ?? 0), 0),
    totalNonPerm: rows.reduce((n, r) => n + (r.nonPerm ?? 0), 0),
  };
}
