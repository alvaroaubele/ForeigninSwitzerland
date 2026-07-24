"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { Manifest, Observation } from "./types";
import type { Dataset } from "./model";

interface DataState {
  dataset: Dataset | null;
  loading: boolean;
  error: string | null;
}

const DataContext = createContext<DataState>({ dataset: null, loading: true, error: null });

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DataState>({ dataset: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const base = process.env.NODE_ENV === "production" ? "" : "";
        const [hRes, mRes] = await Promise.all([
          fetch(`${base}/data/harvest.json`),
          fetch(`${base}/data/manifest.json`),
        ]);
        if (!hRes.ok || !mRes.ok) throw new Error("Failed to load harvested data");
        const harvest = (await hRes.json()) as { observations: Observation[] };
        const manifest = (await mRes.json()) as Manifest;
        if (!cancelled) {
          setState({
            dataset: { observations: harvest.observations, manifest },
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) setState({ dataset: null, loading: false, error: String(err) });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return <DataContext.Provider value={state}>{children}</DataContext.Provider>;
}

export function useDataset(): DataState {
  return useContext(DataContext);
}
