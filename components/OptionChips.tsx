"use client";
import { useRef, type KeyboardEvent } from "react";
import type { CellState } from "@/lib/types";
import { STATE_CLASS } from "@/lib/format";
import { CELL_STATE_LABEL } from "@/lib/model";
import { useI18n } from "@/lib/i18n";
import { fmtInt } from "@/lib/format";

export interface ChipOption {
  /** "" means "Any" — the dimension left unconstrained. */
  value: string;
  label: string;
  /** The state this cell would resolve to if this option were chosen. */
  state: CellState;
  /** The figure it would resolve to, when there is one. */
  result: number | null;
}

/**
 * A single-select group of options that shows, on each option, what choosing it
 * would actually yield.
 *
 * This is the cross-filter's whole argument moved into the control. A plain
 * <select> offers every value with equal confidence and only reveals afterwards
 * that a combination was never published — which trains people to read an empty
 * result as "no such people" rather than "no such figure". Here the outcome is
 * on the option before it is chosen, so the shape of what is knowable is visible
 * while you are deciding rather than after.
 *
 * Never-published options stay selectable. Disabling them would hide exactly the
 * finding this project exists to report; they are de-emphasised, not removed.
 *
 * Keyboard: an ARIA radiogroup with roving tabindex — one tab stop for the whole
 * group, arrows move and select within it, Home/End jump to the ends.
 */
export function OptionChips({
  name,
  options,
  value,
  onChange,
  onPreview,
}: {
  name: string;
  options: ChipOption[];
  value: string;
  onChange: (v: string) => void;
  /** Fired on hover/focus with the option being considered, null on leave. */
  onPreview?: (o: ChipOption | null) => void;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  const move = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length;
    onChange(options[next].value);
    onPreview?.(options[next]);
    const btns = groupRef.current?.querySelectorAll<HTMLButtonElement>("[role='radio']");
    btns?.[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        move(i, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        move(i, -1);
        break;
      case "Home":
        e.preventDefault();
        move(-1, 1);
        break;
      case "End":
        e.preventDefault();
        move(0, -1);
        break;
    }
  };

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    <div
      className="chips"
      role="radiogroup"
      aria-label={name}
      ref={groupRef}
      onMouseLeave={() => onPreview?.(null)}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value || "__any"}
            type="button"
            role="radio"
            aria-checked={on}
            // Roving tabindex: the group is a single tab stop, arrows move inside it.
            tabIndex={i === selectedIndex ? 0 : -1}
            className={`chip ${on ? "is-on" : ""} ${STATE_CLASS[o.state]} ${
              o.state === "not_published" ? "is-unpublished" : ""
            }`}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            onMouseEnter={() => onPreview?.(o)}
            onFocus={() => onPreview?.(o)}
            title={
              o.state === "not_published" ? t.xf.chipNever(o.label) : t.xf.chipOutcome(o.label, fmtInt(o.result), CELL_STATE_LABEL[o.state].toLowerCase())
            }
          >
            <span className={`chip-dot ${STATE_CLASS[o.state]}`} aria-hidden />
            <span className="chip-label">{o.label}</span>
            <span className="chip-val mono" aria-hidden>
              {o.state === "not_published" ? "—" : fmtInt(o.result)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

