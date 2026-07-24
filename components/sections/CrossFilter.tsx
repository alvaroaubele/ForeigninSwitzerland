"use client";
import { useMemo } from "react";
import { useDataset } from "@/lib/data-context";
import { resolveCell, type Dataset, type Selection } from "@/lib/model";
import { distinctValues, latestSemMonth } from "@/lib/selectors";
import { fmtInt, label, DIM_LABELS, METRIC_LABELS, fmtDate } from "@/lib/format";
import { CELL_STATE_LABEL, CELL_STATE_DESCRIPTION } from "@/lib/model";
import { StateSwatch, StateLegend } from "../StateBits";
import { ProvenanceTip } from "../Provenance";
import type { Dimensions, Observation } from "@/lib/types";

export interface FilterState {
  source: "SEM" | "BFS";
  metric: Observation["metric"];
  year: number;
  month?: number;
  populationType: Observation["populationType"];
  dim: Partial<Dimensions>;
}

type BreakdownKey = "sex" | "permit" | "legalBasis" | "ageClass" | "marital" | "lengthOfStay" | "reason" | "naturalisationType";

const BREAKDOWNS_BY_METRIC: Record<Observation["metric"], BreakdownKey[]> = {
  stock: ["sex", "permit", "legalBasis", "ageClass", "marital", "lengthOfStay"],
  immigration: ["reason"],
  emigration: ["permit"],
  naturalisation: ["naturalisationType"],
};

