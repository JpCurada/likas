/**
 * generate-pedestrian-graph.mjs
 *
 * Extracts walkable ways from your local MBTiles file and outputs a
 * pedestrian-graph.json that routingService.ts can consume.
 *
 * Usage (run from repo root):
 *   node scripts/generate-pedestrian-graph.mjs
 *
 * Output:
 *   scripts/pedestrian-graph.json
 *
 * Then sideload to device:
 *   adb push scripts/pedestrian-graph.json /sdcard/likas/pedestrian-graph.json
 *
 * Then in-app: Profile → Offline Data → Sideload
 */

import { createRequire } from 'module';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gunzipSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const Database = require('better-sqlite3');
const { VectorTile } = require('@mapbox/vector-tile');
const Pbf = require('pbf');

// ── Config ────────────────────────────────────────────────────────────────────

const MBTILES_PATH = join(
  __dirname,
  '../Likas/assets/maps/philippines-extract.mbtiles',
);

// Tile zoom level to read from — 14 gives good road detail without too many tiles
const EXTRACT_ZOOM = 14;

// Metro Manila bounding box [minLon, minLat, maxLon, maxLat]
const BBOX = [120.80, 14.30, 121.20, 14.95];

// OpenMapTiles / Planetiler transportation layer name
const TRANSPORT_LAYER = 'transportation';

// Highway classes considered walkable (matches OpenMapTiles schema)
const WALKABLE_CLASSES = new Set([
  'path', 'footway', 'pedestrian', 'living_street', 'steps',
  'residential', 'service', 'unclassified', 'tertiary',
  'secondary', 'primary', 'track', 'corridor',
]);

const WALKING_MPS = 1.167;

// ── Tile math ─────────────────────────────────────────────────────────────────

function lonToTileX(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}
function latToTileY(lat, zoom) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** zoom,
  );
}
// MBTiles stores TMS y (flipped) — convert from XYZ
function xyzToTms(y, zoom) {
  return 2 ** zoom - 1 - y;
}

function tileToBBoxWGS84(x, y, zoom) {
  const n = 2 ** zoom;
  const minLon = (x / n) * 360 - 180;
  const maxLon = ((x + 1) / n) * 360 - 180;
  const minLat =
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
  const maxLat =
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { minLon, minLat, maxLon, maxLat };
}

// ── Haversine ─────────────────────────────────────────────────────────────────

