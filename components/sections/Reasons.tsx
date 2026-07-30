"use client";
import { useMemo, useState } from "react";
import { useDataset } from "@/lib/data-context";
import { resolveCell, type Dataset } from "@/lib/model";
import { distinctValues } from "@/lib/selectors";
import { useI18n } from "@/lib/i18n";
import { fmtInt, label, STATE_CLASS } from "@/lib/format";
import type { Dict } from "@/lib/dict";
import type { CellState, Dimensions, Observation } from "@/lib/types";

type View = "arrivals" | "departures" | "naturalisations";

const VIEW_IDS: View[] = ["arrivals", "departures", "naturalisations"];

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
  const { dataset, nat, loading } = useDataset();
  const { t, natWho, locale } = useI18n();
  const [view, setView] = useState<View>("arrivals");
  const [bySex, setBySex] = useState(false);
  /**
   * null = the full published run; a year narrows to that calendar year;
   * "12mo" reads the rolling twelve-month release — the freshest flow data the
   * harvest owns, five months ahead of the last complete calendar year.
   */
  const [period, setPeriod] = useState<number | "12mo" | null>(null);

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
    () => (dataset ? build(dataset, nat, view, view !== "arrivals" && bySex, period) : null),
    // locale: the rows bake in label() output, which follows the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- label() reads the locale through a module global
    [dataset, view, bySex, period, locale, nat],
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
  const viewTab: Record<View, string> = {
    arrivals: t.movement.whyCame,
    departures: t.movement.whoLeft,
    naturalisations: t.movement.becameSwiss,
  };

  return (
    <section className="section" id="reasons">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">
            {t.movement.eyebrow} · {period === "12mo" ? t.movement.last12Eyebrow : years.length === 1 ? years[0] : `${years[0]}–${years[years.length - 1]}`}
          </span>
          <h2>{viewTab[view]}</h2>
          <p>{lead(t, natWho(nat), view, rows, totalA, totalB, years, period === "12mo")}</p>
        </div>

        <div className="controls-row">
          <div className="seg">
            {VIEW_IDS.map((v) => (
              <button key={v} className={`seg-btn ${view === v ? "is-on" : ""}`} onClick={() => setView(v)}>
                {viewTab[v]}
              </button>
            ))}
          </div>
          {view === "arrivals" ? (
            <div className="seg" role="group" aria-label="Split (unavailable for arrivals)">
              <button className={`seg-btn ${!bySex ? "is-on" : ""}`} onClick={() => setBySex(false)}>
                {t.movement.segAll}
              </button>
              <button className={`seg-btn ${bySex ? "is-on" : ""}`} onClick={() => setBySex(true)}>
                {t.movement.segPermVsNon}
              </button>
            </div>
          ) : (
            <div className="seg">
              <button className={`seg-btn ${!bySex ? "is-on" : ""}`} onClick={() => setBySex(false)}>
                {t.movement.everyone}
              </button>
              <button className={`seg-btn ${bySex ? "is-on" : ""}`} onClick={() => setBySex(true)}>
                {t.movement.splitBySex}
              </button>
            </div>
          )}
          <label className="reasons-period">
            <select
              aria-label={t.movement.periodAria}
              value={period ?? "all"}
              onChange={(e) =>
                setPeriod(e.target.value === "all" ? null : e.target.value === "12mo" ? "12mo" : Number(e.target.value))
              }
            >
              <option value="all">{t.movement.periodAll(allYears[0], allYears[allYears.length - 1])}</option>
              <option value="12mo">{t.movement.period12}</option>
              {[...allYears].reverse().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <span className="portrait-ref mono">{sourceNote(t, view, period === "12mo")}</span>
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
                      <ReasonBar value={r.a} max={max} tone="perm" caption={t.movement.capPermanent} />
                      <ReasonBar value={r.b} max={max} tone="nonperm" caption={t.movement.capNonPermanent} />
                    </div>
                  ) : splitOn ? (
                    <div className="reason-split">
                      <ReasonBar value={r.a} max={max} tone="perm" caption={t.movement.capWomen} />
                      <ReasonBar value={r.b} max={max} tone="nonperm" caption={t.movement.capMen} />
                    </div>
                  ) : (
                    <ReasonBar value={total} max={max} tone="perm" />
                  )}
                </div>
                <div className={`reason-total mono ${total === 0 ? "is-zero" : ""}`} title={totalTitle(t, total, partial)}>
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
          <p className="reasons-wall">{t.movement.wallArrivals}</p>
        )}

        <p className="reasons-foot">{foot(t, view, totalA, totalB, splitOn)}</p>
      </div>
    </section>
  );
}

