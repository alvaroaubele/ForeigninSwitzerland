// PC-Axis (.px) full-cube reader — the fallback route into BFS STATPOP.
//
// Why this exists: the PxWeb json-stat2 *query* endpoint is POST-only and is
// aggressively rate-limited per egress address; it tarpits bursts and returns
// transient 400/503s for extended periods. The very same PxWeb server publishes
// every cube in full as a PC-Axis file over plain GET:
//
//     https://www.pxweb.bfs.admin.ch/DownloadFile.aspx?file=<cube>
//
// That path is not rate-limited. We download the cube once (cached under
// data/raw/px/, gitignored), then answer the exact same dimension selections
// locally. The dimension names and value codes in the .px file are identical to
// the PxWeb API's variable codes, so a query spec runs unchanged either way.
//
// Values obtained this way are the same published figures from the same server;
// only the access method differs, and that difference is recorded in provenance.

import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { once } from "node:events";
import { dirname, join } from "node:path";

export interface PxDim {
  name: string;
  codes: string[];
  values: string[];
}

export interface PxHeader {
  matrix: string;
  title: string;
  lastUpdated: string | null;
  creationDate: string | null;
  /** STUB dimensions followed by HEADING dimensions — data order, last varies fastest. */
  dims: PxDim[];
  /** Byte offset of the first data token (just past `DATA=`). */
  dataOffset: number;
}

export interface PxCell {
  /** dimension name -> selected value code */
  coord: Record<string, string>;
  value: number | null;
  /** the raw token as it appears in the file (e.g. "12" or "...") */
  raw: string;
}

export function pxDownloadUrl(cube: string): string {
  return `https://www.pxweb.bfs.admin.ch/DownloadFile.aspx?file=${cube}`;
}

const PX_DIR = join(process.cwd(), "data", "raw", "px");

/**
 * Download the full cube if it is not already cached. Streams straight to disk —
 * these files run to hundreds of megabytes and must never be buffered in memory.
 * Returns the local path and the retrieval timestamp (preserved across runs).
 */
export async function ensurePxCube(cube: string): Promise<{ path: string; retrievedAt: string; fromCache: boolean }> {
  const path = join(PX_DIR, `${cube}.px`);
  const metaPath = `${path}.meta.json`;
  if (existsSync(path) && statSync(path).size > 0 && existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { retrievedAt: string };
    assertComplete(path, cube);
    return { path, retrievedAt: meta.retrievedAt, fromCache: true };
  }
  mkdirSync(dirname(path), { recursive: true });
  const url = pxDownloadUrl(cube);
  const part = `${path}.part`;

  // The endpoint tarpits bursts exactly like the query API does, and it ignores
  // Range requests, so a failed transfer cannot be resumed — back off and retry
  // the whole file rather than hammering it.
  let bytes = 0;
  let lastErr: unknown;
  for (let attempt = 0; attempt < PX_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const wait = PX_BACKOFF_MS[Math.min(attempt - 1, PX_BACKOFF_MS.length - 1)];
      console.warn(`  ${cube}: retry ${attempt}/${PX_MAX_ATTEMPTS - 1} in ${Math.round(wait / 1000)}s (${String(lastErr)})`);
      await new Promise((r) => setTimeout(r, wait));
    }
    try {
      bytes = await downloadOnce(url, part);
      assertComplete(part, cube);
      lastErr = undefined;
      break;
    } catch (err) {
      lastErr = err;
      rmSync(part, { force: true });
    }
  }
  if (lastErr !== undefined) throw new Error(`px download failed for ${cube}: ${String(lastErr)}`);

  renameSync(part, path);
  const retrievedAt = new Date().toISOString();
  writeFileSync(metaPath, JSON.stringify({ url, cube, retrievedAt, status: 200, bytes }, null, 2));
  return { path, retrievedAt, fromCache: false };
}

