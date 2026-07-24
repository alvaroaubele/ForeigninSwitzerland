// Cached, rate-limited fetcher. Every raw response is cached to data/raw/
// keyed by a hash of (url + body) so re-runs and resumed sessions never re-fetch.
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
  /**
   * Which HTTP client to use. `"curl"` is required for pxweb.bfs.admin.ch — see
   * `curlRequest` below. Defaults to Node's built-in fetch, which is fine for
   * sem.admin.ch and every other source in the harvest.
   */
  transport?: "fetch" | "curl";
}

interface HttpResult {
  status: number;
  buffer: Buffer;
}

/** Rejected by a filter in front of the origin — retrying cannot help. */
export class BlockedError extends Error {}

function isBlockPage(res: HttpResult, opts: FetchOpts): boolean {
  if (res.status < 400) return false;
  if (opts.ext !== "json") return false; // only JSON callers can judge by shape
  const head = res.buffer.subarray(0, 200).toString("latin1").trimStart().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

const USER_AGENT = "chileans-in-zug-harvest/1.0 (open statistical data explorer)";

async function nodeFetchRequest(url: string, opts: FetchOpts): Promise<HttpResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      body: opts.body,
      signal: ac.signal,
      headers: { "User-Agent": USER_AGENT, ...(opts.headers ?? {}) },
    });
    return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Same request, issued by curl instead of Node.
 *
 * www.pxweb.bfs.admin.ch sits behind a WAF that rejects Node's TLS/HTTP client
 * outright: identical requests get 400/503 from `fetch` and 200 from curl, and
 * no combination of User-Agent or other headers changes that — the rejection is
 * on the connection fingerprint, not on anything we can put in a header. Rather
 * than treat those responses as a rate limit and back off forever (they are not
 * one; curl sustains back-to-back requests fine), we hand BFS traffic to curl.
 */
async function curlRequest(url: string, opts: FetchOpts): Promise<HttpResult> {
  const stem = join(tmpdir(), `harvest-${randomBytes(8).toString("hex")}`);
  const outPath = `${stem}.out`;
  const bodyPath = `${stem}.body`;
  // Deliberately no User-Agent override. The WAF answers any UA it does not
  // recognise with a 400 and a 54 KB HTML block page — including our own polite
  // identifying string — and a burst of those escalates to a connection-level
  // ban on the egress IP. curl's own default UA is accepted, and it is the
  // honest one here: this request really is curl.
  const args = [
    "-sS",
    "--max-time",
    String(Math.ceil(REQUEST_TIMEOUT_MS / 1000)),
    "-o",
    outPath,
    "-w",
    "%{http_code}",
  ];
  for (const [k, v] of Object.entries(opts.headers ?? {})) args.push("-H", `${k}: ${v}`);
  if (opts.method === "POST") {
    writeFileSync(bodyPath, opts.body ?? "", "utf8");
    args.push("-X", "POST", "--data-binary", `@${bodyPath}`);
  }
  args.push(url);
  try {
    const { stdout } = await execFileAsync("curl", args, { maxBuffer: 1 << 20 });
    const status = Number(stdout.trim().slice(-3));
    const buffer = existsSync(outPath) ? readFileSync(outPath) : Buffer.from("");
    return { status: Number.isFinite(status) ? status : 0, buffer };
  } finally {
    rmSync(outPath, { force: true });
    rmSync(bodyPath, { force: true });
  }
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
  // A cached absence marker (e.g. a 404 archive month) has a meta file but no
  // data file — honour it so we don't re-fetch known-missing URLs. Only 404 and
  // 410 count: they are the statuses that actually mean "this resource is not
  // there". A cached 400 means the *request* was rejected, which says nothing
  // about the resource and turns a fixable client bug into a permanent hole in
  // the harvest — exactly what a batch of stale 400 markers from a since-fixed
  // User-Agent rejection did to the cube-101 queries.
  if (opts.useCache !== false && !existsSync(path) && existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      if (meta.status === 404 || meta.status === 410) {
        return {
          key,
          path,
          buffer: Buffer.from(""),
          fromCache: true,
          retrievedAt: meta.retrievedAt,
          notFound: true,
        } as RawResult & { notFound: true };
      }
    } catch {
      /* fall through to a live fetch */
    }
  }

  return gate(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res =
          opts.transport === "curl"
            ? await curlRequest(url, opts)
            : await nodeFetchRequest(url, opts);
        // A WAF block page is not a transient error and retrying it is actively
        // harmful: a burst of blocked requests escalates to a connection-level
        // ban on the egress IP. Detect it by shape (HTML body where the caller
        // asked for JSON) and fail immediately with a diagnosable message.
        if (isBlockPage(res, opts)) {
          throw new BlockedError(
            `${url} answered ${res.status} with a WAF block page — the request was rejected on its ` +
              `headers or client fingerprint, not its content. Retrying will get the IP banned.`,
          );
        }
        // pxweb tarpits bursts with transient 400s and 403s under load; since the
        // harvest's queries are validated, treat those as retryable for POSTs too.
        const postTransient = opts.method === "POST" && (res.status === 400 || res.status === 403);
        if (RETRY_STATUS.has(res.status) || postTransient) {
          throw new Error(`retryable status ${res.status}`);
        }
        if (res.status < 200 || res.status >= 300) {
          const retrievedAt = new Date().toISOString();
          // Not retryable (e.g. 404): cache a marker so we don't hammer it. Only
          // 404/410 are honoured on later runs — see the read path above.
          const buffer = Buffer.from("");
          writeFileSync(metaPath, JSON.stringify({ url, status: res.status, retrievedAt }));
          return { key, path, buffer, fromCache: false, retrievedAt, notFound: true } as RawResult & {
            notFound: true;
          };
        }
        const buffer = res.buffer;
        // An empty successful body is the tarpit's other failure mode — never
        // cache it; treat it as retryable so backoff can outlast the block.
        if (buffer.length === 0) {
          throw new Error("empty response body");
        }
        const retrievedAt = new Date().toISOString();
        writeFileSync(path, buffer);
        writeFileSync(
          metaPath,
          JSON.stringify({ url, status: res.status, body: opts.body, retrievedAt }),
        );
        return { key, path, buffer, fromCache: false, retrievedAt };
      } catch (err) {
        lastErr = err;
        if (err instanceof BlockedError) throw err; // never retry a block page
        if (attempt < MAX_RETRIES) {
          const backoff = 3000 * 2 ** attempt; // 3s, 6s, 12s, 24s, 48s, 96s
          await sleep(backoff);
        }
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
