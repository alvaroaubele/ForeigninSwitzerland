"use client";
import { useDataset } from "@/lib/data-context";
import { bornHeadline, passportHeadline, passportSplit, totalHeadline, latestSemMonth } from "@/lib/selectors";
import { useI18n } from "@/lib/i18n";
import { fmtInt, fmtMonthYear, label } from "@/lib/format";
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
  const { dataset, nat, canton, loading } = useDataset();
  const { t, cName, natName } = useI18n();
  if (loading || !dataset) return <HeroSkeleton />;

  const nName = natName(nat);
  // The grouped populations (all foreigners, EU/EFTA, stateless…) have no
  // birth-country series in cube 399, so their hero contrasts the two SEM
  // population types instead of passport-vs-birthplace.
  const isGroup = nat.startsWith("_");
  const passport = passportHeadline(dataset, nat);
  const totalStock = totalHeadline(dataset, nat);
  const born = bornHeadline(dataset, nat, 2024);
  const split = passportSplit(dataset, nat, 2024);
  const sem = latestSemMonth(dataset);

  const splitTotal = split.reduce((s, r) => s + (r.cell.value ?? 0), 0);
  const swiss = split.find((r) => r.group === "Swiss")?.cell.value ?? null;

  return (
    <section className="section" id="passport-birthplace" style={{ borderTop: "none", paddingTop: 20 }}>
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">{t.hero.eyebrow}</span>
          <h2 style={{ fontSize: 26, marginTop: 8 }}>{t.hero.h}</h2>
          <p>
            {isGroup
              ? t.hero.leadGroup(nName, cName(canton), fmtInt(passport.value), fmtInt(totalStock.value))
              : t.hero.lead(nName, cName(canton), fmtInt(passport.value), fmtInt(born.value))}
          </p>
        </div>

        <div className="hero-grid">
          <HeroStat
            kicker={isGroup ? `${t.xf.popPermanent} — ${nName}` : t.hero.kickerPassport(nName)}
            value={passport.value}
            state={passport.state}
            observation={passport.observation}
            foot={t.hero.footSem(fmtMonthYear(sem.year, sem.month))}
            accent
          />
          <div className="hero-vs" aria-hidden>
            ≠
          </div>
          {isGroup ? (
            <HeroStat
              kicker={t.baselines.totalInclNP}
              value={totalStock.value}
              state={totalStock.state}
              observation={totalStock.observation}
              foot={t.hero.footSem(fmtMonthYear(sem.year, sem.month))}
            />
          ) : (
            <HeroStat
              kicker={t.hero.kickerBorn(nName)}
              value={born.value}
              state={born.state}
              observation={born.observation}
              foot={t.hero.footBfs}
            />
          )}
        </div>

        {!isGroup && (
        <div className="panel hero-split">
          <div className="hero-split-head">
            <h3 style={{ fontSize: 15 }}>{t.hero.splitHead(nName, fmtInt(born.value))}</h3>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
              BFS STATPOP · cube 399 · 2024
            </span>
          </div>

          {split.length > 0 && splitTotal > 0 ? (
            <>
              <div className="stackbar" role="img" aria-label={t.hero.splitAria}>
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
              {swiss !== null && born.value !== null && born.value > 0 && (
                <p className="hero-insight">
                  {t.hero.insight(fmtInt(swiss), fmtInt(born.value), Math.round((swiss / born.value) * 100))}
                </p>
              )}
            </>
          ) : (
            <div className="await-bfs">
              <StateSwatch state={born.state as CellState} />
              <span>{t.hero.awaiting}</span>
            </div>
          )}
        </div>
        )}

        <p className="offset-note">
          <span className="offset-badge mono">SEM 31 May 2026</span>
          <span className="offset-badge mono">BFS 31 Dec 2024</span>
          {t.hero.offsetNote}
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
