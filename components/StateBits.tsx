"use client";
import type { CellState } from "@/lib/types";
import { CELL_STATE_DESCRIPTION, CELL_STATE_LABEL } from "@/lib/model";
import { STATE_CLASS } from "@/lib/format";

/** Small inline swatch used in chips, tables, and legends. */
export function StateSwatch({ state }: { state: CellState }) {
  return <span className={`state-swatch ${STATE_CLASS[state]}`} aria-hidden />;
}

export function StateChip({ state }: { state: CellState }) {
  return (
    <span className="state-chip" title={CELL_STATE_DESCRIPTION[state]}>
      <StateSwatch state={state} />
      {CELL_STATE_LABEL[state]}
    </span>
  );
}

const ORDER: CellState[] = ["observed", "structural_zero", "suppressed", "not_published"];

export function StateLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{ display: "flex", gap: compact ? 14 : 22, flexWrap: "wrap", alignItems: "center" }}>
      {ORDER.map((s) => (
        <span key={s} className="state-chip" title={CELL_STATE_DESCRIPTION[s]}>
          <StateSwatch state={s} />
          {CELL_STATE_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

/**
 * SVG marker for a data point, encoding cell state with fill + shape so it is
 * legible in greyscale and to colour-blind readers:
 *  observed        → filled disc
 *  structural_zero → open ring (a real 0)
 *  suppressed      → hatched square (exists, withheld)
 *  not_published   → dotted ring (never measured)
 */
export function StateMark({
  state,
  x,
  y,
  r = 4,
  color,
}: {
  state: CellState;
  x: number;
  y: number;
  r?: number;
  color?: string;
}) {
  const c = color ?? "var(--state-observed)";
  if (state === "observed") {
    return <circle cx={x} cy={y} r={r} fill={c} />;
  }
  if (state === "structural_zero") {
    return <circle cx={x} cy={y} r={r} fill="var(--bg)" stroke="var(--state-zero)" strokeWidth={1.6} />;
  }
  if (state === "suppressed") {
    return (
      <rect
        x={x - r}
        y={y - r}
        width={r * 2}
        height={r * 2}
        fill="url(#hatch-suppressed)"
        stroke="var(--state-suppressed)"
        strokeWidth={1}
      />
    );
  }
  return <circle cx={x} cy={y} r={r} fill="var(--bg)" stroke="var(--state-missing)" strokeWidth={1.4} strokeDasharray="1.5 1.5" />;
}

/** Shared SVG <defs> (hatch pattern) — include once per SVG that uses StateMark. */
export function SvgDefs() {
  return (
    <defs>
      <pattern id="hatch-suppressed" width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <rect width="4" height="4" fill="var(--state-suppressed-wash)" />
        <line x1="0" y1="0" x2="0" y2="4" stroke="var(--state-suppressed)" strokeWidth="1.4" />
      </pattern>
    </defs>
  );
}
