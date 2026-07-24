// Cached, rate-limited fetcher. Every raw response is cached to data/raw/
// keyed by a hash of (url + body) so re-runs and resumed sessions never re-fetch.
import { createHash } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAW_DIR = join(process.cwd(), "data", "raw");
mkdirSync(RAW_DIR, { recursive: true });

const MAX_CONCURRENT = 4; // per the rate-limit bound (<=4 concurrent per host)
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 6;
const REQUEST_TIMEOUT_MS = 45_000; // abort hung connections so they become retryable

function keyFor(url: string, body?: string): string {
  const h = createHash("sha1")
    .update(url + (body ?? ""))
    .digest("hex")
    .slice(0, 16);
  return h;
}

function cachePath(key: string, ext: string): string {
  return join(RAW_DIR, `${key}.${ext}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A tiny concurrency gate shared across all hosts we hit (SEM + BFS).
let active = 0;
const queue: Array<() => void> = [];
async function gate<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    const next = queue.shift();
    if (next) next();
  }
}

interface FetchOpts {
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  ext: "html" | "xlsx" | "json";
  /** Set false to force a network read even when cached (used by the verifier). */
  useCache?: boolean;
  label?: string;
}

export interface RawResult {
  key: string;
  path: string;
  buffer: Buffer;
  fromCache: boolean;
  retrievedAt: string;
}

export async function fetchRaw(url: string, opts: FetchOpts): Promise<RawResult> {
  const key = keyFor(url, opts.body);
  const path = cachePath(key, opts.ext);
  const metaPath = cachePath(key, "meta.json");

  if (opts.useCache !== false && existsSync(path)) {
    const meta = existsSync(metaPath)
      ? JSON.parse(readFileSync(metaPath, "utf8"))
      : { retrievedAt: new Date(0).toISOString() };
    return {
      key,
      path,
      buffer: readFileSync(path),
      fromCache: true,
      retrievedAt: meta.retrievedAt,
    };
  }

  return gate(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: opts.method ?? "GET",
          body: opts.body,
          signal: ac.signal,
          headers: {
            "User-Agent":
              "chileans-in-zug-harvest/1.0 (open statistical data explorer)",
            ...(opts.headers ?? {}),
          },
        });
        if (RETRY_STATUS.has(res.status)) {
          throw new Error(`retryable status ${res.status}`);
        }
        if (!res.ok) {
          const retrievedAt = new Date().toISOString();
          // Non-retryable (e.g. 404): cache a marker so we don't hammer it.
          const buffer = Buffer.from("");
          writeFileSync(metaPath, JSON.stringify({ url, status: res.status, retrievedAt }));
          return { key, path, buffer, fromCache: false, retrievedAt, notFound: true } as RawResult & {
            notFound: true;
          };
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        const retrievedAt = new Date().toISOString();
        writeFileSync(path, buffer);
        writeFileSync(
          metaPath,
          JSON.stringify({ url, status: res.status, body: opts.body, retrievedAt }),
        );
        return { key, path, buffer, fromCache: false, retrievedAt };
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_RETRIES) {
          const backoff = 3000 * 2 ** attempt; // 3s, 6s, 12s, 24s, 48s, 96s
          await sleep(backoff);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(`fetch failed after retries: ${url}: ${String(lastErr)}`);
  });
}

/** True when a successful response for (url, body) is already on disk. */
export function isCached(url: string, body: string | undefined, ext: "html" | "xlsx" | "json"): boolean {
  return existsSync(cachePath(keyFor(url, body), ext));
}

/** HTTP status recorded for a cached response (used to detect 404 archive months). */
export function statusFor(url: string, body?: string): number | null {
  const key = keyFor(url, body);
  const metaPath = cachePath(key, "meta.json");
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, "utf8")).status ?? null;
  } catch {
    return null;
  }
}
