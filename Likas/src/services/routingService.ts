/**
 * routingService.ts
 *
 * Provides offline pedestrian A* routing backed by a SQLite graph DB.
 *
 * Flow per route() call:
 *   1. Resolve DB path from assetManager (installed.json)
 *   2. Open singleton SQLite connection (instant after first open)
 *   3. Query corridor subgraph: R-tree bbox → ~15–20k nodes & edges
 *   4. Snap origin & destination to nearest subgraph nodes
 *   5. A* on the in-memory subgraph
 *   6. Return polyline + distance + walking time
 *
 * Falls back to GraphNotLoadedError if the DB isn't installed, which
 * MapScreen catches and falls back to a straight-line estimate.
 */

import {assetManager} from './assetManager';
import {getDistanceKm} from './evacuationService';
import {openGraphDb, querySubgraph, RouteTooLongError} from './graphDb';
import type {LatLng} from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const GRAPH_DB_ASSET_ID = 'pedestrian-graph-db';
const WALKING_MPS       = 1.167;  // 4.2 km/h
const MAX_SNAP_METERS   = 1500;   // refuse to route if >1.5 km from any road

// ── Error classes ─────────────────────────────────────────────────────────────

export class GraphNotLoadedError extends Error {
  constructor() {
    super(
      'Pedestrian routing graph is not installed. ' +
      'Sideload pedestrian-graph.db to /sdcard/Android/data/com.likas/files/',
    );
    this.name = 'GraphNotLoadedError';
  }
}

export class NoRouteError extends Error {
  constructor() {
    super('No walkable route found between those points.');
    this.name = 'NoRouteError';
  }
}

// Re-exported so callers catch all routing failure modes from one module.
export {RouteTooLongError};

// ── Result type ───────────────────────────────────────────────────────────────

export type RouteResult = {
  polyline: LatLng[];
  distanceMeters: number;
  durationMinutesWalking: number;
};

// ── Haversine ─────────────────────────────────────────────────────────────────

const haversineMeters = (a: [number, number], b: [number, number]): number =>
  getDistanceKm(
    {latitude: a[1], longitude: a[0]},
    {latitude: b[1], longitude: b[0]},
  ) * 1000;

// ── Nearest-node (linear scan on subgraph) ────────────────────────────────────

const findNearestNode = (
  nodes: Map<number, [number, number]>,
  lon: number,
  lat: number,
): {id: number; meters: number} | null => {
  const target: [number, number] = [lon, lat];
  let bestId     = -1;
  let bestMeters = Infinity;

  for (const [id, coord] of nodes.entries()) {
    const m = haversineMeters(target, coord);
    if (m < bestMeters) { bestMeters = m; bestId = id; }
  }

  if (bestId === -1 || bestMeters > MAX_SNAP_METERS) return null;
  return {id: bestId, meters: bestMeters};
};

// ── Min-heap (unchanged from original) ───────────────────────────────────────

class MinHeap {
  private heap: Array<{id: number; f: number}> = [];

  size(): number { return this.heap.length; }

  push(item: {id: number; f: number}): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): {id: number; f: number} | undefined {
    if (this.heap.length === 0) return undefined;
    const top  = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) { this.heap[0] = last; this.sinkDown(0); }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      // eslint-disable-next-line no-bitwise
      const parent = (i - 1) >> 1;
      if (this.heap[i].f < this.heap[parent].f) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
        i = parent;
      } else break;
    }
  }

  private sinkDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      const l = i * 2 + 1;
      const r = i * 2 + 2;
      let smallest = i;
      if (l < n && this.heap[l].f < this.heap[smallest].f) smallest = l;
      if (r < n && this.heap[r].f < this.heap[smallest].f) smallest = r;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}

// ── A* ────────────────────────────────────────────────────────────────────────

