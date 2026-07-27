"use client";
import { useMemo, useState } from "react";
import { useDataset } from "@/lib/data-context";
import { resolveCell, type Dataset } from "@/lib/model";
import { distinctValues, latestSemMonth, CUBE_399, CUBE_423 } from "@/lib/selectors";
import { fmtInt, label, DIM_LABELS, STATE_CLASS, fmtDate } from "@/lib/format";
import type { CellState, Dimensions } from "@/lib/types";

type Key = "permit" | "legalBasis" | "ageClass" | "marital" | "lengthOfStay" | "nationalityGroup";
const KEYS: Key[] = ["permit", "legalBasis", "ageClass", "marital", "lengthOfStay"];
const BORN_KEYS: Key[] = ["nationalityGroup", "ageClass", "marital"];

/** Which population the portrait is describing. */
type Pop = "nationals" | "born";

/** Latest complete BFS years: cube 399 runs to 2024, cube 423 exists for 2023 only. */
const BORN_YEAR = 2024;
const BORN_MARITAL_YEAR = 2023;

/**
 * Twenty-year buckets for the Chilean-born age profile.
 *
 * BFS publishes this in 21 five-year bands. Ninety-nine people spread over 21
 * bands is a row of ones and twos that reads as noise, so the bands are summed
 * into decades-pairs. This is exact arithmetic over published figures, not an
 * estimate — and if any component band were ever withheld the group inherits
 * that state rather than quietly reporting a short total.
 */
