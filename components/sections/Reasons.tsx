"use client";
import { useMemo, useState } from "react";
import { useDataset } from "@/lib/data-context";
import { resolveCell, type Dataset } from "@/lib/model";
import { distinctValues } from "@/lib/selectors";
import { fmtInt, label, STATE_CLASS } from "@/lib/format";
import type { CellState, Dimensions, Observation } from "@/lib/types";

type View = "arrivals" | "departures" | "naturalisations";

const VIEWS: { id: View; tab: string; heading: string }[] = [
  { id: "arrivals", tab: "Why they came", heading: "Why they came" },
  { id: "departures", tab: "Who left", heading: "Who left" },
  { id: "naturalisations", tab: "Who became Swiss", heading: "Who became Swiss" },
];

interface Row {
  key: string;
  label: string;
  /** Column A: permanent arrivals, or the "everyone" figure for other views. */
  a: number | null;
  /** Column B: non-permanent arrivals, or the male figure when split by sex. */
  b: number | null;
  state: CellState;
}

/**
 * Movement into, out of, and across the register — summed over the whole
 * published run of annual flows.
 *
 * Any single year here is three or four people, which says nothing; nine
 * calendar years is enough to have a shape. Figures come from the December
 * "-J-" releases, so the rolling 12-month file is excluded and no period is
 * counted twice.
 *
 * Only arrivals resist a sex split, and that is a property of the source rather
 * than of this harvest: table 3-30 is eleven columns wide — nation, total, and
 * nine reasons — with no sex block and no age block anywhere in the sheet.
 * Departures and naturalisations do carry sex, and split here.
 */
