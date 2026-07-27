"use client";
import { useMemo, useState } from "react";
import { useDataset } from "@/lib/data-context";
import { resolveCell, type Dataset, type Selection } from "@/lib/model";
import { distinctValues, latestSemMonth } from "@/lib/selectors";
import { fmtInt, label, DIM_LABELS, METRIC_LABELS, fmtDate } from "@/lib/format";
import { CELL_STATE_LABEL, CELL_STATE_DESCRIPTION } from "@/lib/model";
import { StateSwatch, StateLegend } from "../StateBits";
import { ProvenanceTip } from "../Provenance";
import { OptionChips, type ChipOption } from "../OptionChips";
import type { Dimensions, Observation } from "@/lib/types";

export interface FilterState {
  source: "SEM" | "BFS";
  metric: Observation["metric"];
  year: number;
  month?: number;
  populationType: Observation["populationType"];
  dim: Partial<Dimensions>;
}

type BreakdownKey =
  | "sex" | "permit" | "legalBasis" | "ageClass" | "marital" | "lengthOfStay"
  | "reason" | "naturalisationType" | "birthCountry" | "nationalityGroup";

const BREAKDOWNS_BY_METRIC: Record<Observation["metric"], BreakdownKey[]> = {
  // nationalityGroup only exists in the BFS birthplace cube; optionValues returns
  // nothing for SEM and the row is skipped, so one list covers both. birthCountry
  // is deliberately not offered: it has exactly one real value ("Chile"), and a
  // row whose only choice re-bases the whole question onto a different
  // population is a trap rather than a filter.
  stock: ["sex", "permit", "legalBasis", "ageClass", "marital", "lengthOfStay", "nationalityGroup"],
  immigration: ["reason"],
  emigration: ["permit"],
  naturalisation: ["naturalisationType"],
};

/**
 * True when the selection is asking about the Chilean-*born* population rather
 * than Chilean passport holders. BFS carries these in different cubes, and the
 * birthplace cube has no nationality dimension at all — so pinning
 * nationality = CL would exclude every one of its cells and report the page's
 * central finding as "never published".
 */
const isBirthplaceSide = (dim: Partial<Dimensions>): boolean =>
  dim.birthCountry !== undefined || dim.nationalityGroup !== undefined;