function totalTitle(t: Dict, total: number, partial: boolean): string {
  if (partial) return t.movement.titlePartial(fmtInt(total));
  if (total === 0) return t.movement.titleZero;
  return t.movement.titleTotal(fmtInt(total));
}

function lead(t: Dict, who: string, view: View, rows: Row[], totalA: number, totalB: number, years: number[], rolling: boolean) {
  const grand = totalA + totalB;
  const span = rolling ? t.movement.span12 : years.length === 1 ? t.movement.spanYear(years[0]) : t.movement.spanYears(years.length);
  if (view === "arrivals") {
    // The largest reason is read off the sorted rows, not asserted: family
    // reunification leads nationally, but education leads in Basel-Land and
    // St. Gallen, and a sentence that names the winner must actually check.
    const top = rows[0];
    const refugeeZero = rows
      .filter((r) => ["refugee", "hardship", "asylum_ruling"].includes(r.key))
      .every((r) => (r.a ?? 0) + (r.b ?? 0) === 0);
    return (
      <>
        {t.movement.leadArrivals(fmtInt(grand), span)}
        {top && (top.a ?? 0) + (top.b ?? 0) > 0 && (
          <>
            {t.movement.leadTop(top.label.toLowerCase(), fmtInt((top.a ?? 0) + (top.b ?? 0)))}
            {refugeeZero && t.movement.leadNoRefugees}
          </>
        )}
      </>
    );
  }
  if (view === "departures") {
    return <>{t.movement.leadDepartures(fmtInt(grand), span)}</>;
  }
  return <>{t.movement.leadSwiss(who, fmtInt(grand), span)}</>;
}

function foot(t: Dict, view: View, totalA: number, totalB: number, splitOn: boolean) {
  if (view === "arrivals") {
    return <>{t.movement.footArrivals(fmtInt(totalA), fmtInt(totalB))}</>;
  }
  const who = splitOn ? t.movement.footWomenMen(fmtInt(totalA), fmtInt(totalB)) : "";
  return <>{t.movement.footOther(who)}</>;
}

function sourceNote(t: Dict, view: View, rolling: boolean): string {
  const kind = rolling ? t.movement.srcRolling : t.movement.srcYear;
  if (view === "arrivals") return `SEM 3-30 + 3-31 · ${kind}`;
  if (view === "departures") return `SEM 3-55 · ${kind}`;
  return `SEM 3-60 · ${kind}`;
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

function build(ds: Dataset, nat: string, view: View, bySex: boolean, period: number | "12mo" | null) {
  const datasets = view === "arrivals" ? ["3-30", "3-31"] : view === "departures" ? ["3-55"] : ["3-60"];

  // The rolling twelve-month release is the one flow file whose reference date
  // is not a 31 December; it is excluded from the calendar-year sums (it would
  // double-count) and used only when explicitly selected.
  const rolling = period === "12mo";
  const years = rolling
    ? [
        ...new Set(
          ds.observations
            .filter(
              (o: Observation) => datasets.includes(o.dataset) && !o.provenance.referenceDate.endsWith("-12-31"),
            )
            .map((o) => o.dim.year as number),
        ),
      ].sort((a, b) => a - b)
    : [
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
        // The rolling release is keyed to its publication month (2026-05), the
        // calendar-year releases to December.
        dim: { nationality: nat, year, month: rolling ? 5 : 12, sex, ...dim },
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
