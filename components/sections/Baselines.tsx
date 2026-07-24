"use client";
import { useMemo, useState } from "react";
import { useDataset } from "@/lib/data-context";
import { cantonBaselines, cantonsWithChile, cantonName, passportHeadline, totalHeadline, latestSemMonth } from "@/lib/selectors";
import { fmtInt, fmtPer1000, fmtDate } from "@/lib/format";
import { resolveCell } from "@/lib/model";
import { ProvenanceTip } from "../Provenance";
import type { CellResult } from "@/lib/model";

type View = "count" | "per1000" | "index";
const TOP = ["VD", "ZH", "GE", "BE", "FR", "ZG"];

export function Baselines() {
  const { dataset, loading } = useDataset();
  const [view, setView] = useState<View>("count");

  const baselines = useMemo(() => {
    if (!dataset) return [];
    const all = cantonsWithChile(dataset);
    const cantons = Array.from(new Set([...TOP, ...all]));
    return cantonBaselines(dataset, cantons).sort((a, b) => (b.chile.value ?? 0) - (a.chile.value ?? 0));
  }, [dataset]);

  if (loading || !dataset) return <Skeleton />;

  const zg = baselines.find((b) => b.canton === "ZG");
  const foreignZg = zg?.foreign.value ?? null;
  const chileZg = zg?.chile.value ?? null;
  const sem = latestSemMonth(dataset);
  const national = resolveCell(dataset, {
    source: "SEM",
    dataset: "2-10",
    metric: "stock",
    populationType: "permanent",
    dim: { canton: "CH", nationality: "CL", sex: "total", year: sem.year, month: sem.month },
  });

  const max =
    view === "count"
      ? Math.max(...baselines.map((b) => b.chile.value ?? 0))
      : view === "per1000"
        ? Math.max(...baselines.map((b) => b.per1000Foreign ?? 0))
        : Math.max(...baselines.map((b) => b.indexVsNational ?? 0));

  const passport = passportHeadline(dataset);
  const total = totalHeadline(dataset);

  return (
    <section className="section" id="baselines">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Comparison</span>
          <h2>A count of 35 means little on its own</h2>
          <p>
            Zug is a small canton, so absolute counts mislead. Against the cantons where Chileans actually cluster — Vaud,
            Zürich, Geneva — Zug barely registers. But normalised per 1,000 foreign residents, or indexed against the
            national rate, the picture shifts. All figures are SEM permanent residents at{" "}
            {fmtDate(`${sem.year}-${String(sem.month).padStart(2, "0")}-28`).replace(/^\d+ /, "")}.
          </p>
        </div>

        <div className="baseline-cards">
          <MiniStat label="Chileans in Zug" value={chileZg} sub="of whom permanent" cell={zg?.chile} />
          <MiniStat label="Share of Zug’s foreign residents" value={null} display={foreignZg && chileZg ? `${((chileZg / foreignZg) * 100).toFixed(2)}%` : "—"} sub={`${fmtInt(foreignZg)} foreign residents`} cell={zg?.foreign} />
          <MiniStat label="Share of all Chileans in Switzerland" value={null} display={national.value && chileZg ? `${((chileZg / national.value) * 100).toFixed(1)}%` : "—"} sub={`${fmtInt(national.value)} in Switzerland`} cell={national} />
          <MiniStat label="Total incl. non-permanent" value={total.value} sub={`${fmtInt(passport.value)} permanent`} cell={total} />
        </div>

        <div className="controls-row">
          <div className="seg">
            {(
              [
                ["count", "Absolute count"],
                ["per1000", "Per 1,000 foreign residents"],
                ["index", "Index vs national rate"],
              ] as [View, string][]
            ).map(([v, l]) => (
              <button key={v} className={`seg-btn ${view === v ? "is-on" : ""}`} onClick={() => setView(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="panel chart-panel">
          <div className="barrows">
            {baselines.map((b) => {
              const val = view === "count" ? b.chile.value : view === "per1000" ? b.per1000Foreign : b.indexVsNational;
              const display =
                view === "count" ? fmtInt(b.chile.value) : view === "per1000" ? fmtPer1000(b.per1000Foreign) : b.indexVsNational !== null ? `${Math.round(b.indexVsNational)}` : "—";
              return (
                <div className={`barrow ${b.canton === "ZG" ? "is-hl" : ""}`} key={b.canton}>
                  <div className="barrow-label">{cantonName(b.canton)}</div>
                  <div className="barrow-track">
                    <div
                      className="barrow-fill"
                      style={{
                        width: `${Math.max(0, ((val ?? 0) / (max || 1)) * 100)}%`,
                        background: b.canton === "ZG" ? "var(--accent)" : "var(--series-2)",
                      }}
                    />
                    {view === "index" && (
                      <div className="barrow-ref" style={{ left: `${(100 / (max || 1)) * 100}%` }} title="National average = 100" />
                    )}
                  </div>
                  <div className="barrow-value mono">
                    <ProvenanceTip observation={b.chile.observation} state={b.chile.state}>
                      {display}
                    </ProvenanceTip>
                  </div>
                </div>
              );
            })}
            <div className="barrow-foot mono">
              {view === "count" ? "permanent Chilean nationals" : view === "per1000" ? "per 1,000 foreign residents · dashed = 0" : "index, national rate = 100"}
            </div>
          </div>
        </div>
        <p className="tiny-note">
          Per-capita uses SEM’s count of all foreign residents per canton as the denominator (register totals including
          Swiss nationals are a BFS concept with a different reference date). The index expresses each canton’s
          Chilean-to-foreign ratio relative to the national ratio.
        </p>
      </div>
    </section>
  );
}

function MiniStat({ label, value, display, sub, cell }: { label: string; value?: number | null; display?: string; sub: string; cell?: CellResult }) {
  const inner = <span>{display ?? fmtInt(value ?? null)}</span>;
  return (
    <div className="mini-stat panel">
      <div className="mini-stat-label">{label}</div>
      <div className="mini-stat-value mono">
        {cell ? (
          <ProvenanceTip observation={cell.observation} state={cell.state}>
            {inner}
          </ProvenanceTip>
        ) : (
          inner
        )}
      </div>
      <div className="mini-stat-sub">{sub}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <section className="section" id="baselines">
      <div className="wrap">
        <div className="skeleton" style={{ height: 380 }} />
      </div>
    </section>
  );
}
