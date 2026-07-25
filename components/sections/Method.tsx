"use client";
import { useDataset } from "@/lib/data-context";
import { CELL_STATE_DESCRIPTION, CELL_STATE_LABEL } from "@/lib/model";
import { StateSwatch } from "../StateBits";
import { fmtInt } from "@/lib/format";
import type { CellState } from "@/lib/types";

const STATES: CellState[] = ["observed", "structural_zero", "suppressed", "not_published"];

export function Method() {
  const { dataset } = useDataset();
  const counts = dataset?.manifest.cellStateCounts;
  const sources = dataset?.manifest.sources ?? [];

  return (
    <section className="section" id="method">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Method</span>
          <h2>Four states, two sources, one honest offset</h2>
          <p>
            At a population of 35, a blank usually means “never measured”, not “nobody here”. Every figure on this page
            says which of the two it is.
          </p>
        </div>

        <div className="method-states">
          {STATES.map((s) => (
            <div className="method-state panel" key={s}>
              <div className="method-state-head">
                <StateSwatch state={s} />
                <strong>{CELL_STATE_LABEL[s]}</strong>
                {counts && <span className="mono method-state-n">{fmtInt(counts[s])}</span>}
              </div>
              <p>{CELL_STATE_DESCRIPTION[s]}</p>
            </div>
          ))}
        </div>

        <div className="method-cols">
          <div>
            <h3 className="method-h3">The reference-date offset</h3>
            <p className="method-p">
              SEM Ausländerstatistik is an administrative count from the central migration register, published monthly;
              the latest here is <strong>31 May 2026</strong>. BFS STATPOP is the annual population register,
              published for year-end; the latest complete year is <strong>31 Dec 2024</strong>. The two are roughly
              seventeen months apart. Where both measure the same concept they will disagree slightly — that offset is
              recorded and never reconciled away. SEM answers “who holds which permit right now”; BFS answers “who was
              born where, as of last New Year’s Eve”.
            </p>
          </div>
          <div>
            <h3 className="method-h3">No synthesis</h3>
            <p className="method-p">
              Nothing here is interpolated, imputed, smoothed, or estimated. Time-series lines are drawn straight between
              observed points. Percentages always carry their denominator. Every figure is traceable — hover any number
              to see its source table or cube query, the sheet/row or dimension selection, the reference date, and the
              retrieval timestamp — and the full harvest is reproducible via <span className="mono">npm run harvest</span>.
            </p>
          </div>
        </div>

        <div className="sources-table panel">
          <div className="sources-head mono">Source inventory</div>
          <table className="src-tbl">
            <thead>
              <tr>
                <th>Source</th>
                <th>What it carries</th>
                <th className="num">Cells</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.id}</td>
                  <td>{s.title}</td>
                  <td className="num mono">{fmtInt(s.observationCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