const toRad = d => (d * Math.PI) / 180;
function haversineMeters(lon1, lat1, lon2, lat2) {
  const R = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Graph construction ────────────────────────────────────────────────────────

/**
 * Snap a coordinate to a string key with ~2m precision.
 * We use this so the same physical location in different tiles shares one node.
 */
function coordKey(lon, lat) {
  return `${lon.toFixed(6)},${lat.toFixed(6)}`;
}

async function buildGraphFromMbtiles() {
  if (!existsSync(MBTILES_PATH)) {
    throw new Error(`MBTiles not found at: ${MBTILES_PATH}`);
  }

  console.log(`Opening MBTiles: ${MBTILES_PATH}`);
  const db = new Database(MBTILES_PATH, { readonly: true });

  const [minX, minY, maxX, maxY] = [
    lonToTileX(BBOX[0], EXTRACT_ZOOM),
    latToTileY(BBOX[3], EXTRACT_ZOOM), // note: lat is flipped for tile Y
    lonToTileX(BBOX[2], EXTRACT_ZOOM),
    latToTileY(BBOX[1], EXTRACT_ZOOM),
  ];

  const totalTiles = (maxX - minX + 1) * (maxY - minY + 1);
  console.log(
    `Reading zoom=${EXTRACT_ZOOM} tiles: x=${minX}..${maxX}, y=${minY}..${maxY} (${totalTiles} tiles)`,
  );

  const stmt = db.prepare(
    'SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?',
  );

  // coord key -> compact node id
  const coordToId = new Map();
  // compact id -> [lon, lat]
  const nodes = [];
  // compact id -> Set of neighbor ids (undirected)
  const adjSets = [];

  let tilesRead = 0;
  let waysExtracted = 0;

  const getOrCreate = key => {
    let id = coordToId.get(key);
    if (id === undefined) {
      id = nodes.length;
      coordToId.set(key, id);
      const [lon, lat] = key.split(',').map(Number);
      nodes.push([lon, lat]);
      adjSets.push(new Set());
    }
    return id;
  };

  for (let tx = minX; tx <= maxX; tx++) {
    for (let ty = minY; ty <= maxY; ty++) {
      const tmsY = xyzToTms(ty, EXTRACT_ZOOM);
      const row = stmt.get(EXTRACT_ZOOM, tx, tmsY);
      if (!row) continue;

      tilesRead++;
      if (tilesRead % 50 === 0) {
        process.stdout.write(`\r  Tiles processed: ${tilesRead}/${totalTiles}  `);
      }

      let buf;
      try {
        buf = gunzipSync(row.tile_data);
      } catch {
        buf = row.tile_data; // not gzipped
      }

      let tile;
      try {
        tile = new VectorTile(new Pbf(buf));
      } catch {
        continue;
      }

      const layer = tile.layers[TRANSPORT_LAYER];
      if (!layer) continue;

      const tileBox = tileToBBoxWGS84(tx, ty, EXTRACT_ZOOM);
      const extent = layer.extent;

      for (let fi = 0; fi < layer.length; fi++) {
        const feat = layer.feature(fi);
        const cls = feat.properties?.class ?? feat.properties?.highway ?? '';
        if (!WALKABLE_CLASSES.has(cls)) continue;

        const geom = feat.loadGeometry(); // Array of rings/lines of {x,y} points
        for (const line of geom) {
          if (line.length < 2) continue;

          // Map tile pixel coords -> WGS84
          const coords = line.map(pt => {
            const lon =
              tileBox.minLon +
              (pt.x / extent) * (tileBox.maxLon - tileBox.minLon);
            const lat =
              tileBox.maxLat -
              (pt.y / extent) * (tileBox.maxLat - tileBox.minLat);
            return coordKey(lon, lat);
          });

          waysExtracted++;
          for (let i = 0; i < coords.length - 1; i++) {
            const a = getOrCreate(coords[i]);
            const b = getOrCreate(coords[i + 1]);
            if (a === b) continue;
            adjSets[a].add(b);
            adjSets[b].add(a);
          }
        }
      }
    }
  }

  db.close();
  process.stdout.write('\n');
  console.log(`  Tiles read: ${tilesRead}, ways extracted: ${waysExtracted}`);
  console.log(`  Total nodes: ${nodes.length}`);

  // Convert to routingService format (with distances)
  const nodesObj = {};
  const adjacencyObj = {};
  for (let i = 0; i < nodes.length; i++) {
    nodesObj[i] = nodes[i];
    const [aLon, aLat] = nodes[i];
    const edges = [];
    for (const nb of adjSets[i]) {
      const [bLon, bLat] = nodes[nb];
      const dist = Math.round(haversineMeters(aLon, aLat, bLon, bLat));
      edges.push([nb, dist]);
    }
    if (edges.length > 0) adjacencyObj[i] = edges;
  }

  // Compute actual bbox from extracted nodes
  let [minLon, minLat, maxLon, maxLat] = [180, 90, -180, -90];
  for (const [lon, lat] of nodes) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }

  return {
    bbox: [minLon, minLat, maxLon, maxLat],
    nodes: nodesObj,
    adjacency: adjacencyObj,
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'MBTiles extraction (philippines-extract.mbtiles)',
      zoom: EXTRACT_ZOOM,
      bbox: BBOX,
      walkableClasses: [...WALKABLE_CLASSES],
      nodeCount: nodes.length,
      waysExtracted,
      walkingSpeedMps: WALKING_MPS,
    },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== LIKAS Pedestrian Graph Generator ===');
  console.log('Source: Local MBTiles (philippines-extract.mbtiles)');
  console.log('');

  const graph = await buildGraphFromMbtiles();

  const outPath = join(__dirname, 'pedestrian-graph.json');
  console.log(`\nWriting graph to: ${outPath}`);
  writeFileSync(outPath, JSON.stringify(graph));

  const sizeMB = (JSON.stringify(graph).length / 1_048_576).toFixed(1);
  console.log(`Done! File size: ~${sizeMB} MB`);
  console.log(`Nodes: ${graph.meta.nodeCount.toLocaleString()}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. adb push scripts/pedestrian-graph.json /sdcard/likas/pedestrian-graph.json');
  console.log('  2. In the app: Profile → Offline Data → Sideload');
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
