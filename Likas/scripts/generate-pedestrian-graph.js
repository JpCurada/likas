#!/usr/bin/env node
/**
 * Build a pedestrian routing graph from an OSM .pbf extract.
 *
 * Reads ../scripts/philippines-latest.osm.pbf (the same file
 * generate-map.js downloads) and emits ../assets/maps/pedestrian-graph.json.
 *
 * The graph is clipped to a Metro Manila bbox and limited to
 * pedestrian-walkable highway types. Output schema:
 *   {
 *     bbox: [minLon, minLat, maxLon, maxLat],
 *     nodes: { [id]: [lon, lat] },
 *     adjacency: { [id]: [[neighborId, meters], ...] }
 *   }
 *
 * Usage:
 *   node scripts/generate-pedestrian-graph.js [pbf-path]
 *
 * Deps: npm i -D osm-pbf-parser
 */

const fs = require('fs');
const path = require('path');

let parseOsm;
try {
  parseOsm = require('osm-pbf-parser');
} catch (err) {
  console.error(
    '\nMissing dependency. Install with:\n  npm i -D osm-pbf-parser\n',
  );
  process.exit(1);
}

// Metro Manila bbox (matches MapScreen METRO_MANILA_BOUNDS).
const BBOX = {minLon: 120.85, maxLon: 121.3, minLat: 14.25, maxLat: 14.9};

// Walkable highway tags (OSM).
const WALKABLE = new Set([
  'footway',
  'path',
  'pedestrian',
  'living_street',
  'residential',
  'service',
  'unclassified',
  'tertiary',
  'tertiary_link',
  'secondary',
  'secondary_link',
  'primary',
  'primary_link',
  'steps',
  'track',
  'cycleway',
]);

const PBF =
  process.argv[2] ||
  path.join(__dirname, 'philippines-latest.osm.pbf');
const OUTPUT = path.join(
  __dirname,
  '..',
  'assets',
  'maps',
  'pedestrian-graph.json',
);

const EARTH_RADIUS_M = 6371000;
const toRad = d => (d * Math.PI) / 180;
const haversine = (a, b) => {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const inBbox = (lon, lat) =>
  lon >= BBOX.minLon &&
  lon <= BBOX.maxLon &&
  lat >= BBOX.minLat &&
  lat <= BBOX.maxLat;

async function main() {
  if (!fs.existsSync(PBF)) {
    console.error(`\nPBF not found: ${PBF}`);
    console.error('Run `npm run generate-map` first to download it.\n');
    process.exit(1);
  }

  console.log(`Reading ${PBF}`);

  // PASS 1: collect candidate ways (walkable, no acl) and their referenced node ids.
  const candidateWays = []; // {refs: [nodeId,...]}
  const wantedNodeIds = new Set();

  await streamPbf(PBF, item => {
    if (item.type !== 'way') return;
    const hwy = item.tags?.highway;
    if (!hwy || !WALKABLE.has(hwy)) return;
    if (item.tags?.foot === 'no') return;
    if (item.tags?.access === 'private' || item.tags?.access === 'no') return;
    if (!Array.isArray(item.refs) || item.refs.length < 2) return;
    candidateWays.push({refs: item.refs});
    for (const r of item.refs) wantedNodeIds.add(r);
  });

  console.log(
    `Pass 1 done. ${candidateWays.length} candidate ways, ${wantedNodeIds.size} referenced nodes.`,
  );

  // PASS 2: resolve referenced nodes to coords, filter by bbox.
  const nodeCoords = new Map(); // id -> [lon, lat]
  await streamPbf(PBF, item => {
    if (item.type !== 'node') return;
    if (!wantedNodeIds.has(item.id)) return;
    if (!inBbox(item.lon, item.lat)) return;
    nodeCoords.set(item.id, [item.lon, item.lat]);
  });

  console.log(`Pass 2 done. ${nodeCoords.size} nodes inside Metro Manila bbox.`);

  // Build adjacency: for each way, walk consecutive node pairs that both have coords.
  const adjacency = new Map(); // id -> [[neighborId, meters], ...]
  let edgeCount = 0;

  const addEdge = (a, b, meters) => {
    if (!adjacency.has(a)) adjacency.set(a, []);
    adjacency.get(a).push([b, Math.round(meters * 10) / 10]);
  };

  for (const way of candidateWays) {
    const present = way.refs.filter(r => nodeCoords.has(r));
    for (let i = 1; i < present.length; i++) {
      const a = present[i - 1];
      const b = present[i];
      if (a === b) continue;
      const meters = haversine(nodeCoords.get(a), nodeCoords.get(b));
      addEdge(a, b, meters);
      addEdge(b, a, meters);
      edgeCount += 2;
    }
  }

  console.log(`Built adjacency. ${edgeCount} directed edges.`);

  // Drop isolated nodes (referenced but never connected after bbox clipping).
  for (const id of nodeCoords.keys()) {
    if (!adjacency.has(id)) nodeCoords.delete(id);
  }

  // Renumber to compact ids so JSON stays small.
  const idMap = new Map();
  let next = 0;
  for (const id of nodeCoords.keys()) idMap.set(id, next++);

  const compactNodes = {};
  for (const [id, coord] of nodeCoords.entries()) {
    compactNodes[idMap.get(id)] = [
      Math.round(coord[0] * 1e6) / 1e6,
      Math.round(coord[1] * 1e6) / 1e6,
    ];
  }

  const compactAdj = {};
  for (const [id, edges] of adjacency.entries()) {
    const remapped = edges
      .filter(([nb]) => idMap.has(nb))
      .map(([nb, m]) => [idMap.get(nb), m]);
    if (remapped.length > 0) compactAdj[idMap.get(id)] = remapped;
  }

  const out = {
    bbox: [BBOX.minLon, BBOX.minLat, BBOX.maxLon, BBOX.maxLat],
    nodes: compactNodes,
    adjacency: compactAdj,
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'OpenStreetMap via Geofabrik Philippines extract',
      nodeCount: Object.keys(compactNodes).length,
      edgeCount,
    },
  };

  fs.mkdirSync(path.dirname(OUTPUT), {recursive: true});
  fs.writeFileSync(OUTPUT, JSON.stringify(out));
  const sizeMb = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1);
  console.log(`\nWrote ${OUTPUT} (${sizeMb} MB)`);
  console.log(
    `Nodes: ${out.meta.nodeCount} · Edges: ${out.meta.edgeCount}`,
  );
}

function streamPbf(pbfPath, onItem) {
  return new Promise((resolve, reject) => {
    const parser = parseOsm();
    parser.on('data', items => {
      for (const item of items) onItem(item);
    });
    parser.on('end', resolve);
    parser.on('error', reject);
    fs.createReadStream(pbfPath).on('error', reject).pipe(parser);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
