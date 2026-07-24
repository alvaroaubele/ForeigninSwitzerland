// BFS STATPOP harvest via the PxWeb json-stat2 API. Each configured query is a
// slice of a cube filtered to Chile x Zug (or a comparison canton), expanded
// into typed observations with structural-zero / suppressed classification.
import { fetchRaw, isCached } from "./fetcher.js";
import { ensurePxCube, pxDownloadUrl, pxExtract, readPxHeader, type PxCell } from "./px.js";

const PXWEB = (cube: string) => `https://www.pxweb.bfs.admin.ch/api/v1/de/${cube}/${cube}.px`;

export interface PxQuery {
  code: string;
  selection: { filter: "item" | "all"; values: string[] };
}

export interface JsonStat2 {
  label: string;
  id: string[];
  size: number[];
  dimension: Record<
    string,
    { label: string; category: { index: Record<string, number>; label: Record<string, string> } }
  >;
  value: (number | null)[];
  status?: Record<string, string>;
}

export async function queryCube(cube: string, query: PxQuery[]): Promise<JsonStat2> {
  const body = JSON.stringify({ query, response: { format: "json-stat2" } });
  const res = await fetchRaw(PXWEB(cube), {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
    ext: "json",
    transport: "curl", // this host rejects Node's client outright; see fetcher.ts
  });
  return JSON.parse(res.buffer.toString("utf8")) as JsonStat2;
}

/**
 * Walk a json-stat2 response cell by cell. `map` receives, for each cell, a
 * record of dimensionId -> value code, plus the numeric value and status.
 */
export function walkJsonStat2(
  js: JsonStat2,
  map: (coord: Record<string, string>, value: number | null, status: string | undefined) => void,
): void {
  const dims = js.id;
  // ordered value codes per dimension
  const codesByDim: Record<string, string[]> = {};
  for (const d of dims) {
    const idx = js.dimension[d].category.index;
    codesByDim[d] = Object.keys(idx).sort((a, b) => idx[a] - idx[b]);
  }
  const total = js.value.length;
  for (let flat = 0; flat < total; flat++) {
    // decode row-major flat index into per-dimension codes
    let rem = flat;
    const coord: Record<string, string> = {};
    for (let di = dims.length - 1; di >= 0; di--) {
      const d = dims[di];
      const sz = js.size[di];
      const pos = rem % sz;
      rem = Math.floor(rem / sz);
      coord[d] = codesByDim[d][pos];
    }
    const status = js.status?.[String(flat)];
    map(coord, js.value[flat] ?? null, status);
  }
}

/** True when this exact cube query is already cached on disk (skips the rate delay). */
export function isCubeQueryCached(cube: string, query: PxQuery[]): boolean {
  const body = JSON.stringify({ query, response: { format: "json-stat2" } });
  return isCached(PXWEB(cube), body, "json");
}

export const PXWEB_URL = PXWEB;

/**
 * Answer a cube query from the full PC-Axis download instead of the POST API.
 *
 * The .px file's dimension names and value codes are identical to the PxWeb API's
 * variable codes, so the query spec needs no translation and the resulting
 * coordinates are keyed exactly as `walkJsonStat2` would key them. Same server,
 * same published figures — only the access method differs.
 */
export async function queryCubeViaPx(
  cube: string,
  query: PxQuery[],
): Promise<{ cells: PxCell[]; url: string; retrievedAt: string; fromCache: boolean }> {
  const { path, retrievedAt, fromCache } = await ensurePxCube(cube);
  const header = readPxHeader(path);
  const selection: Record<string, string[]> = {};
  for (const q of query) {
    if (q.selection.filter === "all") continue; // "all" = every value; px.ts defaults to that
    selection[q.code] = q.selection.values;
  }
  return { cells: pxExtract(path, header, selection), url: pxDownloadUrl(cube), retrievedAt, fromCache };
}