const aStar = (
  nodes: Map<number, [number, number]>,
  adjacency: Map<number, Array<[number, number]>>,
  startId: number,
  goalId: number,
): {path: number[]; distanceMeters: number} | null => {
  if (startId === goalId) return {path: [startId], distanceMeters: 0};

  const goalCoord  = nodes.get(goalId)!;
  const heuristic  = (id: number): number =>
    haversineMeters(nodes.get(id)!, goalCoord);

  const gScore  = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const closed  = new Set<number>();
  const open    = new MinHeap();

  gScore.set(startId, 0);
  open.push({id: startId, f: heuristic(startId)});

  while (open.size() > 0) {
    const current = open.pop()!;
    if (closed.has(current.id)) continue;
    if (current.id === goalId) {
      const path: number[] = [goalId];
      let cur = goalId;
      while (cameFrom.has(cur)) { cur = cameFrom.get(cur)!; path.push(cur); }
      path.reverse();
      return {path, distanceMeters: gScore.get(goalId) ?? 0};
    }
    closed.add(current.id);

    const neighbors = adjacency.get(current.id);
    if (!neighbors) continue;
    const curG = gScore.get(current.id) ?? Infinity;
    for (const [nbId, edgeMeters] of neighbors) {
      if (closed.has(nbId)) continue;
      const tentative = curG + edgeMeters;
      if (tentative < (gScore.get(nbId) ?? Infinity)) {
        cameFrom.set(nbId, current.id);
        gScore.set(nbId, tentative);
        open.push({id: nbId, f: tentative + heuristic(nbId)});
      }
    }
  }
  return null;
};

// ── Public service ────────────────────────────────────────────────────────────

export const routingService = {
  isReady: async (): Promise<boolean> =>
    assetManager.isInstalled(GRAPH_DB_ASSET_ID),

  /**
   * Compute a walking route between two LatLngs using the SQLite graph DB.
   * Throws GraphNotLoadedError if the DB isn't installed,
   * NoRouteError if the points snap but no walkable path connects them.
   */
  route: async (from: LatLng, to: LatLng, signal?: AbortSignal): Promise<RouteResult> => {
    console.log(
      `[routingService] route() — from (${from.latitude.toFixed(5)}, ${from.longitude.toFixed(5)})` +
      ` to (${to.latitude.toFixed(5)}, ${to.longitude.toFixed(5)})`,
    );

    if (signal?.aborted) throw new Error('Aborted');

    // ── 1. Resolve DB path ──────────────────────────────────────────────────
    const dbPath = await assetManager.getLocalPath(GRAPH_DB_ASSET_ID);
    if (!dbPath) {
      console.warn('[routingService] ❌ DB not registered — throwing GraphNotLoadedError.');
      throw new GraphNotLoadedError();
    }

    if (signal?.aborted) throw new Error('Aborted');

    // ── 2. Open singleton connection ────────────────────────────────────────
    const db = await openGraphDb(dbPath);

    if (signal?.aborted) throw new Error('Aborted');

    // ── 3. Load corridor subgraph ───────────────────────────────────────────
    const {nodes, adjacency} = await querySubgraph(db, from, to);
    if (nodes.size === 0) {
      console.warn('[routingService] ❌ Subgraph is empty — corridor may be outside DB bbox.');
      throw new NoRouteError();
    }

    if (signal?.aborted) throw new Error('Aborted');

    // ── 4. Snap to nearest graph nodes ──────────────────────────────────────
    const start = findNearestNode(nodes, from.longitude, from.latitude);
    const goal  = findNearestNode(nodes, to.longitude,   to.latitude);
    if (!start || !goal) {
      console.warn(
        `[routingService] ❌ Snap failed. start=${JSON.stringify(start)}, goal=${JSON.stringify(goal)}`,
      );
      throw new NoRouteError();
    }
    console.log(
      `[routingService] Snapped origin → node ${start.id} (${start.meters.toFixed(0)} m), ` +
      `dest → node ${goal.id} (${goal.meters.toFixed(0)} m). Running A*...`,
    );

    if (signal?.aborted) throw new Error('Aborted');

    // ── 5. A* ───────────────────────────────────────────────────────────────
    const result = aStar(nodes, adjacency, start.id, goal.id);
    if (!result) {
      console.warn('[routingService] ❌ A* found no path in subgraph.');
      throw new NoRouteError();
    }
    console.log(
      `[routingService] ✅ Route found — ${result.path.length} nodes, ` +
      `${(result.distanceMeters / 1000).toFixed(2)} km graph distance.`,
    );

    if (signal?.aborted) throw new Error('Aborted');

    // ── 6. Build polyline & return ──────────────────────────────────────────
    const polyline: LatLng[] = [
      from,
      ...result.path.map(id => {
        const [lon, lat] = nodes.get(id)!;
        return {latitude: lat, longitude: lon};
      }),
      to,
    ];

    const totalMeters = result.distanceMeters + start.meters + goal.meters;
    console.log(
      `[routingService] Total: ${(totalMeters / 1000).toFixed(2)} km, ` +
      `~${Math.ceil(totalMeters / WALKING_MPS / 60)} min walk.`,
    );
    return {
      polyline,
      distanceMeters: totalMeters,
      durationMinutesWalking: Math.ceil(totalMeters / WALKING_MPS / 60),
    };
  },
};
