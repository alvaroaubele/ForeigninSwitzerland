"use client";
import { useDataset } from "@/lib/data-context";
import { bornHeadline, passportHeadline, passportSplit, latestSemMonth } from "@/lib/selectors";
import { fmtInt, fmtDate, label } from "@/lib/format";
import { ProvenanceTip } from "../Provenance";
import { StateSwatch } from "../StateBits";
import type { CellState } from "@/lib/types";

const GROUP_COLORS: Record<string, string> = {
  Swiss: "var(--accent)",
  EU: "var(--series-2)",
  "Latin America & Caribbean": "#1a7a5e",
  "North America": "#7a5c00",
  Oceania: "#6b4a8c",
  EFTA: "#4a5568",
  "Other Europe": "#8a6d3b",
  Africa: "#985e3a",
  Asia: "#3b6d8a",
};

export function PassportBirthplace() {
  const { dataset, loading } = useDataset();
  if (loading || !dataset) return <HeroSkeleton />;

  const passport = passportHeadline(dataset);
  const born = bornHeadline(dataset, 2024);
  const split = passportSplit(dataset, 2024);
  const sem = latestSemMonth(dataset);

  const splitTotal = split.reduce((s, r) => s + (r.cell.value ?? 0), 0);
  const latAm = split.find((r) => r.group === "Latin America & Caribbean")?.cell.value ?? null;
  const nonLatAm = born.value !== null && latAm !== null ? born.value - latAm : null;

  return (
    <section className="section" id="passport-birthplace" style={{ borderTop: "none", paddingTop: 20 }}>
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">The central contrast</span>
          <h2 style={{ fontSize: 26, marginTop: 8 }}>Citizenship is not birthplace</h2>
          <p>
            Zug has about three dozen Chilean passport holders and about a hundred residents born in Chile. They are
            largely different people: most of the Chilean-born now hold a Swiss or EU passport.
          </p>
        </div>

        <div className="hero-grid">
          <HeroStat
            kicker="Hold a Chilean passport"
            value={passport.value}
            state={passport.state}
            observation={passport.observation}
            foot={`SEM · ${fmtDate(`${sem.year}-${String(sem.month).padStart(2, "0")}-28`).replace(/^\d+ /, "")} · permanent residents`}
            accent
          />
          <div className="hero-vs" aria-hidden>
            ≠
          </div>
          <HeroStat
            kicker="Were born in Chile"
            value={born.value}
            state={born.state}
            observation={born.observation}
            foot="BFS STATPOP · 31 Dec 2024 · permanent residents"
          />
        </div>

        <div className="panel hero-split">
          <div className="hero-split-head">
            <h3 style={{ fontSize: 15 }}>
              The {fmtInt(born.value)} Chilean-born residents, by the passport they actually hold
            </h3>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
              BFS STATPOP · cube 399 · 2024
            </span>
          </div>

          {split.length > 0 && splitTotal > 0 ? (
            <>
              <div className="stackbar" role="img" aria-label="Passport composition of Chilean-born residents">
                {split
                  .filter((r) => (r.cell.value ?? 0) > 0)
                  .map((r) => (
                    <ProvenanceTip
                      key={r.group}
                      observation={r.cell.observation}
                      state={r.cell.state}
                      className="stackseg-anchor"
                      style={{ flexGrow: r.cell.value ?? 0, flexBasis: 0 }}
                    >
                      <span
                        className="stackseg"
                        style={{
                          width: "100%",
                          background: GROUP_COLORS[r.group] ?? "var(--fg-muted)",
                        }}
                        title={`${label(r.group)}: ${fmtInt(r.cell.value)}`}
                      />
                    </ProvenanceTip>
                  ))}
              </div>
              <div className="stack-legend">
                {split
                  .filter((r) => (r.cell.value ?? 0) > 0)
                  .map((r) => (
                    <span key={r.group} className="stack-legend-item">
                      <span className="stack-dot" style={{ background: GROUP_COLORS[r.group] ?? "var(--fg-muted)" }} />
                      {label(r.group)}
                      <span className="mono stack-num">{fmtInt(r.cell.value)}</span>
                    </span>
                  ))}
              </div>
              {nonLatAm !== null && born.value !== null && (
                <p className="hero-insight">
                  <strong>{fmtInt(nonLatAm)} of {fmtInt(born.value)}</strong> Chilean-born residents — {Math.round((nonLatAm / (born.value || 1)) * 100)}% —
                  hold a passport other than Latin-American. Naturalisation and mixed-nationality families make birthplace
                  and citizenship diverge sharply at this scale.
                </p>
              )}
            </>
          ) : (
            <div className="await-bfs">
              <StateSwatch state={born.state as CellState} />
              <span>
                The passport split comes from BFS STATPOP cube 399. {born.state === "not_published" ? "It is not yet present in this build of the harvest." : "Awaiting the birth-country cube."}
              </span>
            </div>
          )}
        </div>

        <p className="offset-note">
          <span className="offset-badge mono">SEM 31 May 2026</span>
          <span className="offset-badge mono">BFS 31 Dec 2024</span>
          These two reference dates are ~17 months apart. The offset is real and is preserved throughout this explorer —
          the two series are never reconciled to a single figure.
        </p>
      </div>
    </section>
  );
}

function HeroStat({
  kicker,
  value,
  state,
  observation,
  foot,
  accent,
}: {
  kicker: string;
  value: number | null;
  state: CellState;
  observation: import("@/lib/types").Observation | null;
  foot: string;
  accent?: boolean;
}) {
  return (
    <div className={`hero-stat ${accent ? "is-accent" : ""}`}>
      <div className="hero-kicker">{kicker}</div>
      <ProvenanceTip observation={observation} state={state}>
        <div className="hero-number mono">{value === null ? "—" : fmtInt(value)}</div>
      </ProvenanceTip>
      <div className="hero-foot">{foot}</div>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <section className="section" style={{ borderTop: "none" }}>
      <div className="wrap">
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    </section>
  );
}
