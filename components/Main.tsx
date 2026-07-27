"use client";
import { useDataset } from "@/lib/data-context";
import { useI18n } from "@/lib/i18n";

/**
 * The page body, aware of canton switches.
 *
 * While a switch is in flight the previous canton's figures stay mounted and
 * dim slightly; an aria-live region says what is loading. This is the whole
 * mechanism that lets a reader click "Ticino" four thousand pixels below the
 * header and stay exactly where they are while the numbers change around them.
 */
export function Main({ children }: { children: React.ReactNode }) {
  const { switching, error } = useDataset();
  const { t } = useI18n();
  return (
    <main className={switching ? "is-switching" : ""}>
      <span className="visually-hidden" aria-live="polite">
        {switching ? t.main.loadingCanton : ""}
      </span>
      {error && (
        <div className="wrap">
          <p className="data-error" role="alert">
            {t.main.error(error)}
          </p>
        </div>
      )}
      {children}
    </main>
  );
}
