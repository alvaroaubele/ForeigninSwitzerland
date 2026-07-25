"use client";
import { useMemo, useState } from "react";
import { useDataset } from "@/lib/data-context";
import { resolveCell, type Dataset } from "@/lib/model";
import { distinctValues, latestSemMonth } from "@/lib/selectors";
import { fmtInt, label, DIM_LABELS, STATE_CLASS, fmtDate } from "@/lib/format";
import type { CellState, Dimensions } from "@/lib/types";

type Key = "permit" | "legalBasis" | "ageClass" | "marital" | "lengthOfStay";
const KEYS: Key[] = ["permit", "legalBasis", "ageClass", "marital", "lengthOfStay"];

interface Seg {
  value: string;
  label: string;
  count: number | null;
  state: CellState;
}
interface Row {
  key: Key;
  segments: Seg[];
  total: number;
}

/**
 * The population portrait: every attribute of the 35 at once.
 *
 * The cross-filter answers "how many are X". This answers "who are they" — the
 * whole composition on one screen, which is as close to a profile as the sources
 * permit. They cross each attribute with sex and with nothing else, so a person
 * cannot be narrowed past two attributes; the sex split makes that second level
 * visible, and marital status shows the wall where even that is not published.
 */
export function Portrait() {
  const { dataset, loading } = useDataset();
  const [bySex, setBySex] = useState(false);

  const sem = dataset ? latestSemMonth(dataset) : null;
  const rows = useMemo(
    () => (dataset && sem ? buildRows(dataset, sem, "total") : []),
    [dataset, sem],
  );
  const female = useMemo(
    () => (dataset && sem && bySex ? buildRows(dataset, sem, "female") : []),
    [dataset, sem, bySex],
  );
  const male = useMemo(
    () => (dataset && sem && bySex ? buildRows(dataset, sem, "male") : []),
    [dataset, sem, bySex],
  );

  // SEM 2-22 carries this as a subset flag on the married row rather than as a
  // dimension of its own, so it has no place among the bars — but it is one of
  // the more telling numbers on the page, and was previously not shown at all.
  const marriedToSwiss = useMemo(() => {
    if (!dataset || !sem) return null;
    const c = resolveCell(dataset, {
      source: "SEM",
      metric: "stock",
      populationType: "permanent",
      dim: {
        canton: "ZG", nationality: "CL", year: sem.year, month: sem.month,
        sex: "total", marital: "married", marriedToSwiss: true,
      },
    });
    return c.state === "observed" ? c.value : null;
  }, [dataset, sem]);

  if (loading || !dataset || !sem) {
    return (
      <section className="section" id="portrait">
        <div className="wrap">
          <div className="skeleton" style={{ height: 320 }} />
        </div>
      </section>
    );
  }

  const headTotal = rows.find((r) => r.total > 0)?.total ?? 0;

  return (
    <section className="section" id="portrait">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Portrait</span>
          <h2>Who are the {fmtInt(headTotal)}?</h2>
          <p>
            Every attribute the register carries, at once. Split by sex to go one level deeper — that is as far as the
            data goes, because the offices never cross two of these with each other.
          </p>
        </div>

        <div className="controls-row">
          <div className="seg">
            <button className={`seg-btn ${!bySex ? "is-on" : ""}`} onClick={() => setBySex(false)}>
              Everyone
            </button>
            <button className={`seg-btn ${bySex ? "is-on" : ""}`} onClick={() => setBySex(true)}>
              Split by sex
            </button>
          </div>
          <span className="portrait-ref mono">
            SEM · {fmtDate(`${sem.year}-${String(sem.month).padStart(2, "0")}-28`).replace(/^\d+ /, "")} · permanent
          </span>
        </div>

        <div className="portrait">
          {rows.map((r, i) => (
            <div className="portrait-row" key={r.key}>
              <div className="portrait-dim">{DIM_LABELS[r.key]}</div>
              {!bySex ? (
                <Bar row={r} />
              ) : isSplittable(female[i]) ? (
                <div className="portrait-split">
                  <Bar row={female[i]} caption="Women" />
                  <Bar row={male[i]} caption="Men" />
                </div>
              ) : (
                <div className="portrait-wall">
                  <Bar row={r} caption="Everyone" />
                  <p className="portrait-wall-note">
                    Not published by sex — SEM reports marital status for the group as a whole only.
                  </p>
                </div>
              )}
              {r.key === "marital" && marriedToSwiss !== null && (
                <p className="portrait-note">
                  Of the married, <strong>{fmtInt(marriedToSwiss)}</strong> are married to a Swiss national.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Bar({ row, caption }: { row: Row; caption?: string }) {
  const drawable = row.segments.filter((s) => (s.count ?? 0) > 0);
  const zeros = row.segments.filter((s) => (s.count ?? 0) === 0 && s.state !== "not_published");
  const total = drawable.reduce((n, s) => n + (s.count ?? 0), 0);

  return (
    <div className="portrait-bar-wrap">
      {caption && <div className="portrait-caption">{caption} · {fmtInt(total)}</div>}
      <div className="portrait-bar" role="img" aria-label={drawable.map((s) => `${s.label} ${s.count}`).join(", ")}>
        {drawable.map((s) => (
          <div
            key={s.value}
            className="portrait-seg"
            style={{
              // flex-basis must be 0: with the default `auto` the label text
              // becomes the basis and only the *leftover* space is shared out,
              // so a segment's width stops being proportional to its count.
              flex: `${s.count ?? 0} 1 0`,
              // A quiet monochrome ramp: the portrait should read as one
              // population, not a set of competing categories. Keyed on the
              // segment's position in the full category list, not in the drawn
              // subset — otherwise the same category takes a different shade in
              // the women's and men's bars and they cannot be compared.
              background: `color-mix(in srgb, var(--fg) ${88 - shadeIndex(row, s) * 9}%, white)`,
            }}
            title={`${s.label}: ${fmtInt(s.count)} of ${fmtInt(total)}`}
          >
            {(s.count ?? 0) / (total || 1) > 0.12 && (
              <span className="portrait-seg-label">
                {s.label} <span className="mono">{fmtInt(s.count)}</span>
              </span>
            )}
          </div>
        ))}
        {drawable.length === 0 && <div className="portrait-seg is-empty" />}
      </div>
      <div className="portrait-keys">
        {drawable
          .filter((s) => (s.count ?? 0) / (total || 1) <= 0.12)
          .map((s) => (
            <span className="portrait-key" key={s.value}>
              {s.label} <span className="mono">{fmtInt(s.count)}</span>
            </span>
          ))}
        {zeros.map((s) => (
          <span className={`portrait-key is-zero ${STATE_CLASS[s.state]}`} key={s.value} title="A counted zero — nobody, as opposed to nobody having counted">
            <span className="portrait-ring" aria-hidden /> {s.label} <span className="mono">0</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Whether a row can honestly be drawn split by sex.
 *
 * Read from the already-computed female row rather than from a probe of one
 * representative value: probing a single category assumes the whole row shares
 * its fate, which happens to hold today but would silently mis-draw a row that
 * the source crosses for some categories and not others.
 */
function isSplittable(row: Row | undefined): boolean {
  return !!row && row.segments.some((s) => s.state !== "not_published");
}

/**
 * Position of a segment among *all* of its row's categories, so a category keeps
 * the same shade whichever bar it is drawn in. Capped so the ramp never runs
 * lighter than white text can sit on.
 */
function shadeIndex(row: Row, seg: Seg): number {
  const i = row.segments.findIndex((s) => s.value === seg.value);
  return Math.min(i < 0 ? 0 : i, 4);
}

function buildRows(
  ds: Dataset,
  sem: { year: number; month: number },
  sex: "total" | "female" | "male",
): Row[] {
  return KEYS.map((key) => {
    const values = distinctValues(
      ds,
      key,
      (o) => o.source === "SEM" && o.metric === "stock" && o.dim.canton === "ZG",
    ).sort(byBand);

    const cellFor = (dim: Partial<Dimensions>) =>
      resolveCell(ds, {
        source: "SEM",
        metric: "stock",
        populationType: "permanent",
        dim: { canton: "ZG", nationality: "CL", year: sem.year, month: sem.month, sex, ...dim },
      });

    const segments: Seg[] = values.map((v) => {
      const c = cellFor({ [key]: v } as Partial<Dimensions>);
      return { value: v, label: label(v), count: c.value, state: c.state };
    });

    return {
      key,
      segments,
      total: segments.reduce((n, s) => n + (s.count ?? 0), 0),
    };
  });
}

/** Age and stay bands are labelled by their lower bound; sort on it, not on text. */
function byBand(a: string, b: string): number {
  const na = /^(\d+)/.exec(a);
  const nb = /^(\d+)/.exec(b);
  if (na && nb && Number(na[1]) !== Number(nb[1])) return Number(na[1]) - Number(nb[1]);
  return a.localeCompare(b);
}