// This endpoint behaves like a penalty box: the first request after a quiet
// period is served, and anything that follows too soon is refused with 400/503 —
// including requests that would otherwise be fine. Exponential growth is the
// wrong shape for a fixed-window limiter, so we ramp briefly and then settle
// into steady wide spacing. Nothing else in the run may touch this host
// meanwhile, or it resets the window.
const PX_MAX_ATTEMPTS = 10;
const PX_BACKOFF_MS = [60_000, 180_000, 300_000, 300_000, 300_000, 300_000, 300_000, 300_000, 300_000];
/** Quiet gap after a completed cube, before asking for the next one. */
export const PX_INTER_CUBE_MS = 180_000;
/**
 * Abort only after this long with *no bytes arriving*. A total-elapsed timeout is
 * the wrong tool here: these files take minutes to transfer, and capping total
 * time silently truncates a healthy download into a file that still parses.
 */
const PX_STALL_MS = 90_000;

async function downloadOnce(url: string, dest: string): Promise<number> {
  const ac = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => ac.abort(), PX_STALL_MS);
  };
  arm();
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { "User-Agent": "chileans-in-zug-harvest/1.0 (open-data research)" },
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const declared = Number(res.headers.get("content-length") ?? 0);

    const out = createWriteStream(dest);
    let written = 0;
    const reader = res.body.getReader();
    for (;;) {
      arm();
      const { done, value } = await reader.read();
      if (done) break;
      written += value.byteLength;
      if (!out.write(value)) await once(out, "drain");
    }
    out.end();
    await once(out, "finish");

    if (declared > 0 && written !== declared) {
      throw new Error(`truncated: got ${written} of ${declared} bytes`);
    }
    return written;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A PC-Axis file ends with `;` closing the DATA keyword. A truncated download
 * still parses — the surviving prefix is valid — so it would silently answer
 * some queries and mis-report others as "past the end of the data". Refuse to
 * use a cube that does not end cleanly.
 */
function assertComplete(path: string, cube: string): void {
  const size = statSync(path).size;
  const len = Math.min(64, size);
  const buf = Buffer.alloc(len);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buf, 0, len, size - len);
  } finally {
    closeSync(fd);
  }
  if (!buf.toString("latin1").trimEnd().endsWith(";")) {
    throw new Error(`px cube ${cube} is incomplete (no terminating ';'); delete ${path} and re-download`);
  }
}

// ---------------------------------------------------------------------------
// Header parsing
// ---------------------------------------------------------------------------

const HEADER_SCAN_BYTES = 8 * 1024 * 1024;
const DATA_MARKER = Buffer.from("DATA=", "latin1");

/**
 * PC-Axis declares a CODEPAGE, but BFS serves these files as UTF-8. Decode as
 * UTF-8 and fall back to latin1 only if that produces replacement characters.
 */
function decodeHeader(buf: Buffer): string {
  const utf8 = buf.toString("utf8");
  return utf8.includes("�") ? buf.toString("latin1") : utf8;
}

/** Byte offset of the `DATA=` keyword — must start a line, so it cannot match inside a quoted title. */
function findDataMarker(buf: Buffer): number {
  let from = 0;
  for (;;) {
    const at = buf.indexOf(DATA_MARKER, from);
    if (at < 0) return -1;
    const prev = at === 0 ? 0x0a : buf[at - 1];
    if (prev === 0x0a || prev === 0x0d) return at;
    from = at + 1;
  }
}

interface PxKeyword {
  key: string;
  lang: string | null;
  subkey: string | null;
  value: string;
}

