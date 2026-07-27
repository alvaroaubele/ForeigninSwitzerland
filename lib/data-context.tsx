"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Manifest, Observation } from "./types";
import type { Dataset } from "./model";
import { decodeCanton, type CantonPayload } from "./payload";

export const SWITZERLAND = "CH";

export interface CantonEntry {
  code: string;
  observations: number;
  bytes: number;
}

interface DataState {
  dataset: Dataset | null;
  /** Cantonal comparison figures for every canton at once. */
  summary: Observation[] | null;
  manifest: Manifest | null;
  canton: string;
  cantons: CantonEntry[];
  setCanton: (code: string) => void;
  loading: boolean;
  /** True while a canton switch is in flight and the previous data is still shown. */
  switching: boolean;
  error: string | null;
}

const DataContext = createContext<DataState>({
  dataset: null,
  summary: null,
  manifest: null,
  canton: SWITZERLAND,
  cantons: [],
  setCanton: () => {},
  loading: true,
  switching: false,
  error: null,
});

/**
 * Loads the harvest one canton at a time.
 *
 * Switzerland is the default view and the only observation file fetched on first
 * paint. Selecting a canton fetches that canton's file and keeps it, so
 * returning to one already seen is instant. Everything loaded stays for the life
 * of the page — each canton is a few hundred kB decoded, and nobody visits
 * enough of them for that to become a problem.
 *
 * The previous dataset stays on screen while the next one loads, so switching
 * canton dims the figures rather than blanking the page.
 */
export function DataProvider({ children }: { children: React.ReactNode }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [cantons, setCantons] = useState<CantonEntry[]>([]);
  const [summary, setSummary] = useState<Observation[] | null>(null);
  const [canton, setCantonState] = useState<string>(SWITZERLAND);
  const [cache, setCache] = useState<Record<string, Observation[]>>({});
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manifest and the cross-canton comparison figures: fetched once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mRes, sRes] = await Promise.all([fetch("/data/manifest.json"), fetch("/data/summary.json")]);
        if (!mRes.ok) throw new Error("Failed to load the manifest");
        const m = (await mRes.json()) as Manifest & { cantons?: CantonEntry[] };
        if (cancelled) return;
        setManifest(m);
        setCantons(m.cantons ?? []);
        if (sRes.ok) {
          const payload = (await sRes.json()) as CantonPayload;
          if (!cancelled) setSummary(decodeCanton(payload));
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Whichever canton is selected, fetched once and remembered.
  useEffect(() => {
    if (cache[canton]) return;
    let cancelled = false;
    setSwitching(true);
    (async () => {
      try {
        const res = await fetch(`/data/canton/${canton}.json`);
        if (!res.ok) throw new Error(`No data file for ${canton}`);
        const payload = (await res.json()) as CantonPayload;
        const decoded = decodeCanton(payload);
        if (!cancelled) setCache((c) => ({ ...c, [canton]: decoded }));
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setSwitching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canton, cache]);

  const setCanton = useCallback((code: string) => setCantonState(code), []);

  const observations = cache[canton];
  const dataset = useMemo<Dataset | null>(
    () => (observations && manifest ? { observations, manifest } : null),
    [observations, manifest],
  );

  const value = useMemo<DataState>(
    () => ({
      dataset,
      summary,
      manifest,
      canton,
      cantons,
      setCanton,
      loading: dataset === null && error === null,
      switching,
      error,
    }),
    [dataset, summary, manifest, canton, cantons, setCanton, switching, error],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useDataset(): DataState {
  return useContext(DataContext);
}
