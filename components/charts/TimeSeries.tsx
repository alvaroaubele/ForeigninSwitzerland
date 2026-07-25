"use client";
import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { scaleLinear } from "d3-scale";
import type { CellState } from "@/lib/types";
import { StateMark, SvgDefs } from "../StateBits";
import { fmtInt } from "@/lib/format";

export interface SeriesDatum {
  /** Position on the year axis; fractional for monthly points (2023-04 = 2023.25). */
  year: number;
  value: number | null;
  state: CellState;
  /** optional source + reference date for the on-hover tooltip */
  refDate?: string;
  source?: string;
  /** Printed period name, used instead of the raw axis position when set. */
  label?: string;
}

export interface Series {
  id: string;
  label: string;
  data: SeriesDatum[];
  color: string;
  /** dashed line distinguishes e.g. BFS register from SEM administrative counts */
  dashed?: boolean;
}

export interface Annotation {
  year: number;
  text: string;
}

const W = 760;
const H = 340;
const M = { top: 24, right: 20, bottom: 40, left: 40 };

export function TimeSeries({
  series,
  annotations = [],
  yMax,
  height = H,
}: {
  series: Series[];
  annotations?: Annotation[];
  yMax?: number;
  height?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  /** Year under the cursor or keyboard caret; null when the chart is at rest. */
  const [active, setActive] = useState<number | null>(null);

  const allYears = Array.from(new Set(series.flatMap((s) => s.data.map((d) => d.year)))).sort((a, b) => a - b);
  if (allYears.length === 0) return null;
  const minYear = allYears[0];
  const maxYear = allYears[allYears.length - 1];
  const maxVal =
    yMax ??
    Math.max(
      1,
      ...series.flatMap((s) => s.data.map((d) => d.value ?? 0)),
    );
  const niceMax = niceCeil(maxVal);

  const x = scaleLinear().domain([minYear, maxYear]).range([M.left, W - M.right]);
  const y = scaleLinear().domain([0, niceMax]).range([height - M.bottom, M.top]);

  const yTicks = integerTicks(niceMax, 5);
  const xTicks = yearTicks(minYear, maxYear);

  /** Snap a viewBox x-coordinate to the nearest year that actually has data. */
  const yearAt = (vx: number): number => {
    const raw = x.invert(vx);
    return allYears.reduce((best, yr) => (Math.abs(yr - raw) < Math.abs(best - raw) ? yr : best), allYears[0]);
  };

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    // The SVG scales to its container, so client pixels must be mapped back
    // into viewBox units before the scale can invert them.
    setActive(yearAt(((e.clientX - rect.left) * W) / rect.width));
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = active === null ? allYears.length - 1 : allYears.indexOf(active);
    const next = Math.min(allYears.length - 1, Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1)));
    setActive(allYears[next]);
  };

  const readout =
    active === null
      ? null
      : series
          .map((s) => ({ s, d: s.data.find((p) => p.year === active) }))
          .filter((r): r is { s: Series; d: SeriesDatum } => !!r.d);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      role="img"
      tabIndex={0}
      aria-label={
        active === null
          ? `Time series ${minYear} to ${maxYear}. Focus and use arrow keys to read each year.`
          : `${readout?.find((r) => r.d.label)?.d.label ?? formatAxisYear(active)}: ` +
            (readout ?? [])
              .map((r) => `${r.s.label} ${r.d.value === null ? "no figure" : r.d.value}`)
              .join("; ")
      }
      style={{ display: "block", outlineOffset: -2 }}
      onMouseMove={onMove}
      onMouseLeave={() => setActive(null)}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
    >
      <SvgDefs />
      {/* y grid + labels */}
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
          <text x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="mono" fontSize={11} fill="var(--fg-subtle)">
            {t}
          </text>
        </g>
      ))}
      {/* x labels */}
      {xTicks.map((t) => (
        <text key={t} x={x(t)} y={height - M.bottom + 18} textAnchor="middle" className="mono" fontSize={11} fill="var(--fg-subtle)">
          {`’${String(t).slice(2)}`}
        </text>
      ))}
      {/* annotations */}
      {annotations.map((a) => (
        <line key={a.year} x1={x(a.year)} x2={x(a.year)} y1={M.top} y2={height - M.bottom} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="2 3" />
      ))}
      {annotations.map((a) => (
        <text key={a.year + a.text} x={x(a.year)} y={M.top - 8} textAnchor="middle" fontSize={10.5} fill="var(--fg-muted)" fontFamily="var(--font-sans-stack)">
          {a.text}
        </text>
      ))}
      {/* series lines (straight segments only across observed/zero points) */}
      {series.map((s) => (
        <g key={s.id}>
          {segments(s.data).map((seg, i) => (
            <polyline
              key={i}
              points={seg.map((d) => `${x(d.year)},${y(d.value ?? 0)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={1.8}
              strokeDasharray={s.dashed ? "5 3" : undefined}
              strokeLinejoin="round"
            />
          ))}
          {s.data.map((d) => (
            <StateMark
              key={d.year}
              state={d.state}
              x={x(d.year)}
              y={y(d.value ?? 0)}
              r={3.6}
              color={s.color}
              title={`${s.label} · ${d.year}: ${d.value === null ? "—" : fmtInt(d.value)} (${d.state.replace("_", " ")})${d.refDate ? ` · ${d.source ?? ""} ref ${d.refDate}` : ""}`}
            />
          ))}
        </g>
      ))}
      {/* axes baselines */}
      <line x1={M.left} x2={W - M.right} y1={height - M.bottom} y2={height - M.bottom} stroke="var(--border-strong)" strokeWidth={1} />

      {/* crosshair — reading both series at one year is the whole offset story */}
      {active !== null && readout && readout.length > 0 && (
        <g pointerEvents="none">
          <line
            x1={x(active)}
            x2={x(active)}
            y1={M.top}
            y2={height - M.bottom}
            stroke="var(--fg)"
            strokeWidth={1}
            opacity={0.35}
          />
          {readout.map((r) => (
            <circle
              key={r.s.id}
              cx={x(active)}
              cy={y(r.d.value ?? 0)}
              r={6}
              fill="none"
              stroke={r.s.color}
              strokeWidth={1.4}
              opacity={0.9}
            />
          ))}
          <Tooltip x={x(active)} year={active} rows={readout} height={height} />
        </g>
      )}
    </svg>
  );
}

/** Crosshair readout. Flips to the left of the caret when it would overflow. */
function Tooltip({
  x: cx,
  year,
  rows,
  height,
}: {
  x: number;
  year: number;
  rows: { s: Series; d: SeriesDatum }[];
  height: number;
}) {
  // Wide enough for the full source labels — "BFS STATPOP (register, 31 Dec)"
  // truncated to "BFS STATPOP (regist…" loses exactly the part that says which
  // register and as of when, which is the distinction the chart is making.
  const w = 258;
  const lh = 15;
  const h = 20 + rows.length * lh;
  const flip = cx + w + 12 > W - M.right;
  const bx = flip ? cx - w - 10 : cx + 10;
  const by = Math.min(M.top + 4, height - M.bottom - h);
  return (
    <g transform={`translate(${bx},${by})`}>
      <rect width={w} height={h} rx={3} fill="var(--bg)" stroke="var(--border-strong)" opacity={0.98} />
      <text x={9} y={14} fontSize={11} className="mono" fill="var(--fg-subtle)">
        {/* A fractional axis position is meaningless to read; prefer the
            period's own name where a point carries one. */}
        {rows.find((r) => r.d.label)?.d.label ?? formatAxisYear(year)}
      </text>
      {rows.map((r, i) => (
        <g key={r.s.id} transform={`translate(9,${24 + i * lh})`}>
          <circle cx={3} cy={-3} r={3} fill={r.s.color} />
          <text x={12} y={0} fontSize={11} fill="var(--fg-muted)" fontFamily="var(--font-sans-stack)">
            {r.s.label.length > 32 ? r.s.label.slice(0, 31) + "…" : r.s.label}
          </text>
          <text x={w - 18} y={0} fontSize={11} textAnchor="end" className="mono" fill="var(--fg)">
            {r.d.state === "not_published" ? "—" : fmtInt(r.d.value)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Break a series into contiguous segments across drawable points (skip not_published gaps). */
function segments(data: SeriesDatum[]): SeriesDatum[][] {
  const out: SeriesDatum[][] = [];
  let cur: SeriesDatum[] = [];
  for (const d of data) {
    const drawable = d.state !== "not_published" && d.state !== "suppressed" && d.value !== null;
    if (drawable) {
      cur.push(d);
    } else {
      if (cur.length) out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Whole years print bare; a fractional position falls back to its month. */
function formatAxisYear(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const y = Math.floor(v);
  const m = Math.round((v - y) * 12) + 1;
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}

function niceCeil(v: number): number {
  if (v <= 5) return 5;
  if (v <= 10) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / mag) * mag;
}
function integerTicks(max: number, count: number): number[] {
  const step = Math.max(1, Math.ceil(max / count));
  const ticks: number[] = [];
  for (let t = 0; t <= max + 0.001; t += step) ticks.push(t);
  return ticks;
}
function yearTicks(min: number, max: number): number[] {
  // Axis positions may be fractional (monthly points), but the ruler should
  // still be whole years — a tick reading "2023.25" labels nothing.
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  const ticks: number[] = [];
  const step = hi - lo > 10 ? 2 : 1;
  for (let t = lo; t <= hi; t += step) ticks.push(t);
  if (ticks.length && ticks[ticks.length - 1] !== hi) ticks.push(hi);
  return ticks;
}

export function SeriesLegend({ series }: { series: Series[] }) {
  return (
    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 6 }}>
      {series.map((s) => (
        <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--fg-muted)" }}>
          <svg width="26" height="10" aria-hidden>
            <line x1="0" y1="5" x2="26" y2="5" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "5 3" : undefined} />
            <circle cx="13" cy="5" r="3" fill={s.color} />
          </svg>
          {s.label}
        </span>
      ))}
    </div>
  );
}

export function valueTitle(d: SeriesDatum): string {
  return d.value === null ? "—" : fmtInt(d.value);
}
