"use client";
import { useState } from "react";
import { useDataset } from "@/lib/data-context";
import { pairAvailable } from "@/lib/model";
import { DIM_LABELS } from "@/lib/format";
import type { Dimensions } from "@/lib/types";

// The breakdown dimensions the explorer exposes, in a legible order.
const AXES: (keyof Dimensions)[] = [
  "sex",
  "permit",
  "legalBasis",
  "ageClass",
  "marital",
  "lengthOfStay",
  "reason",
  "naturalisationType",
  "nationalityGroup",
  "birthCountry",
];

export function AvailabilityMatrix() {
  const { dataset, loading } = useDataset();
  const [hover, setHover] = useState<{ a: string; b: string; datasets: string; note?: string } | null>(null);
  if (loading || !dataset) return <Skeleton />;

  const avail = dataset.manifest.availability;

  return (
    <section className="section" id="availability">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">What is knowable</span>
          <h2>The dimension-availability map</h2>
          <p>
            Before building a query that cannot be answered, see the shape of what the sources actually cross-tabulate.
            A filled square means at least one source publishes that pair of dimensions for this population; an empty
            square means the pair was never crossed. Most of this grid is empty — that is the finding, not a failure.
          </p>
        </div>

        <div className="matrix-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th className="matrix-corner" />
                {AXES.map((a) => (
                  <th key={a} className="matrix-col-th">
                    <span>{DIM_LABELS[a]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AXES.map((rowDim) => (
                <tr key={rowDim}>
                  <th className="matrix-row-th">{DIM_LABELS[rowDim]}</th>
                  {AXES.map((colDim) => {
                    if (rowDim === colDim) {
                      return <td key={colDim} className="matrix-cell is-diag" />;
                    }
                    const entry = pairAvailable(avail, rowDim, colDim);
                    return (
                      <td
                        key={colDim}
                        className={`matrix-cell ${entry ? "is-yes" : "is-no"}`}
                        onMouseEnter={() =>
                          setHover(
                            entry
                              ? { a: DIM_LABELS[rowDim], b: DIM_LABELS[colDim], datasets: entry.datasets.join(", "), note: entry.note }
                              : { a: DIM_LABELS[rowDim], b: DIM_LABELS[colDim], datasets: "" },
                          )
                        }
                        onMouseLeave={() => setHover(null)}
                      >
                        {entry ? <span className="matrix-dot" /> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="matrix-readout panel">
            {hover ? (
              hover.datasets ? (
                <>
                  <div className="matrix-readout-pair">
                    {hover.a} × {hover.b}
                  </div>
                  <div className="matrix-readout-yes">Cross-tabulated</div>
                  <div className="matrix-readout-src mono">{hover.datasets}</div>
                  {hover.note && <div className="matrix-readout-note">{hover.note}</div>}
                </>
              ) : (
                <>
                  <div className="matrix-readout-pair">
                    {hover.a} × {hover.b}
                  </div>
                  <div className="matrix-readout-no">Never published</div>
                  <div className="matrix-readout-note">
                    No harvested source crosses these two dimensions for Chile × Zug.
                  </div>
                </>
              )
            ) : (
              <div className="matrix-readout-hint">Hover a square to see which source carries that cross-tab.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Skeleton() {
  return (
    <section className="section" id="availability">
      <div className="wrap">
        <div className="skeleton" style={{ height: 360 }} />
      </div>
    </section>
  );
}
