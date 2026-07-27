"use client";
import { useEffect, useRef, useState } from "react";
import { AvailabilityMatrix } from "./AvailabilityMatrix";
import { Method } from "./Method";

/**
 * Everything about how the figures were made, folded away.
 *
 * The four-state model, the reference-date offset, the source inventory and the
 * availability grid are what make the rest of the page trustworthy, but they are
 * not what a reader came for. They live here, closed, and open on demand — or
 * automatically when something links into them, so a "never published" pointer
 * elsewhere on the page still lands somewhere visible.
 */
export function Appendix() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const openIfTargeted = () => {
      const h = window.location.hash.replace("#", "");
      if (h && ["appendix", "method", "availability"].includes(h)) {
        setOpen(true);
        // Let the section render before scrolling to it, otherwise the browser
        // measures a collapsed element and lands in the wrong place.
        requestAnimationFrame(() => document.getElementById(h)?.scrollIntoView({ block: "start" }));
      }
    };
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    return () => window.removeEventListener("hashchange", openIfTargeted);
  }, []);

  return (
    <section className="section appendix-section" id="appendix">
      <div className="wrap">
        <details ref={ref} className="appendix" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary className="appendix-summary">
            <span className="appendix-summary-text">
              <span className="eyebrow">Method &amp; coverage</span>
              <span className="appendix-title">How these figures were made, and what they cannot say</span>
              <span className="appendix-sub">
                The four states, the reference-date offset between the two registers, which cross-tabulations exist,
                and the full source inventory.
              </span>
            </span>
            <span className="appendix-chevron" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </summary>
          <div className="appendix-body">
            <Method />
            <AvailabilityMatrix />
          </div>
        </details>
      </div>
    </section>
  );
}
