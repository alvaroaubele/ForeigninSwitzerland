"use client";
import { useDataset } from "@/lib/data-context";
import { cantonName } from "@/lib/selectors";
import { toCsv, toJson, download } from "@/lib/export";

export function Footer() {
  const { dataset, canton } = useDataset();
  const stem = `chileans-${canton.toLowerCase()}-harvest`;
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <div className="footer-title">Chileans in Switzerland</div>
            <p className="footer-note">
              An honest exploration of official statistics on Chilean nationals and Chilean-born residents of
              Switzerland, nationally and canton by canton. Built only from harvested open data; nothing is estimated.
            </p>
          </div>
          <div>
            <div className="footer-h">Sources</div>
            <ul className="footer-links">
              <li>
                <a href="https://www.sem.admin.ch/sem/de/home/publiservice/statistik/auslaenderstatistik.html" target="_blank" rel="noreferrer">
                  SEM Ausländerstatistik ↗
                </a>
              </li>
              <li>
                <a href="https://www.pxweb.bfs.admin.ch/" target="_blank" rel="noreferrer">
                  BFS STATPOP (PxWeb) ↗
                </a>
              </li>
            </ul>
          </div>
          <div>
            {/* Honest label: this serialises the canton in view, not all 27 files. */}
            <div className="footer-h">Download {cantonName(canton)}</div>
            <div className="export-btns">
              <button onClick={() => dataset && download(`${stem}.csv`, toCsv(dataset.observations), "text/csv")}>
                Every cell, CSV
              </button>
              <button onClick={() => dataset && download(`${stem}.json`, toJson(dataset.observations), "application/json")}>
                Every cell, JSON
              </button>
            </div>
          </div>
        </div>
        <div className="footer-bottom mono">
          SEM 31 May 2026 · BFS STATPOP 31 Dec 2024 · reference dates preserved, never reconciled
        </div>
      </div>
    </footer>
  );
}
