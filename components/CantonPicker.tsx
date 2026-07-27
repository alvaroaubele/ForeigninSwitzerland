"use client";
import { useEffect, useRef, useState } from "react";
import { useDataset, SWITZERLAND } from "@/lib/data-context";
import { cantonName } from "@/lib/selectors";

/**
 * Which geography the whole page is describing.
 *
 * This is the one control that changes every figure on the page, so it sits in
 * the header rather than inside a section, and it reads as a place name rather
 * than a filter. Switzerland is the default and stays first in the list; the
 * cantons follow alphabetically by name, not by code, because a reader looking
 * for Geneva does not know it sorts under G-E.
 */
export function CantonPicker() {
  const { canton, cantons, setCanton, switching } = useDataset();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const codes = cantons.map((c) => c.code);
  const ordered = [
    SWITZERLAND,
    ...codes.filter((c) => c !== SWITZERLAND).sort((a, b) => cantonName(a).localeCompare(cantonName(b))),
  ].filter((c, i, arr) => arr.indexOf(c) === i);

  return (
    <div className={`canton-picker ${switching ? "is-switching" : ""}`} ref={ref}>
      {canton !== SWITZERLAND && (
        <button
          type="button"
          className="canton-reset"
          onClick={() => setCanton(SWITZERLAND)}
          title="Back to the national view"
        >
          ← Switzerland
        </button>
      )}
      <button
        type="button"
        className="canton-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="canton-trigger-label">Showing</span>
        <span className="canton-trigger-name">{cantonName(canton)}</span>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M4 6.5 8 10.5 12 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="canton-menu" role="listbox" aria-label="Canton">
          {ordered.map((code) => (
            <button
              key={code}
              role="option"
              aria-selected={code === canton}
              className={`canton-option ${code === canton ? "is-on" : ""} ${code === SWITZERLAND ? "is-national" : ""}`}
              onClick={() => {
                setCanton(code);
                setOpen(false);
              }}
            >
              <span>{cantonName(code)}</span>
              <span className="canton-option-code mono">{code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
