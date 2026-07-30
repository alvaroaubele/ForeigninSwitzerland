"use client";
import { useDataset } from "@/lib/data-context";
import { resolveCell } from "@/lib/model";
import { bornHeadline, passportHeadline, passportSplit, latestSemMonth } from "@/lib/selectors";
import { useI18n } from "@/lib/i18n";
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
  const { dataset, nat, canton, loading } = useDataset();
  const { t, cName, natName, natWho } = useI18n();
  if (loading || !dataset) return null;

  const nName = natName(nat);
  const passport = passportHeadline(dataset, nat);
  const born = bornHeadline(dataset, nat, 2024);
  const split = passportSplit(dataset, nat, 2024);
  const sem = latestSemMonth(dataset);
  const swiss = split.find((r) => r.group === "Swiss")?.cell.value ?? null;

  // Reasons are a nine-year sum, so they have to be added up rather than looked
  // up. Computed here rather than asserted, because the balance that held for
  // Zug does not necessarily hold for Geneva or for Switzerland.
  const reasonYears = [
    ...new Set(
      dataset.observations
        // Calendar-year releases only — the rolling 12-month file would inflate
        // the year COUNT while contributing nothing to the sums below, so the
        // card would say "over 10 years" of a 9-year total.
        .filter((o) => o.dataset === "3-30" && o.dim.reason && o.provenance.referenceDate.endsWith("-12-31"))
        .map((o) => o.dim.year as number),
    ),
  ];
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
  // "More than work and study together" is checked, not asserted — it fails in
  // Zürich (dead heat) and several other cantons where study leads.
  const workStudy = reasonTotal("quota_employment") + reasonTotal("nonquota_employment") + reasonTotal("education");
  const familyLeads = family > workStudy;

  const stay0to4 = resolveCell(dataset, {
    source: "SEM",
    metric: "stock",
    populationType: "permanent",
    dim: { nationality: nat, year: sem.year, month: sem.month, sex: "total", lengthOfStay: "0-4" },
  });
  const over65 = resolveCell(dataset, {
    source: "SEM",
    metric: "stock",
    populationType: "permanent",
    dim: { nationality: nat, year: sem.year, month: sem.month, sex: "total", ageClass: "65+" },
  });

  // The two birthplace cards only exist for real countries: the grouped
  // populations (_ALL, EU/EFTA, …) have no birth-country series in cube 399.
  const birthCards: Finding[] = nat.startsWith("_")
    ? []
    : [
        {
          figure: `${fmtInt(passport.value)} vs ${fmtInt(born.value)}`,
          headline: t.findings.twoCountsH,
          detail: t.findings.twoCountsD(nName, fmtInt(passport.value), fmtInt(born.value)),
          href: "#passport-birthplace",
          cta: t.findings.twoCountsCta,
        },
        {
          figure: swiss !== null ? fmtInt(swiss) : "—",
          headline: t.findings.becameSwissH,
          detail: t.findings.becameSwissD(nName, fmtInt(born.value), fmtInt(swiss)),
          href: "#portrait",
          cta: t.findings.becameSwissCta(fmtInt(born.value)),
        },
      ];
  const findings: Finding[] = [
    ...birthCards,
    ...(allReasons > 0
      ? [
          {
            figure: familyShare !== null ? `${familyShare}%` : "—",
            headline: t.findings.familyH,
            detail: t.findings.familyD(fmtInt(allReasons), reasonYears.length, fmtInt(family), familyLeads),
            href: "#reasons",
            cta: t.findings.familyCta,
          },
        ]
      : []),
    {
      figure: over65.value === 0 ? t.findings.nobody : fmtInt(over65.value),
      headline: over65.value === 0 ? t.findings.over65H0 : t.findings.over65H,
      detail:
        over65.value === 0
          ? t.findings.over65D0(fmtInt(passport.value), stay0to4.value !== null ? fmtInt(stay0to4.value) : null)
          : t.findings.over65D(fmtInt(passport.value), stay0to4.value !== null ? fmtInt(stay0to4.value) : null),
      href: "#portrait",
      cta: t.findings.over65Cta,
    },
  ];

  return (
    <section className="section findings-section" id="findings">
      <div className="wrap">
        <div className="findings-intro">
          <h2 className="findings-h">{t.findings.h}</h2>
          <p>{t.findings.intro(natWho(nat), cName(canton))}</p>
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