export function CrossFilter({
  filter,
  setFilter,
}: {
  filter: FilterState;
  setFilter: (f: FilterState) => void;
}) {
  const { dataset, loading } = useDataset();

  const result = useMemo(() => (dataset ? resolve(dataset, filter) : null), [dataset, filter]);
  const drop = useMemo(
    () => (dataset && result && result.cell.state === "not_published" ? findDropSuggestion(dataset, filter) : null),
    [dataset, result, filter],
  );

  if (loading || !dataset) return <SectionSkeleton />;

  const breakdowns = BREAKDOWNS_BY_METRIC[filter.metric];
  const semMonths = distinctMonths(dataset);
  const bfsYears = distinctValues(dataset, "year", (o) => o.source === "BFS").map(Number).sort((a, b) => a - b);

  const setDim = (k: BreakdownKey, v: string | undefined) => {
    const dim = { ...filter.dim };
    if (v === undefined || v === "") delete dim[k];
    else (dim as Record<string, unknown>)[k] = v;
    setFilter({ ...filter, dim });
  };

  return (
    <section className="section" id="cross-filter">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Cross-filter</span>
          <h2>Build a query — and see when the answer was never published</h2>
          <p>
            Combine any dimensions. When you pick a cross-tab the sources actually carry, you get a figure. When you pick
            one they never published, the panel says so and names the source that would have carried it — then offers the
            single filter to drop to reach a populated view.
          </p>
        </div>

        <div className="xf-grid">
          <div className="xf-controls panel">
            <Field label="Source & metric">
              <div className="seg">
                {(["SEM", "BFS"] as const).map((s) => (
                  <button
                    key={s}
                    className={`seg-btn ${filter.source === s ? "is-on" : ""}`}
                    onClick={() =>
                      setFilter({
                        ...filter,
                        source: s,
                        metric: "stock",
                        dim: {},
                        ...(s === "BFS" ? { month: undefined, year: bfsYears[bfsYears.length - 1] ?? 2024 } : { year: latestSemMonth(dataset).year, month: latestSemMonth(dataset).month }),
                      })
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Field>

            {filter.source === "SEM" && (
              <Field label="Metric">
                <select
                  value={filter.metric}
                  onChange={(e) => setFilter({ ...filter, metric: e.target.value as Observation["metric"], dim: {} })}
                >
                  {(Object.keys(METRIC_LABELS) as Observation["metric"][]).map((m) => (
                    <option key={m} value={m}>
                      {METRIC_LABELS[m]}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label={filter.source === "SEM" ? "Reference month" : "Reference year"}>
              {filter.source === "SEM" ? (
                <select
                  value={`${filter.year}-${filter.month}`}
                  onChange={(e) => {
                    const [y, m] = e.target.value.split("-").map(Number);
                    setFilter({ ...filter, year: y, month: m });
                  }}
                >
                  {semMonths.map((m) => (
                    <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                      {fmtDate(`${m.year}-${String(m.month).padStart(2, "0")}-28`).replace(/^\d+ /, "")}
                    </option>
                  ))}
                </select>
              ) : (
                <select value={filter.year} onChange={(e) => setFilter({ ...filter, year: Number(e.target.value) })}>
                  {bfsYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="Population type">
              <select
                value={filter.populationType}
                onChange={(e) => setFilter({ ...filter, populationType: e.target.value as Observation["populationType"] })}
              >
                <option value="permanent">Permanent</option>
                <option value="non_permanent">Non-permanent</option>
                {filter.metric === "stock" && <option value="total">Total (perm + non-perm)</option>}
              </select>
            </Field>

            <div className="xf-divider" />

            {breakdowns.map((k) => {
              const opts = optionValues(dataset, filter, k);
              if (opts.length === 0) return null;
              return (
                <Field key={k} label={DIM_LABELS[k]}>
                  <select value={(filter.dim[k] as string) ?? ""} onChange={(e) => setDim(k, e.target.value || undefined)}>
                    <option value="">Any</option>
                    {opts.map((v) => (
                      <option key={v} value={v}>
                        {label(v)}
                      </option>
                    ))}
                  </select>
                </Field>
              );
            })}

            {(filter.dim.sex === undefined || Object.keys(filter.dim).length > 0) && (
              <button className="xf-reset" onClick={() => setFilter({ ...filter, dim: {} })}>
                Clear breakdowns
              </button>
            )}
          </div>

          <div className="xf-result panel">
            {result && (
              <>
                <div className="xf-result-top">
                  <span className="state-chip">
                    <StateSwatch state={result.cell.state} />
                    {CELL_STATE_LABEL[result.cell.state]}
                  </span>
                  <span className="mono xf-coords">{describe(filter)}</span>
                </div>

                <div className="xf-number-wrap">
                  {result.cell.state === "not_published" ? (
                    <div className="xf-notpub">
                      <div className="xf-notpub-x">—</div>
                      <p>
                        {CELL_STATE_DESCRIPTION.not_published}
                        {result.cell.wouldBeCarriedBy ? (
                          <>
                            {" "}
                            This combination would be carried by <strong>{result.cell.wouldBeCarriedBy}</strong>, but the
                            sources never cross-tabulated it for this population.
                          </>
                        ) : (
                          " No harvested source cross-tabulates these dimensions."
                        )}
                      </p>
                      {drop && (
                        <button className="xf-drop" onClick={() => setFilter({ ...filter, dim: drop.dim })}>
                          Drop “{DIM_LABELS[drop.dropped]}” → {fmtInt(drop.cell.value)} ({CELL_STATE_LABEL[drop.cell.state].toLowerCase()})
                        </button>
                      )}
                    </div>
                  ) : (
                    <ProvenanceTip observation={result.cell.observation} state={result.cell.state}>
                      <div className={`xf-number mono ${result.cell.state === "structural_zero" ? "is-zero" : ""}`}>
                        {result.cell.value === null ? "—" : fmtInt(result.cell.value)}
                      </div>
                    </ProvenanceTip>
                  )}
                  <div className="xf-unit">persons{result.cell.state === "structural_zero" ? " · a genuine zero, not missing data" : ""}</div>
                </div>

                {result.cell.observation && (
                  <div className="xf-prov mono">
                    {result.cell.observation.source} · {result.cell.observation.dataset} · ref{" "}
                    {fmtDate(result.cell.observation.provenance.referenceDate)}
                  </div>
                )}
                <div className="xf-legend">
                  <StateLegend compact />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function toSelection(filter: FilterState): Selection {
  return {
    source: filter.source,
    metric: filter.metric,
    populationType: filter.populationType,
    dim: {
      canton: "ZG",
      year: filter.year,
      ...(filter.source === "SEM" ? { month: filter.month } : {}),
      ...(filter.source === "SEM" ? { nationality: "CL" } : filter.metric === "stock" ? { nationality: "CL" } : {}),
      ...filter.dim,
    },
  };
}

function resolve(ds: Dataset, filter: FilterState): { cell: ReturnType<typeof resolveCell> } {
  return { cell: resolveCell(ds, toSelection(filter)) };
}

function findDropSuggestion(ds: Dataset, filter: FilterState) {
  const keys = Object.keys(filter.dim) as (keyof Dimensions)[];
  for (const k of keys) {
    const dim = { ...filter.dim };
    delete dim[k];
    const cell = resolveCell(ds, toSelection({ ...filter, dim }));
    if (cell.state === "observed" || cell.state === "structural_zero") {
      return { dropped: k, dim, cell };
    }
  }
  return null;
}

function optionValues(ds: Dataset, filter: FilterState, k: BreakdownKey): string[] {
  const vals = distinctValues(
    ds,
    k,
    (o) => o.source === filter.source && o.metric === filter.metric && o.dim.canton === "ZG",
  );
  // sensible ordering
  const order = ["total", "female", "male", "B", "C", "L", "FZA", "AIG"];
  return vals.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
}

function distinctMonths(ds: Dataset): { year: number; month: number }[] {
  const set = new Map<string, { year: number; month: number }>();
  for (const o of ds.observations) {
    if (o.source === "SEM" && o.dim.year !== undefined && o.dim.month !== undefined) {
      set.set(`${o.dim.year}-${o.dim.month}`, { year: o.dim.year, month: o.dim.month });
    }
  }
  return [...set.values()].sort((a, b) => b.year - a.year || b.month - a.month);
}

function describe(filter: FilterState): string {
  const parts: string[] = [filter.metric, filter.populationType];
  for (const [k, v] of Object.entries(filter.dim)) {
    if (v !== undefined) parts.push(`${k}=${v}`);
  }
  return parts.join(" · ");
}

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="xf-field">
      <span className="xf-field-label">{l}</span>
      {children}
    </label>
  );
}

function SectionSkeleton() {
  return (
    <section className="section" id="cross-filter">
      <div className="wrap">
        <div className="skeleton" style={{ height: 360 }} />
      </div>
    </section>
  );
}
