"use client";
import { useDataset } from "@/lib/data-context";

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
  return (
    <main className={switching ? "is-switching" : ""}>
      <span className="visually-hidden" aria-live="polite">
        {switching ? "Loading canton data…" : ""}
      </span>
      {error && (
        <div className="wrap">
          <p className="data-error" role="alert">
            Something failed to load: {error}. The figures shown may be for the previously selected canton — reloading
            the page usually fixes it.
          </p>
        </div>
      )}
      {children}
    </main>
  );
}