export function Reasons() {
  const { dataset, loading } = useDataset();
  const [view, setView] = useState<View>("arrivals");
  const [bySex, setBySex] = useState(false);
  /** null = the full published run; a year narrows every figure to that calendar year. */
  const [period, setPeriod] = useState<number | null>(null);

  const allYears = useMemo(
    () =>
      dataset
        ? [
            ...new Set(
              dataset.observations
                .filter((o) => o.metric !== "stock" && o.provenance.referenceDate.endsWith("-12-31"))
                .map((o) => o.dim.year as number),
            ),
          ].sort((a, b) => a - b)
        : [],
    [dataset],
  );

  const model = useMemo(
    () => (dataset ? build(dataset, view, view !== "arrivals" && bySex, period) : null),
    [dataset, view, bySex, period],
  );

  if (loading || !dataset || !model) {
    return (
      <section className="section" id="reasons">
        <div className="wrap">
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      </section>
    );
  }

  const { rows, years, totalA, totalB } = model;
  const splitOn = view !== "arrivals" && bySex;
  const max = Math.max(1, ...rows.map((r) => (splitOn ? Math.max(r.a ?? 0, r.b ?? 0) : (r.a ?? 0) + (r.b ?? 0))));
  const meta = VIEWS.find((v) => v.id === view)!;

  return (
    <section className="section" id="reasons">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">
            Movement · {years.length === 1 ? years[0] : `${years[0]}–${years[years.length - 1]}`}
          </span>
          <h2>{meta.heading}</h2>
          <p>{lead(view, rows, totalA, totalB, years)}</p>
        </div>

        <div className="controls-row">
          <div className="seg">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                className={`seg-btn ${view === v.id ? "is-on" : ""}`}
                onClick={() => setView(v.id)}
              >
                {v.tab}
              </button>
            ))}
          </div>
          {view === "arrivals" ? (
            <div className="seg" role="group" aria-label="Split (unavailable for arrivals)">
              <button className={`seg-btn ${!bySex ? "is-on" : ""}`} onClick={() => setBySex(false)}>
                All
              </button>
              <button className={`seg-btn ${bySex ? "is-on" : ""}`} onClick={() => setBySex(true)}>
                Permanent vs non-permanent
              </button>
            </div>
          ) : (
            <div className="seg">
              <button className={`seg-btn ${!bySex ? "is-on" : ""}`} onClick={() => setBySex(false)}>
                Everyone
              </button>
              <button className={`seg-btn ${bySex ? "is-on" : ""}`} onClick={() => setBySex(true)}>
                Split by sex
              </button>
            </div>
          )}
          <label className="xf-field reasons-period">
            <span className="xf-field-label">Period</span>
            <select
              value={period ?? "all"}
              onChange={(e) => setPeriod(e.target.value === "all" ? null : Number(e.target.value))}
            >
              <option value="all">
                Full period {allYears[0]}–{allYears[allYears.length - 1]}
              </option>
              {[...allYears].reverse().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <span className="portrait-ref mono">{sourceNote(view)}</span>
        </div>

        <div className="reasons">
          {rows.map((r) => {
            const total = splitOn ? (r.a ?? 0) + (r.b ?? 0) : (r.a ?? 0) + (r.b ?? 0);
            // A missing side makes the total a floor rather than a count: table
            // 3-31 carries no refugee, hardship or asylum-ruling category at all,
            // and adding that absence in as a zero would turn "not asked" into
            // "nobody" — the substitution this whole page refuses.
            const partial = r.a === null || r.b === null;
            return (
              <div className="reason-row" key={r.key}>
                <div className="reason-name">{r.label}</div>
                <div className="reason-track">
                  {view === "arrivals" && bySex ? (
                    <div className="reason-split">
                      <ReasonBar value={r.a} max={max} tone="perm" caption="Permanent" />
                      <ReasonBar value={r.b} max={max} tone="nonperm" caption="Non-permanent" />
                    </div>
                  ) : splitOn ? (
                    <div className="reason-split">
                      <ReasonBar value={r.a} max={max} tone="perm" caption="Women" />
                      <ReasonBar value={r.b} max={max} tone="nonperm" caption="Men" />
                    </div>
                  ) : (
                    <ReasonBar value={total} max={max} tone="perm" />
                  )}
                </div>
                <div className={`reason-total mono ${total === 0 ? "is-zero" : ""}`} title={totalTitle(total, partial)}>
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

        {view === "arrivals" && (
          <p className="reasons-wall">
            <strong>Arrivals cannot be split by sex or age.</strong> SEM table 3-30 is eleven columns wide — nation,
            total, and the nine reasons above — with no sex or age block anywhere in the sheet. Departures and
            naturalisations do carry sex; the other two tabs split.
          </p>
        )}

        <p className="reasons-foot">{foot(view, totalA, totalB, splitOn)}</p>
      </div>
    </section>
  );
}

function totalTitle(total: number, partial: boolean): string {
  if (partial) return `${fmtInt(total)} counted; one of the two tables does not carry this category, so this is a floor.`;
  if (total === 0) return "A counted zero — the category exists and nobody used it in this period.";
  return `${fmtInt(total)} people in this period.`;
}

function lead(view: View, rows: Row[], totalA: number, totalB: number, years: number[]) {
  const grand = totalA + totalB;
  const span = years.length === 1 ? `in ${years[0]}` : `over ${years.length} years`;
  if (view === "arrivals") {
    const family = rows.find((r) => r.key === "family_reunification");
    const refugeeZero = rows
      .filter((r) => ["refugee", "hardship", "asylum_ruling"].includes(r.key))
      .every((r) => (r.a ?? 0) + (r.b ?? 0) === 0);
    return (
      <>
        {fmtInt(grand)} people arrived {span}.{" "}
        {family && (
          <>
            Family reunification is the largest single reason at{" "}
            <strong>{fmtInt((family.a ?? 0) + (family.b ?? 0))}</strong>.
            {refugeeZero && " Nobody arrived as a refugee, on hardship grounds, or through an asylum ruling."}
          </>
        )}
      </>
    );
  }
  if (view === "departures") {
    return (
      <>
        {fmtInt(grand)} people left {span} — close to the number who arrived, which is why the population changes so
        slowly.
      </>
    );
  }
  return (
    <>
      {fmtInt(grand)} Chilean nationals became Swiss citizens {span}. Every one of them leaves the Chilean-passport
      count and joins the Chilean-born count — a large part of why the two differ so much.
    </>
  );
}

function foot(view: View, totalA: number, totalB: number, splitOn: boolean) {
  if (view === "arrivals") {
    return (
      <>
        Permanent arrivals {fmtInt(totalA)} · non-permanent {fmtInt(totalB)}. Non-permanent covers short-stay permits,
        which is why study dominates it. A dash means that table does not carry the category at all, as opposed to a
        ring, which is a counted zero: the category exists and nobody used it.
      </>
    );
  }
  const who = splitOn ? `Women ${fmtInt(totalA)} · men ${fmtInt(totalB)}.` : "";
  return (
    <>
      {who} Rings are counted zeros — the category exists in the table and nobody appears in it across the whole
      period.
    </>
  );
}

function sourceNote(view: View): string {
  if (view === "arrivals") return "SEM 3-30 + 3-31 · calendar-year totals";
  if (view === "departures") return "SEM 3-55 · calendar-year totals";
  return "SEM 3-60 · calendar-year totals";
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

// ---------------------------------------------------------------------------

function build(ds: Dataset, view: View, bySex: boolean, period: number | null) {
  const datasets = view === "arrivals" ? ["3-30", "3-31"] : view === "departures" ? ["3-55"] : ["3-60"];

  const years = [
    ...new Set(
      ds.observations
        .filter(
          (o: Observation) =>
            datasets.includes(o.dataset) && o.provenance.referenceDate.endsWith("-12-31"),
        )
        .map((o) => o.dim.year as number),
    ),
  ]
    .sort((a, b) => a - b)
    // A chosen year narrows the sums to that calendar year; the caller keeps
    // the full list for its picker, so this filter stays local.
    .filter((y) => period === null || y === period);

  /** Sum a cell across every calendar year, keeping unpublished distinct from zero. */
  const sumYears = (
    dataset: string,
    populationType: Observation["populationType"],
    dim: Partial<Dimensions>,
    sex: Dimensions["sex"],
  ): { value: number | null; state: CellState } => {
    let total = 0;
    let seen = false;
    for (const year of years) {
      const c = resolveCell(ds, {
        source: "SEM",
        dataset,
        populationType,
        dim: { nationality: "CL", year, month: 12, sex, ...dim },
      });
      if (c.state === "not_published" || c.state === "suppressed") continue;
      total += c.value ?? 0;
      seen = true;
    }
    return {
      value: seen ? total : null,
      state: seen ? (total > 0 ? "observed" : "structural_zero") : "not_published",
    };
  };

  const combine = (x: CellState, y: CellState): CellState =>
    x === "observed" || y === "observed"
      ? "observed"
      : x === "structural_zero" || y === "structural_zero"
        ? "structural_zero"
        : "not_published";

  let rows: Row[];

  if (view === "arrivals") {
    const reasons = distinctValues(ds, "reason", (o) => o.dataset === "3-30" || o.dataset === "3-31");
    rows = reasons.map((reason) => {
      const p = sumYears("3-30", "permanent", { reason }, "total");
      const n = sumYears("3-31", "non_permanent", { reason }, "total");
      return { key: reason, label: label(reason), a: p.value, b: n.value, state: combine(p.state, n.state) };
    });
  } else if (view === "departures") {
    const cats: { key: string; label: string; pop: Observation["populationType"]; dim: Partial<Dimensions> }[] = [
      { key: "B", label: "Permit B (residence)", pop: "permanent", dim: { permit: "B" } },
      { key: "C", label: "Permit C (settled)", pop: "permanent", dim: { permit: "C" } },
      { key: "L", label: "Permit L (short-term)", pop: "permanent", dim: { permit: "L" } },
      { key: "nonperm", label: "Non-permanent", pop: "non_permanent", dim: {} },
    ];
    rows = cats.map((c) => {
      const a = sumYears("3-55", c.pop, c.dim, bySex ? "female" : "total");
      const b = bySex ? sumYears("3-55", c.pop, c.dim, "male") : { value: 0, state: "observed" as CellState };
      return { key: c.key, label: c.label, a: a.value, b: bySex ? b.value : 0, state: combine(a.state, b.state) };
    });
  } else {
    const types = distinctValues(ds, "naturalisationType", (o) => o.dataset === "3-60").filter((t) => t !== "all");
    rows = types.map((t) => {
      const a = sumYears("3-60", "total", { naturalisationType: t }, bySex ? "female" : "total");
      const b = bySex ? sumYears("3-60", "total", { naturalisationType: t }, "male") : { value: 0, state: "observed" as CellState };
      return { key: t, label: label(t), a: a.value, b: bySex ? b.value : 0, state: combine(a.state, b.state) };
    });
  }

  rows.sort((x, y) => (y.a ?? 0) + (y.b ?? 0) - ((x.a ?? 0) + (x.b ?? 0)));

  return {
    rows,
    years,
    totalA: rows.reduce((n, r) => n + (r.a ?? 0), 0),
    totalB: rows.reduce((n, r) => n + (r.b ?? 0), 0),
  };
}
