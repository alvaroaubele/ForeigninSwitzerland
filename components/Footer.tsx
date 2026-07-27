"use client";
import { useDataset } from "@/lib/data-context";
import { useI18n } from "@/lib/i18n";
import { toCsv, toJson, download } from "@/lib/export";

export function Footer() {
  const { dataset, canton } = useDataset();
  const { t, cName } = useI18n();
  const stem = `chileans-${canton.toLowerCase()}-harvest`;
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <div className="footer-title">{t.header.title}</div>
            <p className="footer-note">
              {t.footer.note}
            </p>
          </div>
          <div>
            <div className="footer-h">{t.footer.sources}</div>
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
            <div className="footer-h">{t.footer.download(cName(canton))}</div>
            <div className="export-btns">
              <button onClick={() => dataset && download(`${stem}.csv`, toCsv(dataset.observations), "text/csv")}>
                {t.footer.csv}
              </button>
              <button onClick={() => dataset && download(`${stem}.json`, toJson(dataset.observations), "application/json")}>
                {t.footer.json}
              </button>
            </div>
          </div>
        </div>
        <div className="footer-bottom mono">
          {t.footer.bottom}
        </div>
      </div>
    </footer>
  );
}
