"use client";
import { useDataset } from "@/lib/data-context";
import { resolveCell } from "@/lib/model";
import { bornHeadline, passportHeadline, passportSplit, latestSemMonth, cantonName } from "@/lib/selectors";
import { fmtInt } from "@/lib/format";

interface Finding {
  figure: string;
  headline: string;
  detail: string;
  href: string;
  cta: string;
}

/**
 * What this page has to say, before the reader has to work for it.
 *
 * Every figure here is resolved live from the harvest rather than typed in, so a
 * re-harvest cannot leave the summary asserting something the data no longer
 * supports. Each card is a door into the section that proves it — the point is
 * to give a first-time reader a reason to scroll, not to replace the sections.
 */
export function Findings() {
  const { dataset, canton, loading } = useDataset();
  if (loading || !dataset) return null;

  const passport = passportHeadline(dataset);
  const born = bornHeadline(dataset, 2024);
  const split = passportSplit(dataset, 2024);
  const sem = latestSemMonth(dataset);
  const latAm = split.find((r) => r.group === "Latin America & Caribbean")?.cell.value ?? null;
  const swiss = split.find((r) => r.group === "Swiss")?.cell.value ?? null;

  // Reasons are a nine-year sum, so they have to be added up rather than looked
  // up. Computed here rather than asserted, because the balance that held for
  // Zug does not necessarily hold for Geneva or for Switzerland.
  const reasonYears = [...new Set(dataset.observations.filter((o) => o.dataset === "3-30" && o.dim.reason).map((o) => o.dim.year as number))];
  const reasonTotal = (reason?: string) =>
    dataset.observations
      .filter(
        (o) =>
          (o.dataset === "3-30" || o.dataset === "3-31") &&
          o.dim.sex === "total" &&
          o.provenance.referenceDate.endsWith("-12-31") &&
          reasonYears.includes(o.dim.year as number) &&
          (reason ? o.dim.reason === reason : o.dim.reason !== undefined),
      )
      .reduce((n, o) => n + (o.value ?? 0), 0);
  const family = reasonTotal("family_reunification");
  const allReasons = reasonTotal();
  const familyShare = allReasons > 0 ? Math.round((family / allReasons) * 100) : null;

  const stay0to4 = resolveCell(dataset, {
    source: "SEM",
    metric: "stock",
    populationType: "permanent",
    dim: { nationality: "CL", year: sem.year, month: sem.month, sex: "total", lengthOfStay: "0-4" },
  });
  const over65 = resolveCell(dataset, {
    source: "SEM",
    metric: "stock",
    populationType: "permanent",
    dim: { nationality: "CL", year: sem.year, month: sem.month, sex: "total", ageClass: "65+" },
  });

  const findings: Finding[] = [
    {
      figure: `${fmtInt(passport.value)} vs ${fmtInt(born.value)}`,
      headline: "Two counts, one community",
      detail: `${fmtInt(passport.value)} people hold a Chilean passport; ${fmtInt(born.value)} were born in Chile. Counting one misses most of the other.`,
      href: "#passport-birthplace",
      cta: "See the split",
    },
    {
      figure: swiss !== null ? fmtInt(swiss) : "—",
      headline: "Have become Swiss",
      detail: `Of the ${fmtInt(born.value)} born in Chile, ${fmtInt(swiss)} now hold a Swiss passport and ${fmtInt(latAm)} a Latin-American one.`,
      href: "#portrait",
      cta: "Meet the 99",
    },
    {
      figure: familyShare !== null ? `${familyShare}%` : "—",
      headline: "Came to join family",
      detail: `Of ${fmtInt(allReasons)} arrivals over ${reasonYears.length} years, ${fmtInt(family)} came through family reunification — more than work and study together.`,
      href: "#reasons",
      cta: "Why they came",
    },
    {
      figure: over65.value === 0 ? "Nobody" : fmtInt(over65.value),
      headline: over65.value === 0 ? "Is over 65" : "Are over 65",
      detail:
        over65.value === 0
          ? `Not one of the ${fmtInt(passport.value)} is of retirement age${stay0to4.value !== null ? `, and ${fmtInt(stay0to4.value)} arrived within the last five years` : ""}. A young, recently-arrived group.`
          : `Out of ${fmtInt(passport.value)} passport holders${stay0to4.value !== null ? `, with ${fmtInt(stay0to4.value)} who arrived within the last five years` : ""}.`,
      href: "#portrait",
      cta: "See the portrait",
    },
  ];

  return (
    <section className="section findings-section" id="findings">
      <div className="wrap">
        <div className="findings-intro">
          <h2 className="findings-h">What the official numbers say</h2>
          <p>
            Four things worth knowing about Chileans in {cantonName(canton)} — then the data itself, which you can
            pull apart however you like. Where a figure was never published, this page says so rather than showing a
            blank.
          </p>
        </div>
        <div className="findings">
          {findings.map((f) => (
            <a className="finding" key={f.headline} href={f.href}>
              <span className="finding-figure mono">{f.figure}</span>
              <span className="finding-headline">{f.headline}</span>
              <span className="finding-detail">{f.detail}</span>
              <span className="finding-cta">
                {f.cta}
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
