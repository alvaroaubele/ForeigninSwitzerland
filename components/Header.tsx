"use client";
import { useDataset } from "@/lib/data-context";
import { StateLegend } from "./StateBits";
import { fmtInt } from "@/lib/format";

export function Header() {
  const { dataset } = useDataset();
  const n = dataset?.observations.length ?? null;
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
          <nav className="header-nav">
            <a href="#passport-birthplace">Contrast</a>
            <a href="#trend">Trend</a>
            <a href="#cross-filter">Cross-filter</a>
            <a href="#baselines">Comparison</a>
            <a href="#availability">Availability</a>
            <a href="#method">Method</a>
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