const isSpace = (ch: string): boolean => ch === " " || ch === "\t" || ch === "\r" || ch === "\n";
const isKeyChar = (ch: string): boolean => (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9") || ch === "-";

/**
 * Iterate `KEYWORD[lang]("subkey")=value;` entries. The subkey is read as a
 * quoted string rather than scanning for `)`, because dimension names themselves
 * contain parentheses — e.g. `Staatsangehörigkeit (Auswahl)` in cube 399.
 */
function* keywords(text: string): Generator<PxKeyword> {
  let i = 0;
  const n = text.length;
  while (i < n) {
    while (i < n && isSpace(text[i])) i++;
    if (i >= n) break;
    const keyStart = i;
    while (i < n && isKeyChar(text[i])) i++;
    const key = text.slice(keyStart, i);
    if (!key) {
      i++;
      continue;
    }
    let lang: string | null = null;
    if (text[i] === "[") {
      const end = text.indexOf("]", i);
      if (end < 0) break;
      lang = text.slice(i + 1, end);
      i = end + 1;
    }
    let subkey: string | null = null;
    if (text[i] === "(") {
      i++;
      if (text[i] === '"') {
        const end = text.indexOf('"', i + 1);
        if (end < 0) break;
        subkey = text.slice(i + 1, end);
        i = end + 1;
        while (i < n && text[i] !== ")") i++;
        i++;
      } else {
        const end = text.indexOf(")", i);
        if (end < 0) break;
        subkey = text.slice(i, end);
        i = end + 1;
      }
    }
    while (i < n && isSpace(text[i])) i++;
    if (text[i] !== "=") continue;
    i++;
    let quoted = false;
    const valueStart = i;
    while (i < n) {
      const ch = text[i];
      if (ch === '"') quoted = !quoted;
      else if (ch === ";" && !quoted) break;
      i++;
    }
    yield { key, lang, subkey, value: text.slice(valueStart, i).trim() };
    i++;
  }
}

const parseQuotedList = (value: string): string[] => [...value.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
const unquote = (value: string): string => value.trim().replace(/^"|"$/g, "");

export function readPxHeader(path: string): PxHeader {
  const size = statSync(path).size;
  const len = Math.min(HEADER_SCAN_BYTES, size);
  const buf = Buffer.alloc(len);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buf, 0, len, 0);
  } finally {
    closeSync(fd);
  }
  const marker = findDataMarker(buf);
  if (marker < 0) throw new Error(`px: no DATA= section in the first ${len} bytes of ${path}`);
  const text = decodeHeader(buf.subarray(0, marker));

  let matrix = "";
  let title = "";
  let lastUpdated: string | null = null;
  let creationDate: string | null = null;
  let stub: string[] = [];
  let heading: string[] = [];
  const valuesByDim = new Map<string, string[]>();
  const codesByDim = new Map<string, string[]>();

  for (const kw of keywords(text)) {
    if (kw.lang) continue; // keep the default (German) labels only
    switch (kw.key) {
      case "MATRIX":
        matrix = unquote(kw.value);
        break;
      case "TITLE":
      case "DESCRIPTION":
        if (!title || kw.key === "TITLE") title = unquote(kw.value);
        break;
      case "LAST-UPDATED":
        lastUpdated = unquote(kw.value);
        break;
      case "CREATION-DATE":
        creationDate = unquote(kw.value);
        break;
      case "STUB":
        stub = parseQuotedList(kw.value);
        break;
      case "HEADING":
        heading = parseQuotedList(kw.value);
        break;
      case "VALUES":
        if (kw.subkey) valuesByDim.set(kw.subkey, parseQuotedList(kw.value));
        break;
      case "CODES":
        if (kw.subkey) codesByDim.set(kw.subkey, parseQuotedList(kw.value));
        break;
      default:
        break;
    }
  }

  const dims: PxDim[] = [...stub, ...heading].map((name) => {
    const values = valuesByDim.get(name) ?? [];
    const codes = codesByDim.get(name) ?? values;
    if (values.length === 0) throw new Error(`px: dimension "${name}" has no VALUES in ${path}`);
    if (codes.length !== values.length) {
      throw new Error(`px: dimension "${name}" has ${codes.length} codes but ${values.length} values in ${path}`);
    }
    return { name, codes, values };
  });
  if (dims.length === 0) throw new Error(`px: no dimensions found in ${path}`);

  return { matrix, title, lastUpdated, creationDate, dims, dataOffset: marker + DATA_MARKER.length };
}

// ---------------------------------------------------------------------------
// Data extraction
// ---------------------------------------------------------------------------

