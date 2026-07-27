"use client";
import { useMemo, useState } from "react";
import { useDataset } from "@/lib/data-context";
import { bfsStockSeries, semDecemberSeries, semMonthlySeries, cantonName } from "@/lib/selectors";
import { resolveCell } from "@/lib/model";
import { TimeSeries, SeriesLegend, type Series } from "../charts/TimeSeries";
import { StateLegend } from "../StateBits";
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
  const { dataset, canton, loading } = useDataset();
  const [breakdown, setBreakdown] = useState<Breakdown>("none");
  const [monthly, setMonthly] = useState(false);

  const series = useMemo<Series[]>(() => {
    if (!dataset) return [];
    if (breakdown === "none") {
      const bfs = bfsStockSeries(dataset);
      // BFS is annual by construction (31 December), so only the SEM line gains
      // resolution — which is the point: at monthly resolution the two registers
      // stop looking like one wobbling series.
      const sem = monthly ? semMonthlySeries(dataset) : semDecemberSeries(dataset);
      const out: Series[] = [];
      if (bfs.some((d) => d.state === "observed")) {
        out.push({ id: "bfs", label: "BFS STATPOP (register, 31 Dec)", data: bfs, color: "var(--accent)" });
      }
      if (sem.length) {
        out.push({
          id: "sem",
          label: monthly ? "SEM (administrative, monthly)" : "SEM (administrative, 31 Dec)",
          data: sem,
          color: "var(--series-2)",
          dashed: true,
        });
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
            year,
            nationality: "CL",
            ...(breakdown === "sex" ? { sex: cat.code as "male" | "female" } : { permit: cat.code, sex: "total" }),
          },
        });
        return { year, value: c.value, state: c.state as CellState, refDate: c.observation?.provenance.referenceDate, source: "BFS" };
      });
      return { id: cat.code, label: cat.label, data, color: cat.color };
    });
  }, [dataset, breakdown, monthly]);

  if (loading || !dataset) return <SectionSkeleton title="A 16-year view" />;

  const hasData = series.some((s) => s.data.some((d) => d.state === "observed"));

  return (
    <section className="section" id="trend">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Time · 2010–2026</span>
          <h2>A population that never left the low tens</h2>
          <p>
            Chilean nationals in {cantonName(canton)}, as counted by two registers that do not agree and are not
            reconciled here. At these sizes a single family arriving moves the line.
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
          {/* Only the total view has a monthly source; the sex and permit
              breakdowns come from the BFS cube, which is annual by construction. */}
          {breakdown === "none" && (
            <div className="seg">
              <button className={`seg-btn ${!monthly ? "is-on" : ""}`} onClick={() => setMonthly(false)}>
                Yearly
              </button>
              <button className={`seg-btn ${monthly ? "is-on" : ""}`} onClick={() => setMonthly(true)}>
                Monthly
              </button>
            </div>
          )}
          <StateLegend compact />
        </div>

        <div className="panel chart-panel">
          {hasData ? (
            <>
              <TimeSeries
                series={series}
                annotations={breakdown === "none" ? peakAndTrough(series) : []}
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

/**
 * High and low points of the BFS series, found rather than asserted.
 *
 * These were hardcoded to Zug's peak of 34 in 2017 and trough of 20 in 2020,
 * which is wrong for every other canton and for Switzerland. Only marked when
 * the series is long enough for a peak to mean anything, and only from the
 * register series, which is annual and complete.
 */
function peakAndTrough(series: Series[]): { year: number; text: string }[] {
  const bfs = series.find((s) => s.id === "bfs");
  const pts = (bfs?.data ?? []).filter((d) => d.state === "observed" && d.value !== null);
  if (pts.length < 5) return [];
  const hi = pts.reduce((m, d) => ((d.value ?? 0) > (m.value ?? 0) ? d : m), pts[0]);
  const lo = pts.reduce((m, d) => ((d.value ?? 0) < (m.value ?? 0) ? d : m), pts[0]);
  if (hi.year === lo.year) return [];
  return [
    { year: hi.year, text: `peak ${hi.value}` },
    { year: lo.year, text: `low ${lo.value}` },
  ];
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
