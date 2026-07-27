"use client";
import { useDataset } from "@/lib/data-context";
import { toCsv, toJson, download } from "@/lib/export";

export function Footer() {
  const { dataset } = useDataset();
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <div className="footer-title">Chileans in Switzerland</div>
            <p className="footer-note">
              An honest exploration of official statistics on a population of roughly 35 Chilean passport holders and 99
              Chilean-born residents in Switzerland, nationally and by canton. Built only from harvested open data; nothing is
              estimated.
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
            <div className="footer-h">Download everything</div>
            <div className="export-btns">
              <button
                onClick={() => dataset && download("chileans-zug-full-harvest.csv", toCsv(dataset.observations), "text/csv")}
              >
                Full harvest CSV
              </button>
              <button
                onClick={() => dataset && download("chileans-zug-full-harvest.json", toJson(dataset.observations), "application/json")}
              >
                Full harvest JSON
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