/** Dot-runs and bare dashes are PC-Axis missing/confidential markers, not numbers. */
function parsePxValue(raw: string): number | null {
  const token = raw.replace(/"/g, "").trim();
  if (token === "" || token === "-" || /^\.+$/.test(token)) return null;
  const n = Number(token);
  return Number.isFinite(n) ? n : null;
}

const isWsByte = (b: number): boolean => b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d;

/** Guard against a caller accidentally selecting a whole cube. */
const MAX_CELLS = 250_000;

/**
 * Read the cells named by `selection` (dimension name -> value codes) out of the
 * cube. The data section is a flat row-major array over `header.dims` with the
 * last dimension varying fastest, so each wanted cell has a computable index; we
 * stream the file counting tokens and capture only those indices.
 */
export function pxExtract(path: string, header: PxHeader, selection: Record<string, string[]>): PxCell[] {
  const { dims } = header;
  const strides = new Array<number>(dims.length);
  let acc = 1;
  for (let i = dims.length - 1; i >= 0; i--) {
    strides[i] = acc;
    acc *= dims[i].codes.length;
  }

  const picks: number[][] = dims.map((d) => {
    // Mirror the PxWeb API: a dimension left out of the selection is returned in
    // full. MAX_CELLS below is what stops that from running away.
    const want = selection[d.name];
    if (!want) return d.codes.map((_, i) => i);
    return want.map((code) => {
      const at = d.codes.indexOf(code);
      if (at < 0) throw new Error(`px: code "${code}" not in dimension "${d.name}" of ${header.matrix}`);
      return at;
    });
  });

  const cellCount = picks.reduce((n, p) => n * p.length, 1);
  if (cellCount > MAX_CELLS) throw new Error(`px: selection covers ${cellCount} cells (limit ${MAX_CELLS})`);

  let combos: { flat: number; coord: Record<string, string> }[] = [{ flat: 0, coord: {} }];
  for (let i = 0; i < dims.length; i++) {
    const next: typeof combos = [];
    for (const c of combos) {
      for (const p of picks[i]) {
        next.push({ flat: c.flat + p * strides[i], coord: { ...c.coord, [dims[i].name]: dims[i].codes[p] } });
      }
    }
    combos = next;
  }
  const wanted = new Set(combos.map((c) => c.flat));
  const maxFlat = Math.max(...combos.map((c) => c.flat));

  const captured = new Map<number, string>();
  const fileSize = statSync(path).size;
  const CHUNK = 1 << 22;
  const buf = Buffer.alloc(CHUNK);
  const fd = openSync(path, "r");
  let pos = header.dataOffset;
  let index = 0;
  let inToken = false;
  let inQuote = false;
  let capture: number[] | null = null;

  try {
    scan: while (pos < fileSize) {
      const n = readSync(fd, buf, 0, CHUNK, pos);
      if (n <= 0) break;
      pos += n;
      for (let k = 0; k < n; k++) {
        const b = buf[k];
        if (!inToken) {
          if (isWsByte(b)) continue;
          if (b === 0x3b) break scan; // ';' terminates DATA
          inToken = true;
          inQuote = b === 0x22;
          capture = wanted.has(index) ? [b] : null;
          continue;
        }
        if (b === 0x22) {
          inQuote = !inQuote;
          if (capture) capture.push(b);
          continue;
        }
        if (!inQuote && (isWsByte(b) || b === 0x3b)) {
          if (capture) captured.set(index, Buffer.from(capture).toString("latin1"));
          index++;
          inToken = false;
          capture = null;
          if (index > maxFlat || b === 0x3b) break scan;
          continue;
        }
        if (capture) capture.push(b);
      }
    }
    if (inToken && capture) captured.set(index, Buffer.from(capture).toString("latin1"));
  } finally {
    closeSync(fd);
  }

  return combos.map((c) => {
    const raw = captured.get(c.flat);
    if (raw === undefined) {
      throw new Error(`px: data section of ${header.matrix} ended before cell ${c.flat}`);
    }
    return { coord: c.coord, value: parsePxValue(raw), raw };
  });
}
