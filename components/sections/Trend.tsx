"use client";
import { useMemo, useState } from "react";
import { useDataset } from "@/lib/data-context";
import { bfsStockSeries, semDecemberSeries } from "@/lib/selectors";
import { resolveCell } from "@/lib/model";
import { TimeSeries, SeriesLegend, type Series } from "../charts/TimeSeries";
import { StateLegend } from "../StateBits";
import { fmtInt } from "@/lib/format";
import type { CellState } from "@/lib/types";

type Breakdown = "none" | "sex" | "permit";
const PERMITS = [
  { code: "B", label: "Permit B", color: "var(--series-2)" },
  { code: "C", label: "Permit C", color: "#1a7a5e" },
  { code: "L", label: "Permit L", color: "#7a5c00" },
];
const SEXES = [
  { code: "female", label: "Female", color: "var(--accent)" },
  { code: "male", label: "Male", color: "var(--series-2)" },
];

export function Trend() {
  const { dataset, loading } = useDataset();
  const [breakdown, setBreakdown] = useState<Breakdown>("none");

  const series = useMemo<Series[]>(() => {
    if (!dataset) return [];
    if (breakdown === "none") {
      const bfs = bfsStockSeries(dataset);
      const sem = semDecemberSeries(dataset);
      const out: Series[] = [];
      if (bfs.some((d) => d.state === "observed")) {
        out.push({ id: "bfs", label: "BFS STATPOP (register, 31 Dec)", data: bfs, color: "var(--accent)" });
      }
      if (sem.length) {
        out.push({ id: "sem", label: "SEM (administrative, 31 Dec)", data: sem, color: "var(--series-2)", dashed: true });
      }
      return out;
    }
    const cats = breakdown === "sex" ? SEXES : PERMITS;
    return cats.map((cat) => {
      const years = Array.from({ length: 15 }, (_, i) => 2010 + i);
      const data = years.map((year) => {
        const c = resolveCell(dataset, {
          source: "BFS",
          dataset: "px-x-0103010000_101",
          populationType: "permanent",
          dim: {
            canton: "ZG",
            year,
            nationality: "CL",
            ...(breakdown === "sex" ? { sex: cat.code as "male" | "female" } : { permit: cat.code, sex: "total" }),
          },
        });
        return { year, value: c.value, state: c.state as CellState };
      });
      return { id: cat.code, label: cat.label, data, color: cat.color };
    });
  }, [dataset, breakdown]);

  if (loading || !dataset) return <SectionSkeleton title="A 15-year view" />;

  const bfs = bfsStockSeries(dataset);
  const observedBfs = bfs.filter((d) => d.state === "observed");
  const peak = observedBfs.reduce((m, d) => ((d.value ?? 0) > (m.value ?? 0) ? d : m), observedBfs[0] ?? { year: 0, value: 0 });
  const hasData = series.some((s) => s.data.some((d) => d.state === "observed"));

  return (
    <section className="section" id="trend">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Time · 2010–2024</span>
          <h2>A population that never left the low tens</h2>
          <p>
            Chilean nationals in Zug rose to a peak of {peak?.value ? fmtInt(peak.value) : "34"} around 2017, fell to a
            trough of 20 in 2020, and have since settled onto a plateau in the high twenties to low thirties. At these
            counts every point is an individual or two — so the line is drawn straight between observed points, never
            smoothed, and each marker shows its own cell state.
          </p>
        </div>

        <div className="controls-row">
          <div className="seg">
            {(["none", "sex", "permit"] as Breakdown[]).map((b) => (
              <button
                key={b}
                className={`seg-btn ${breakdown === b ? "is-on" : ""}`}
                onClick={() => setBreakdown(b)}
              >
                {b === "none" ? "Total" : b === "sex" ? "By sex" : "By permit"}
              </button>
            ))}
          </div>
          <StateLegend compact />
        </div>

        <div className="panel chart-panel">
          {hasData ? (
            <>
              <TimeSeries
                series={series}
                annotations={
                  breakdown === "none"
                    ? [
                        { year: 2017, text: "peak 34" },
                        { year: 2020, text: "trough 20" },
                      ]
                    : []
                }
              />
              <SeriesLegend series={series} />
            </>
          ) : (
            <div className="await-bfs" style={{ padding: "40px 8px" }}>
              The annual series is carried by BFS STATPOP cube 101. It is not present in this build of the harvest yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SectionSkeleton({ title }: { title: string }) {
  return (
    <section className="section">
      <div className="wrap">
        <div className="section-head">
          <h2>{title}</h2>
        </div>
        <div className="skeleton" style={{ height: 340 }} />
      </div>
    </section>
  );
}
