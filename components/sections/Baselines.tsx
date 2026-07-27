"use client";
import { useMemo, useState } from "react";
import { useDataset } from "@/lib/data-context";
import { cantonBaselines, cantonsWithChile, cantonName, passportHeadline, totalHeadline, latestSemMonth } from "@/lib/selectors";
import { fmtInt, fmtPer1000, fmtDate } from "@/lib/format";
import { resolveCell } from "@/lib/model";
import { ProvenanceTip } from "../Provenance";
import type { CellResult } from "@/lib/model";

type View = "count" | "per1000" | "index";

export function Baselines() {
  const { dataset, summary, manifest, canton, setCanton, loading } = useDataset();
  const [view, setView] = useState<View>("count");

  // Ranking every canton needs every canton, which no single canton file holds.
  // The cross-canton figures ship separately for exactly this view.
  const comparisonSet = useMemo(
    () => (summary && manifest ? { observations: summary, manifest } : null),
    [summary, manifest],
  );

  const baselines = useMemo(() => {
    if (!comparisonSet) return [];
    return cantonBaselines(comparisonSet, cantonsWithChile(comparisonSet)).sort(
      (a, b) => (b.chile.value ?? 0) - (a.chile.value ?? 0),
    );
  }, [comparisonSet]);

  if (loading || !dataset) return <Skeleton />;

  // The ranked bars deliberately exclude Switzerland — it would be six times the
  // largest canton and flatten everything else. But the summary cards describe
  // whatever is selected, Switzerland included, so "here" is resolved on its own
  // rather than looked up in the ranking. Cantons with no Chilean residents at
  // all are equally absent from the ranking and equally need a card.
  const here = comparisonSet ? cantonBaselines(comparisonSet, [canton])[0] : undefined;
  const foreignZg = here?.foreign.value ?? null;
  const chileZg = here?.chile.value ?? null;
  const sem = latestSemMonth(dataset);
  // Resolved against the cross-canton summary, not the canton in view: a canton
  // file has no Switzerland row, so this read used to come back "—" everywhere
  // except the national view.
  const national = resolveCell(comparisonSet ?? dataset, {
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
          <h2>Where Chileans actually live</h2>
          <p>
            {baselines.length >= 3 && (
              <>
                {cantonName(baselines[0].canton)}, {cantonName(baselines[1].canton)} and{" "}
                {cantonName(baselines[2].canton)} hold the largest communities.{" "}
              </>
            )}
            Measured per 1,000 foreign residents the ranking changes, because a big canton has more of everyone. Click
            any canton to view it across the whole page. SEM permanent residents,{" "}
            {fmtDate(`${sem.year}-${String(sem.month).padStart(2, "0")}-28`).replace(/^\d+ /, "")}.
          </p>
        </div>

        <div className="baseline-cards">
          <MiniStat label={`Chileans in ${cantonName(canton)}`} value={chileZg} sub="of whom permanent" cell={here?.chile} />
          <MiniStat label={`Share of ${cantonName(canton)}\u2019s foreign residents`} value={null} display={foreignZg !== null && foreignZg > 0 && chileZg !== null ? `${((chileZg / foreignZg) * 100).toFixed(2)}%` : "—"} sub={`${fmtInt(foreignZg)} foreign residents`} cell={here?.foreign} />
          {canton === "CH" ? (
            // "Switzerland's share of Switzerland: 100%" says nothing; on the
            // national view this card names the biggest cantonal community.
            <MiniStat
              label={`Largest community: ${baselines[0] ? cantonName(baselines[0].canton) : "—"}`}
              value={baselines[0]?.chile.value ?? null}
              sub={
                national.value && baselines[0]?.chile.value
                  ? `${((baselines[0].chile.value / national.value) * 100).toFixed(1)}% of the national total`
                  : ""
              }
              cell={baselines[0]?.chile}
            />
          ) : (
            <MiniStat label="Share of all Chileans in Switzerland" value={null} display={national.value !== null && national.value > 0 && chileZg !== null ? `${((chileZg / national.value) * 100).toFixed(1)}%` : "—"} sub={`${fmtInt(national.value)} in Switzerland`} cell={national} />
          )}
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
                // The row is the most natural place to ask "show me that canton",
                // so it is a real control: clicking re-scopes the whole page, the
                // same as picking the canton in the header.
                <div
                  className={`barrow is-clickable ${b.canton === canton ? "is-hl" : ""}`}
                  key={b.canton}
                  role="button"
                  tabIndex={0}
                  title={`Show ${cantonName(b.canton)} across the whole page`}
                  onClick={() => setCanton(b.canton)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setCanton(b.canton);
                    }
                  }}
                >
                  <div className="barrow-label">{cantonName(b.canton)}</div>
                  <span className="barrow-view" aria-hidden>view →</span>
                  <div className="barrow-track">
                    <div
                      className="barrow-fill"
                      style={{
                        width: `${Math.max(0, ((val ?? 0) / (max || 1)) * 100)}%`,
                        background: b.canton === canton ? "var(--accent)" : "var(--series-2)",
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
