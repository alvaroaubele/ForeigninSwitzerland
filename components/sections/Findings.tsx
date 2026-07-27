"use client";
import { useDataset } from "@/lib/data-context";
import { resolveCell } from "@/lib/model";
import { bornHeadline, passportHeadline, passportSplit, latestSemMonth } from "@/lib/selectors";
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
  const { dataset, loading } = useDataset();
  if (loading || !dataset) return null;

  const passport = passportHeadline(dataset);
  const born = bornHeadline(dataset, 2024);
  const split = passportSplit(dataset, 2024);
  const sem = latestSemMonth(dataset);
  const latAm = split.find((r) => r.group === "Latin America & Caribbean")?.cell.value ?? null;
  const swiss = split.find((r) => r.group === "Swiss")?.cell.value ?? null;

  const stay0to4 = resolveCell(dataset, {
    source: "SEM",
    metric: "stock",
    populationType: "permanent",
    dim: { canton: "ZG", nationality: "CL", year: sem.year, month: sem.month, sex: "total", lengthOfStay: "0-4" },
  });
  const over65 = resolveCell(dataset, {
    source: "SEM",
    metric: "stock",
    populationType: "permanent",
    dim: { canton: "ZG", nationality: "CL", year: sem.year, month: sem.month, sex: "total", ageClass: "65+" },
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
      figure: "2 in 3",
      headline: "Came to join family",
      detail: "Family reunification is the single largest reason for arrival over nine years — ahead of work and study combined.",
      href: "#reasons",
      cta: "Why they came",
    },
    {
      figure: over65.value === 0 ? "Nobody" : fmtInt(over65.value),
      headline: "Is over 65",
      detail:
        stay0to4.value !== null
          ? `And ${fmtInt(stay0to4.value)} of the ${fmtInt(passport.value)} arrived within the last five years. This is a young, recently-arrived group.`
          : "This is a young population with almost no retirement-age cohort.",
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
            Four things worth knowing about Chileans in Canton Zug — then the data itself, which you can pull apart
            however you like. Where a figure was never published, this page says so rather than showing a blank.
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