const AGE_GROUPS: { label: string; lo: number; hi: number }[] = [
  { label: "0-19", lo: 0, hi: 19 },
  { label: "20-39", lo: 20, hi: 39 },
  { label: "40-59", lo: 40, hi: 59 },
  { label: "60-79", lo: 60, hi: 79 },
  { label: "80+", lo: 80, hi: 999 },
];

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
  const [pop, setPop] = useState<Pop>("nationals");

  const sem = dataset ? latestSemMonth(dataset) : null;
  const build = useMemo(
    () =>
      (sex: "total" | "female" | "male"): Row[] =>
        !dataset || !sem ? [] : pop === "nationals" ? buildRows(dataset, sem, sex) : buildBornRows(dataset, sex),
    [dataset, sem, pop],
  );
  const rows = useMemo(() => build("total"), [build]);
  const female = useMemo(() => (bySex ? build("female") : []), [build, bySex]);
  const male = useMemo(() => (bySex ? build("male") : []), [build, bySex]);

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

  // The nationals rows all sum to the same 35; the born rows do not, because
  // marital status comes from a different cube and an earlier year. Take the
  // passport-group row, which is the one that counts the whole 99.
  const headTotal = (pop === "born" ? rows[0]?.total : rows.find((r) => r.total > 0)?.total) ?? 0;
  // Read from the passport-group row rather than compared against the Chilean-
  // national count: those come from a different cube at a different date, and
  // subtracting across registers is exactly the arithmetic this page refuses.
  const latAmBorn =
    pop === "born"
      ? (rows[0]?.segments.find((s) => s.value === "Latin America & Caribbean")?.count ?? null)
      : null;

  return (
    <section className="section" id="portrait">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Portrait</span>
          <h2>Who are the {fmtInt(headTotal)}?</h2>
          <p>
            {pop === "nationals" ? (
              <>
                Everyone in Zug holding a Chilean passport, by every attribute the register carries. Split by sex to go
                one level deeper — as far as SEM goes, since it crosses these with sex and with nothing else. BFS goes
                further: the cross-filter below answers permit, sex and age together.
              </>
            ) : (
              <>
                Everyone in Zug born in Chile — a larger and mostly different group.{" "}
                {latAmBorn !== null && (
                  <>
                    Only <strong>{fmtInt(latAmBorn)}</strong> still hold a Latin-American passport; the other{" "}
                    <strong>{fmtInt(headTotal - latAmBorn)}</strong> carry Swiss, EU or other citizenship and appear
                    nowhere in the Chilean-national figures.
                  </>
                )}
              </>
            )}
          </p>
        </div>

        <div className="controls-row">
          <div className="seg">
            <button className={`seg-btn ${pop === "nationals" ? "is-on" : ""}`} onClick={() => setPop("nationals")}>
              Chilean passport
            </button>
            <button className={`seg-btn ${pop === "born" ? "is-on" : ""}`} onClick={() => setPop("born")}>
              Born in Chile
            </button>
          </div>
          <div className="seg">
            <button className={`seg-btn ${!bySex ? "is-on" : ""}`} onClick={() => setBySex(false)}>
              Everyone
            </button>
            <button className={`seg-btn ${bySex ? "is-on" : ""}`} onClick={() => setBySex(true)}>
              Split by sex
            </button>
          </div>
          <span className="portrait-ref mono">
            {pop === "nationals"
              ? `SEM · ${fmtDate(`${sem.year}-${String(sem.month).padStart(2, "0")}-28`).replace(/^\d+ /, "")} · permanent`
              : `BFS STATPOP · 31 Dec ${BORN_YEAR} · permanent`}
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
                    {pop === "nationals"
                      ? "Not published by sex — SEM reports marital status for the group as a whole only."
                      : "Not published by sex for this population."}
                  </p>
                </div>
              )}
              {pop === "born" && r.key === "marital" && (
                <p className="portrait-note">
                  Marital status for the Chilean-born comes from a different cube and an earlier year (31 Dec{" "}
                  {BORN_MARITAL_YEAR}), so it counts {fmtInt(r.total)} rather than {fmtInt(headTotal)}. The dates are
                  not reconciled.
                </p>
              )}
              {pop === "born" && r.key === "ageClass" && (
                <p className="portrait-note">
                  Summed from the 21 five-year bands BFS publishes — exact arithmetic, not an estimate.
                </p>
              )}
              {pop === "nationals" && r.key === "marital" && marriedToSwiss !== null && (
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

/**
 * The Chilean-born portrait, from the BFS birthplace cubes.
 *
 * A different population and a different pair of sources from the nationals
 * portrait: passport group and age come from cube 399 at 2024, marital status
 * from cube 423, which exists for 2023 only. The reference dates are not
 * reconciled — each row states its own.
 */
function buildBornRows(ds: Dataset, sex: "total" | "female" | "male"): Row[] {
  const cell = (cube: string, year: number, dim: Partial<Dimensions>) =>
    resolveCell(ds, {
      source: "BFS",
      dataset: cube,
      populationType: "permanent",
      dim: { canton: "ZG", year, birthCountry: "CL", sex, ...dim },
    });

  return BORN_KEYS.map((key): Row => {
    if (key === "nationalityGroup") {
      const values = distinctValues(ds, "nationalityGroup", (o) => o.dataset === CUBE_399).filter(
        (v) => v !== "total",
      );
      const segments = values.map((v) => {
        const c = cell(CUBE_399, BORN_YEAR, { nationalityGroup: v });
        return { value: v, label: label(v), count: c.value, state: c.state };
      });
      return { key, segments, total: sum(segments) };
    }

    if (key === "ageClass") {
      const bands = distinctValues(ds, "ageClass", (o) => o.dataset === CUBE_399).sort(byBand);
      const segments = AGE_GROUPS.map((g) => {
        const members = bands.filter((b) => {
          const lo = Number(/^(\d+)/.exec(b)?.[1] ?? NaN);
          return Number.isFinite(lo) && lo >= g.lo && lo <= g.hi;
        });
        const cells = members.map((b) => cell(CUBE_399, BORN_YEAR, { ageClass: b }));
        // A group is only as trustworthy as its weakest component band.
        const withheld = cells.find((c) => c.state === "not_published" || c.state === "suppressed");
        return {
          value: g.label,
          label: g.label,
          count: withheld ? null : cells.reduce((n, c) => n + (c.value ?? 0), 0),
          state: withheld ? withheld.state : ("observed" as CellState),
        };
      });
      return { key, segments, total: sum(segments) };
    }

    const values = distinctValues(
      ds,
      "marital",
      (o) => o.dataset === CUBE_423 && o.dim.birthCountry === "CL",
    ).sort();
    const segments = values.map((v) => {
      const c = cell(CUBE_423, BORN_MARITAL_YEAR, { marital: v });
      return { value: v, label: label(v), count: c.value, state: c.state };
    });
    return { key, segments, total: sum(segments) };
  });
}

const sum = (segs: Seg[]): number => segs.reduce((n, s) => n + (s.count ?? 0), 0);

/** Age and stay bands are labelled by their lower bound; sort on it, not on text. */
function byBand(a: string, b: string): number {
  const na = /^(\d+)/.exec(a);
  const nb = /^(\d+)/.exec(b);
  if (na && nb && Number(na[1]) !== Number(nb[1])) return Number(na[1]) - Number(nb[1]);
  return a.localeCompare(b);
}
