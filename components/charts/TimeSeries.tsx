"use client";
import { scaleLinear } from "d3-scale";
import type { CellState } from "@/lib/types";
import { StateMark, SvgDefs } from "../StateBits";
import { fmtInt } from "@/lib/format";

export interface SeriesDatum {
  year: number;
  value: number | null;
  state: CellState;
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

  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" style={{ display: "block" }}>
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
            <StateMark key={d.year} state={d.state} x={x(d.year)} y={y(d.value ?? 0)} r={3.6} color={s.color} />
          ))}
        </g>
      ))}
      {/* axes baselines */}
      <line x1={M.left} x2={W - M.right} y1={height - M.bottom} y2={height - M.bottom} stroke="var(--border-strong)" strokeWidth={1} />
    </svg>
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
  const ticks: number[] = [];
  const step = max - min > 10 ? 2 : 1;
  for (let t = min; t <= max; t += step) ticks.push(t);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
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
