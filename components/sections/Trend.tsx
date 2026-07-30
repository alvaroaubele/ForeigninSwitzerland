"use client";
import { useMemo, useState } from "react";
import { useDataset } from "@/lib/data-context";
import { bfsStockSeries, semDecemberSeries, semMonthlySeries } from "@/lib/selectors";
import { useI18n } from "@/lib/i18n";
import { resolveCell } from "@/lib/model";
import { TimeSeries, SeriesLegend, type Series } from "../charts/TimeSeries";
import { StateLegend } from "../StateBits";
import { label } from "@/lib/format";
import type { CellState } from "@/lib/types";

type Breakdown = "none" | "sex" | "permit";
const PERMITS = [
  { code: "B", color: "var(--series-2)" },
  { code: "C", color: "#1a7a5e" },
  { code: "L", color: "#7a5c00" },
];
const SEXES = [
  { code: "female", color: "var(--accent)" },
  { code: "male", color: "var(--series-2)" },
];

export function Trend() {
  const { dataset, nat, canton, loading } = useDataset();
  const { t, cName, natWho } = useI18n();
  const [breakdown, setBreakdown] = useState<Breakdown>("none");
  const [monthly, setMonthly] = useState(false);

  const series = useMemo<Series[]>(() => {
    if (!dataset) return [];
    if (breakdown === "none") {
      const bfs = bfsStockSeries(dataset, nat);
      // BFS is annual by construction (31 December), so only the SEM line gains
      // resolution — which is the point: at monthly resolution the two registers
      // stop looking like one wobbling series.
      const sem = monthly ? semMonthlySeries(dataset, nat) : semDecemberSeries(dataset, nat);
      const out: Series[] = [];
      if (bfs.some((d) => d.state === "observed")) {
        out.push({ id: "bfs", label: t.trend.seriesBfs, data: bfs, color: "var(--accent)" });
      }
      if (sem.length) {
        out.push({
          id: "sem",
          label: monthly ? t.trend.seriesSemMonthly : t.trend.seriesSemDec,
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
            nationality: nat,
            ...(breakdown === "sex" ? { sex: cat.code as "male" | "female" } : { permit: cat.code, sex: "total" }),
          },
        });
        return { year, value: c.value, state: c.state as CellState, refDate: c.observation?.provenance.referenceDate, source: "BFS" };
      });
      return {
        id: cat.code,
        label: breakdown === "sex" ? label(cat.code) : t.trend.permit(cat.code),
        data,
        color: cat.color,
      };
    });
  }, [dataset, nat, breakdown, monthly, t]);

  if (loading || !dataset) return <SectionSkeleton title="A 16-year view" />;

  const hasData = series.some((s) => s.data.some((d) => d.state === "observed"));
  // "One family moves the line" is a claim about magnitude; make it only where
  // the magnitude supports it.
  const maxSeen = Math.max(0, ...series.flatMap((s) => s.data.map((d) => d.value ?? 0)));
  const smallScale = maxSeen > 0 && maxSeen < 120;

  return (
    <section className="section" id="trend">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">{t.trend.eyebrow}</span>
          <h2>{t.trend.h}</h2>
          <p>{t.trend.lead(natWho(nat), cName(canton), smallScale)}</p>
        </div>

        <div className="controls-row">
          <div className="seg">
            {(["none", "sex", "permit"] as Breakdown[]).map((b) => (
              <button
                key={b}
                className={`seg-btn ${breakdown === b ? "is-on" : ""}`}
                onClick={() => setBreakdown(b)}
              >
                {b === "none" ? t.trend.total : b === "sex" ? t.trend.bySex : t.trend.byPermit}
              </button>
            ))}
          </div>
          {/* Only the total view has a monthly source; the sex and permit
              breakdowns come from the BFS cube, which is annual by construction. */}
          {breakdown === "none" && (
            <div className="seg">
              <button className={`seg-btn ${!monthly ? "is-on" : ""}`} onClick={() => setMonthly(false)}>
                {t.trend.yearly}
              </button>
              <button className={`seg-btn ${monthly ? "is-on" : ""}`} onClick={() => setMonthly(true)}>
                {t.trend.monthly}
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
                annotations={breakdown === "none" ? peakAndTrough(series, t.trend.peak, t.trend.low) : []}
              />
              <SeriesLegend series={series} />
            </>
          ) : (
            <div className="await-bfs" style={{ padding: "40px 8px" }}>
              {t.trend.awaitBfs}
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
function peakAndTrough(
  series: Series[],
  peakLabel: (n: string) => string,
  lowLabel: (n: string) => string,
): { year: number; text: string }[] {
  const bfs = series.find((s) => s.id === "bfs");
  const pts = (bfs?.data ?? []).filter((d) => d.state === "observed" && d.value !== null);
  if (pts.length < 5) return [];
  const hi = pts.reduce((m, d) => ((d.value ?? 0) > (m.value ?? 0) ? d : m), pts[0]);
  const lo = pts.reduce((m, d) => ((d.value ?? 0) < (m.value ?? 0) ? d : m), pts[0]);
  if (hi.year === lo.year) return [];
  return [
    { year: hi.year, text: peakLabel(String(hi.value)) },
    { year: lo.year, text: lowLabel(String(lo.value)) },
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
