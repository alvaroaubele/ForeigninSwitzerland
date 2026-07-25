"use client";
import { useEffect, useState } from "react";
import { useDataset } from "@/lib/data-context";
import { StateLegend } from "./StateBits";
import { fmtInt } from "@/lib/format";

const NAV = [
  { id: "passport-birthplace", label: "Contrast" },
  { id: "trend", label: "Trend" },
  { id: "cross-filter", label: "Cross-filter" },
  { id: "baselines", label: "Comparison" },
  { id: "availability", label: "Availability" },
  { id: "method", label: "Method" },
];

// Module-level so the observer effect below has a stable dependency; rebuilding
// this array each render would tear down and re-create the observer every time.
const NAV_IDS = NAV.map((s) => s.id);

export function Header() {
  const { dataset } = useDataset();
  const n = dataset?.observations.length ?? null;
  // The observed sections only exist once the dataset has rendered them, so the
  // observer has to be (re)built at that point — the header mounts well before.
  const active = useActiveSection(NAV_IDS, dataset !== null);

  return (
    <header className="site-header">
      <div className="wrap">
        <div className="header-top">
          <div className="header-mark">
            <span className="header-flag" aria-hidden />
            <span className="header-title">
              Chileans in Canton Zug
              <span className="header-sub">A data explorer for a very small population</span>
            </span>
          </div>
          <nav className="header-nav" aria-label="Sections">
            {NAV.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={active === s.id ? "is-active" : ""}
                aria-current={active === s.id ? "true" : undefined}
              >
                {s.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="header-legend">
          <StateLegend />
          <span className="header-count mono">
            {n !== null ? `${fmtInt(n)} harvested cells` : "loading…"}
          </span>
        </div>
      </div>
    </header>
  );
}

/** Reading line: just below the sticky header, where "the current section" begins. */
const SPY_LINE = 140;

/**
 * Which section the reader is currently in.
 *
 * The rule is "the last section whose top has passed under the header", which is
 * the only one that stays stable when sections differ wildly in height. An
 * IntersectionObserver keyed on intersectionRatio does not work here: ratio is
 * intersected area over *element* area, so a short section that happens to be
 * fully visible outranks the tall one actually filling the screen — the
 * cross-filter panel is several viewports long and would never win.
 *
 * Read on scroll and resize, throttled to one rAF so it costs a layout read per
 * frame at most.
 */
function useActiveSection(ids: string[], ready: boolean): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    let frame = 0;
    const read = () => {
      frame = 0;
      // Resolved every read rather than snapshotted once: sections appear at
      // different times (the cross-filter mounts a tick after the dataset lands,
      // once the explorer has initialised its filter from the URL), and a list
      // captured at effect time would permanently omit the late ones.
      let current: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (current === null) current = id; // first section that exists
        if (el.getBoundingClientRect().top - SPY_LINE <= 0) current = id;
      }
      // Past the end of the document the last section stays current, which is
      // what the footer region should show.
      if (current) setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ids, ready]);

  return active;
}
