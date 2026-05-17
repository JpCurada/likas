/**
 * graphDb.ts
 *
 * Owns the SQLite connection to pedestrian-graph.db and provides
 * corridor-subgraph queries for the routing service.
 *
 * Key design decisions:
 *  - Singleton DB handle: opened once, reused across route() calls.
 *  - Per-route subgraph: only nodes/edges inside the route corridor
 *    bbox are loaded — typically ~15–20k nodes vs 280k total.
 *  - Corridor padding: 40% beyond start–end extent, min 0.012° (~1.3 km)
 *    per side, so detours stay within the loaded subgraph.
 */

import SQLite from 'react-native-sqlite-storage';
import type {SQLiteDatabase} from 'react-native-sqlite-storage';
import type {LatLng} from '../types';

SQLite.enablePromise(true);

// ── Types ─────────────────────────────────────────────────────────────────────

export type Subgraph = {
  nodes: Map<number, [number, number]>;          // id → [lon, lat]
  adjacency: Map<number, Array<[number, number]>>; // id → [[neighborId, meters]]
};

// ── Constants ─────────────────────────────────────────────────────────────────

/** Fractional expansion of the route bounding box in each direction. */
const CORRIDOR_PADDING = 0.4;

/**
 * Minimum padding per side in degrees (~1.3 km at Metro Manila latitude).
 * Ensures short routes still get a wide enough corridor.
 */
const MIN_PAD_DEG = 0.012;

// ── Singleton ─────────────────────────────────────────────────────────────────

let _db: SQLiteDatabase | null = null;
let _dbPath: string | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

const computeCorridorBbox = (from: LatLng, to: LatLng) => {
  const minLon = Math.min(from.longitude, to.longitude);
  const maxLon = Math.max(from.longitude, to.longitude);
  const minLat = Math.min(from.latitude, to.latitude);
  const maxLat = Math.max(from.latitude, to.latitude);
  const padLon = Math.max((maxLon - minLon) * CORRIDOR_PADDING, MIN_PAD_DEG);
  const padLat = Math.max((maxLat - minLat) * CORRIDOR_PADDING, MIN_PAD_DEG);
  return {
    minLon: minLon - padLon,
    maxLon: maxLon + padLon,
    minLat: minLat - padLat,
    maxLat: maxLat + padLat,
  };
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Opens the pedestrian graph SQLite DB from an absolute path.
 * Returns the singleton handle; safe to call multiple times.
 */
export const openGraphDb = async (absolutePath: string): Promise<SQLiteDatabase> => {
  if (_db && _dbPath === absolutePath) return _db;

  // Close stale handle if path changed
  if (_db) {
    try { await _db.close(); } catch { /* ignore */ }
    _db = null;
  }

  console.log(`[graphDb] Opening DB: ${absolutePath}`);
  _db = await SQLite.openDatabase({name: absolutePath, location: 'default'});
  _dbPath = absolutePath;
  console.log('[graphDb] DB opened successfully.');
  return _db;
};

/**
 * Queries the R-tree to load only the corridor subgraph between
 * `from` and `to`. Returns nodes + adjacency maps ready for A*.
 */
export const querySubgraph = async (
  db: SQLiteDatabase,
  from: LatLng,
  to: LatLng,
): Promise<Subgraph> => {
  const bbox = computeCorridorBbox(from, to);
  const {minLon, maxLon, minLat, maxLat} = bbox;

  console.log(
    `[graphDb] Corridor bbox: lon [${minLon.toFixed(4)}, ${maxLon.toFixed(4)}] ` +
    `lat [${minLat.toFixed(4)}, ${maxLat.toFixed(4)}]`,
  );

  const t0 = Date.now();

  // ── Nodes in corridor ──────────────────────────────────────────────────────
  const [nodeResults] = await db.executeSql(
    `SELECT id, lon, lat
     FROM   pg_nodes
     WHERE  lon BETWEEN ? AND ?
       AND  lat BETWEEN ? AND ?`,
    [minLon, maxLon, minLat, maxLat],
  );

  const nodes = new Map<number, [number, number]>();
  for (let i = 0; i < nodeResults.rows.length; i++) {
    const row = nodeResults.rows.item(i);
    nodes.set(row.id as number, [row.lon as number, row.lat as number]);
  }

  // ── Edges whose from-node is in corridor ───────────────────────────────────
  const [edgeResults] = await db.executeSql(
    `SELECT e.from_id, e.to_id, e.meters
     FROM   pg_edges e
     INNER JOIN pg_nodes n ON n.id = e.from_id
     WHERE  n.lon BETWEEN ? AND ?
       AND  n.lat BETWEEN ? AND ?`,
    [minLon, maxLon, minLat, maxLat],
  );

  const adjacency = new Map<number, Array<[number, number]>>();
  for (let i = 0; i < edgeResults.rows.length; i++) {
    const row = edgeResults.rows.item(i);
    const fromId = row.from_id as number;
    const toId   = row.to_id   as number;
    // Skip edges whose destination falls outside the corridor
    if (!nodes.has(toId)) continue;
    let edges = adjacency.get(fromId);
    if (!edges) { edges = []; adjacency.set(fromId, edges); }
    edges.push([toId, row.meters as number]);
  }

  const elapsed = Date.now() - t0;
  console.log(
    `[graphDb] Subgraph: ${nodes.size} nodes, ${adjacency.size} adjacency entries ` +
    `in ${elapsed} ms`,
  );

  return {nodes, adjacency};
};
