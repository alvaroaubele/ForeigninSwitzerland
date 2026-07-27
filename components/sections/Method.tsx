"use client";
import { useDataset } from "@/lib/data-context";
import { useI18n } from "@/lib/i18n";
import { CELL_STATE_DESCRIPTION, CELL_STATE_LABEL } from "@/lib/model";
import { StateSwatch } from "../StateBits";
import { fmtInt } from "@/lib/format";
import type { CellState } from "@/lib/types";

const STATES: CellState[] = ["observed", "structural_zero", "suppressed", "not_published"];

export function Method() {
  const { dataset } = useDataset();
  const { t } = useI18n();
  const counts = dataset?.manifest.cellStateCounts;
  const sources = dataset?.manifest.sources ?? [];

  return (
    <section className="section" id="method">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">{t.method.eyebrow}</span>
          <h2>{t.method.h}</h2>
          <p>
            {t.method.lead}
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
            <h3 className="method-h3">{t.method.offsetH}</h3>
            <p className="method-p">{t.method.offsetP}</p>
          </div>
          <div>
            <h3 className="method-h3">{t.method.synthH}</h3>
            <p className="method-p">
              {t.method.synthP1}
              <span className="mono">npm run harvest</span>
              {t.method.synthP2}
            </p>
          </div>
        </div>

        <div className="sources-table panel">
          <div className="sources-head mono">{t.method.sourcesH}</div>
          <table className="src-tbl">
            <thead>
              <tr>
                <th>{t.method.colSource}</th>
                <th>{t.method.colCarries}</th>
                <th className="num">{t.method.colCells}</th>
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
