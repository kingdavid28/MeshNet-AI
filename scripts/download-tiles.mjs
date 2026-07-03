/**
 * scripts/download-tiles.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Downloads OpenStreetMap tiles for Manila (seed-node area) into
 * public/tiles/{z}/{x}/{y}.png so the Leaflet map works fully offline.
 *
 * Tile source: tile.openstreetmap.org  (free, attribution required)
 * Area:  Manila / Quezon City core — approx 14.57–14.63 N, 120.96–121.01 E
 * Zoom:  13–16  (~4 px/m street level, reasonable download size ≈ 1–2 MB)
 *
 * Usage (run once, then commit public/tiles/ or bundle it):
 *   node scripts/download-tiles.mjs
 *
 * Tile count: ~320 tiles across z13-z16 → fast download (<30 s)
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = path.resolve(__dirname, "../public/tiles");

// ── Tile math ────────────────────────────────────────────────────────────────

function lon2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}
function lat2tile(lat, zoom) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
}

// Manila bounding box (generous — covers all seed nodes + 1 km buffer)
const BBOX = { minLat: 14.57, maxLat: 14.63, minLon: 120.96, maxLon: 121.01 };
const ZOOMS = [13, 14, 15, 16];

function getTileRange(zoom) {
  return {
    xMin: lon2tile(BBOX.minLon, zoom),
    xMax: lon2tile(BBOX.maxLon, zoom),
    yMin: lat2tile(BBOX.maxLat, zoom), // note: lat flipped in tile system
    yMax: lat2tile(BBOX.minLat, zoom),
  };
}

// ── Download helper ───────────────────────────────────────────────────────────

const USER_AGENT = "MeshNetAI/1.0 offline-tile-downloader (+https://github.com/kingdavid28/MeshNet-AI)";

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest);
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(dest)) { resolve("cached"); return; }

    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { "User-Agent": USER_AGENT } }, (res) => {
      if (res.statusCode === 200) {
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve("ok"); });
      } else {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
    }).on("error", (err) => {
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let total = 0, downloaded = 0, cached = 0, errors = 0;

  // Count first
  for (const z of ZOOMS) {
    const { xMin, xMax, yMin, yMax } = getTileRange(z);
    total += (xMax - xMin + 1) * (yMax - yMin + 1);
  }
  console.log(`\nDownloading ${total} tiles for Manila (zoom ${ZOOMS[0]}-${ZOOMS[ZOOMS.length-1]}) …\n`);

  for (const z of ZOOMS) {
    const { xMin, xMax, yMin, yMax } = getTileRange(z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const url  = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
        const dest = path.join(OUT_DIR, `${z}`, `${x}`, `${y}.png`);
        try {
          const result = await downloadFile(url, dest);
          if (result === "cached") { cached++; process.stdout.write("·"); }
          else                      { downloaded++; process.stdout.write("."); }
          // OSM rate limit: be polite — 200 ms between fresh downloads
          if (result !== "cached") await sleep(200);
        } catch (err) {
          errors++;
          process.stdout.write("!");
          console.error(`\n  ERROR z=${z} x=${x} y=${y}: ${err.message}`);
        }
      }
    }
  }

  console.log(`\n\nDone!  downloaded=${downloaded}  cached=${cached}  errors=${errors}`);
  console.log(`Tiles saved to: ${OUT_DIR}`);
  if (errors > 0) {
    console.warn("Some tiles failed — re-run the script to retry missing ones.");
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