export function CrossFilter({
  filter,
  setFilter,
}: {
  filter: FilterState;
  setFilter: (f: FilterState) => void;
}) {
  const { dataset, loading } = useDataset();
  /** The option currently hovered or focused, previewed but not committed. */
  const [preview, setPreview] = useState<{ key: BreakdownKey; option: ChipOption } | null>(null);

  const result = useMemo(() => (dataset ? resolve(dataset, filter) : null), [dataset, filter]);
  const drop = useMemo(
    () => (dataset && result && result.cell.state === "not_published" ? findDropSuggestion(dataset, filter) : null),
    [dataset, result, filter],
  );

  /**
   * Resolve every option of every breakdown against the rest of the current
   * filter, so each chip can carry its own outcome. ~50 resolutions over 3.5k
   * observations; memoised on the filter, so it runs once per interaction.
   */
  const chipsByKey = useMemo(() => {
    if (!dataset) return {} as Record<string, ChipOption[]>;
    const out: Record<string, ChipOption[]> = {};
    for (const k of BREAKDOWNS_BY_METRIC[filter.metric]) {
      const values = optionValues(dataset, filter, k);
      if (values.length === 0) continue;
      const chip = (value: string, text: string, dim: Partial<Dimensions>): ChipOption => {
        const cell = resolveCell(dataset, toSelection({ ...filter, dim }));
        return { value, label: text, state: cell.state, result: cell.value };
      };
      const withoutK = { ...filter.dim };
      delete withoutK[k];
      out[k] = [
        chip("", "Any", withoutK),
        ...values.map((v) => chip(v, label(v), { ...filter.dim, [k]: v })),
      ];
    }
    return out;
  }, [dataset, filter]);

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

  const activeCount = Object.keys(filter.dim).length;
  // Only a preview of a *different* option is worth showing; echoing the
  // committed figure back would just make the panel flicker on hover.
  const showPreview =
    preview && preview.option.value !== ((filter.dim[preview.key] as string) ?? "") ? preview : null;

  return (
    <section className="section" id="cross-filter">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Cross-filter</span>
          <h2>Ask your own question</h2>
          <p>
            Every option shows its answer before you pick it. Dashed options were never published — no source crosses
            that combination. BFS answers up to three attributes at once; SEM answers one, plus sex.
          </p>
        </div>

        <div className="xf-grid">
          <div className="xf-controls panel">
            <Field label="Source & metric">
              <div className="seg">
                {(["SEM", "BFS"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={filter.source === s}
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
                  onChange={(e) => {
                    const metric = e.target.value as Observation["metric"];
                    // Naturalisation is not split by permanent/non-permanent — the
                    // source reports it as a single total, so match that population type.
                    const populationType = metric === "naturalisation" ? "total" : "permanent";
                    setFilter({ ...filter, metric, populationType, dim: {} });
                  }}
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
                disabled={filter.metric === "naturalisation"}
              >
                {filter.metric !== "naturalisation" && <option value="permanent">Permanent</option>}
                {filter.metric !== "naturalisation" && <option value="non_permanent">Non-permanent</option>}
                {(filter.metric === "stock" || filter.metric === "naturalisation") && (
                  <option value="total">{filter.metric === "naturalisation" ? "Total" : "Total (perm + non-perm)"}</option>
                )}
              </select>
            </Field>

            <div className="xf-divider" />
            <p className="xf-hint">
              Each option shows what it resolves to. A dotted mark means the sources never crossed those dimensions —
              still selectable, because that absence is itself the finding.
            </p>

            {breakdowns.map((k) => {
              const chips = chipsByKey[k];
              if (!chips || chips.length === 0) return null;
              return (
                <div className="xf-field" key={k}>
                  {/* Named explicitly, because choosing one of these switches the
                      question from "Chilean passport holders" to "people born in
                      Chile" — two populations of very different size. */}
                  <span className="xf-field-label">
                    {k === "nationalityGroup" ? "Passport group · of the Chilean-born" : DIM_LABELS[k]}
                  </span>
                  <OptionChips
                    name={DIM_LABELS[k]}
                    options={chips}
                    value={(filter.dim[k] as string) ?? ""}
                    onChange={(v) => setDim(k, v || undefined)}
                    onPreview={(o) => setPreview(o ? { key: k, option: o } : null)}
                  />
                </div>
              );
            })}

            {activeCount > 0 && (
              <button className="xf-reset" onClick={() => setFilter({ ...filter, dim: {} })}>
                Clear {activeCount} breakdown{activeCount > 1 ? "s" : ""}
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
                      {/* Keyed so a changed figure replays the swap animation. No
                          numeric tween: counting up through 21, 22, 23 would draw
                          values that were never observed. */}
                      <div
                        key={`${result.cell.value}-${result.cell.state}`}
                        className={`xf-number mono fig-swap ${result.cell.state === "structural_zero" ? "is-zero" : ""}`}
                      >
                        {result.cell.value === null ? "—" : fmtInt(result.cell.value)}
                      </div>
                    </ProvenanceTip>
                  )}
                  <div className="xf-unit">persons{result.cell.state === "structural_zero" ? " · a genuine zero, not missing data" : ""}</div>
                </div>

                <div className={`xf-preview ${showPreview ? "is-live" : ""}`} aria-live="polite">
                  {showPreview ? (
                    <>
                      <StateSwatch state={showPreview.option.state} />
                      <span>
                        {DIM_LABELS[showPreview.key]} <strong>{showPreview.option.label}</strong> →{" "}
                        {showPreview.option.state === "not_published" ? (
                          <em>never published</em>
                        ) : (
                          <span className="mono">{fmtInt(showPreview.option.result)}</span>
                        )}
                      </span>
                    </>
                  ) : (
                    <span className="xf-preview-idle">Hover an option to preview its answer</span>
                  )}
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
      ...(filter.source === "SEM"
        ? { nationality: "CL" }
        : filter.metric === "stock" && !isBirthplaceSide(filter.dim)
          ? { nationality: "CL" }
          : {}),
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

/** Leading integer of a band label ("18-64" -> 18, "65+" -> 65, "B" -> null). */
function leadingNumber(s: string): number | null {
  const m = /^(\d+)/.exec(s);
  return m ? Number(m[1]) : null;
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
    // Age and length-of-stay bands are labelled by their lower bound, so sorting
    // them as text puts "10-14" before "5-9" and reads as scrambled. Order by the
    // bound where there is one, and fall back to text for everything else.
    const na = leadingNumber(a);
    const nb = leadingNumber(b);
    if (na !== null && nb !== null && na !== nb) return na - nb;
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
