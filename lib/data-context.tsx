"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Manifest, Observation } from "./types";
import type { Dataset } from "./model";
import { decodeCanton, type CantonPayload } from "./payload";

export const SWITZERLAND = "CH";
/** The default nationality scope: every foreign national, as published (SEM Gesamttotal). */
export const ALL_FOREIGN = "_ALL";

export interface NatIndexEntry {
  code: string;
  de: string;
  observations: number;
  bytes: number;
  semTotal: number | null;
  bfsTotal: number | null;
  hasSem: boolean;
  hasBfs: boolean;
}

interface DataState {
  dataset: Dataset | null;
  /** Cantonal comparison figures for the selected nationality, every canton at once. */
  summary: Observation[] | null;
  manifest: Manifest | null;
  /** All nationalities with data, for the picker and the ranking. */
  natIndex: NatIndexEntry[];
  nat: string;
  setNat: (code: string) => void;
  canton: string;
  setCanton: (code: string) => void;
  loading: boolean;
  /** True while a scope switch is in flight and the previous data is still shown. */
  switching: boolean;
  error: string | null;
}

const DataContext = createContext<DataState>({
  dataset: null,
  summary: null,
  manifest: null,
  natIndex: [],
  nat: ALL_FOREIGN,
  setNat: () => {},
  canton: SWITZERLAND,
  setCanton: () => {},
  loading: true,
  switching: false,
  error: null,
});

/**
 * Loads the harvest one (nationality, canton) slice at a time.
 *
 * The default view is every foreign national in Switzerland; picking a
 * nationality or a canton fetches that slice's file and keeps it, so returning
 * to one already seen is instant. The previous dataset stays on screen while
 * the next one loads — switching dims the figures rather than blanking the
 * page and losing the reader's scroll position.
 */
export function DataProvider({ children }: { children: React.ReactNode }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [natIndex, setNatIndex] = useState<NatIndexEntry[]>([]);
  const [nat, setNatState] = useState<string>(ALL_FOREIGN);
  const [canton, setCantonState] = useState<string>(SWITZERLAND);
  const [cache, setCache] = useState<Record<string, Observation[]>>({});
  const [summaryCache, setSummaryCache] = useState<Record<string, Observation[]>>({});
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manifest and the nationality index: fetched once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mRes, iRes] = await Promise.all([fetch("/data/manifest.json"), fetch("/data/index.json")]);
        if (!mRes.ok) throw new Error("Failed to load the manifest");
        const m = (await mRes.json()) as Manifest;
        if (cancelled) return;
        setManifest(m);
        if (iRes.ok) {
          const idx = (await iRes.json()) as { nationalities: NatIndexEntry[] };
          if (!cancelled) setNatIndex(idx.nationalities);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Whichever (nationality, canton) is selected, fetched once and remembered.
  const sliceKey = `${nat}/${canton}`;
  useEffect(() => {
    if (cache[sliceKey]) return;
    let cancelled = false;
    setSwitching(true);
    (async () => {
      try {
        const res = await fetch(`/data/nat/${nat}/${canton}.json`);
        if (!res.ok) throw new Error(`No data file for ${nat}/${canton}`);
        const payload = (await res.json()) as CantonPayload;
        const decoded = decodeCanton(payload);
        if (!cancelled) setCache((c) => ({ ...c, [sliceKey]: decoded }));
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setSwitching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nat, canton, sliceKey, cache]);

  // Per-nationality comparison summary, fetched once per nationality.
  useEffect(() => {
    if (summaryCache[nat]) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/data/nat/${nat}/summary.json`);
        if (!res.ok) return;
        const payload = (await res.json()) as CantonPayload;
        if (!cancelled) setSummaryCache((c) => ({ ...c, [nat]: decodeCanton(payload) }));
      } catch {
        /* summary is an enhancement; the section shows its own empty state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nat, summaryCache]);

  const writeUrl = useCallback((key: string, value: string | null) => {
    // The scope is part of the address: a shared link must reopen on the same
    // nationality and canton, or the same question silently answers with
    // different numbers.
    try {
      const url = new URL(window.location.href);
      if (value === null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* server rendering: the URL just does not update */
    }
  }, []);

  const setCanton = useCallback(
    (code: string) => {
      setCantonState(code);
      writeUrl("kt", code === SWITZERLAND ? null : code);
    },
    [writeUrl],
  );
  const setNat = useCallback(
    (code: string) => {
      setNatState(code);
      writeUrl("nat", code === ALL_FOREIGN ? null : code);
    },
    [writeUrl],
  );

  // On first load, honour a scope named in the URL.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const kt = params.get("kt");
      if (kt && /^[A-Z]{2}$/.test(kt)) setCantonState(kt);
      const n = params.get("nat");
      if (n && /^[A-Z_]{2,12}$/.test(n)) setNatState(n);
    } catch {
      /* no URL to read */
    }
  }, []);

  const observations = cache[sliceKey];
  const lastGood = useRef<Observation[] | null>(null);
  if (observations) lastGood.current = observations;
  const effective = observations ?? lastGood.current;
  const dataset = useMemo<Dataset | null>(
    () => (effective && manifest ? { observations: effective, manifest } : null),
    [effective, manifest],
  );

  const summary = summaryCache[nat] ?? null;

  const value = useMemo<DataState>(
    () => ({
      dataset,
      summary,
      manifest,
      natIndex,
      nat,
      setNat,
      canton,
      setCanton,
      loading: dataset === null && error === null,
      switching,
      error,
    }),
    [dataset, summary, manifest, natIndex, nat, setNat, canton, setCanton, switching, error],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useDataset(): DataState {
  return useContext(DataContext);
}
