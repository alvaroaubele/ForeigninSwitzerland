// Download the three full STATPOP cubes (all nationalities). Sequential, with
// the mandatory quiet gap between cubes — this host penalty-boxes bursts.
import { ensurePxCube, PX_INTER_CUBE_MS, readPxHeader } from "./harvest/px.js";

const CUBES = ["px-x-0103010000_101", "px-x-0103010000_399", "px-x-0103010000_423"];
async function main() {
  for (let i = 0; i < CUBES.length; i++) {
    const cube = CUBES[i];
    const t0 = Date.now();
    const { path, fromCache } = await ensurePxCube(cube);
    console.log(`${cube}: ${fromCache ? "cached" : "downloaded"} in ${Math.round((Date.now() - t0) / 1000)}s`);
    const h = readPxHeader(path);
    console.log(`  dims: ${h.dims.map((d) => `${d.name}(${d.codes.length})`).join(" × ")}`);
    if (!fromCache && i < CUBES.length - 1) {
      console.log(`  quiet gap ${PX_INTER_CUBE_MS / 1000}s…`);
      await new Promise((r) => setTimeout(r, PX_INTER_CUBE_MS));
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
