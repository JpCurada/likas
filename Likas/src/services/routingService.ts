import RNFS from 'react-native-fs';
import {assetManager} from './assetManager';
import {getDistanceKm} from './evacuationService';
import type {LatLng} from '../types';

const GRAPH_ASSET_ID = 'pedestrian-graph';

type GraphFile = {
  bbox: [number, number, number, number];
  nodes: Record<string, [number, number]>;
  adjacency: Record<string, Array<[number, number]>>;
  meta?: Record<string, unknown>;
};

type LoadedGraph = {
  bbox: [number, number, number, number];
  nodes: Map<number, [number, number]>;
  adjacency: Map<number, Array<[number, number]>>;
  grid: Map<string, number[]>;
};

export type RouteResult = {
  polyline: LatLng[];
  distanceMeters: number;
  durationMinutesWalking: number;
};

export class GraphNotLoadedError extends Error {
  constructor() {
    super(
      'Pedestrian routing graph is not installed. Download it from Setup or sideload to /sdcard/likas/.',
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

const WALKING_MPS = 1.167; // 4.2 km/h, matches evacuationService
const GRID_CELL_DEG = 0.005; // ~500m, used for nearest-node lookup
const MAX_SNAP_METERS = 1500; // refuse to route if you're >1.5km from any walkable way

let cached: LoadedGraph | null = null;
let loadPromise: Promise<LoadedGraph | null> | null = null;

const haversineMeters = (a: [number, number], b: [number, number]): number =>
  getDistanceKm(
    {latitude: a[1], longitude: a[0]},
    {latitude: b[1], longitude: b[0]},
  ) * 1000;

const cellKey = (lon: number, lat: number): string => {
  const cx = Math.floor(lon / GRID_CELL_DEG);
  const cy = Math.floor(lat / GRID_CELL_DEG);
  return `${cx}:${cy}`;
};

const buildGrid = (
  nodes: Map<number, [number, number]>,
): Map<string, number[]> => {
  const grid = new Map<string, number[]>();
  for (const [id, [lon, lat]] of nodes.entries()) {
    const key = cellKey(lon, lat);
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(id);
  }
  return grid;
};

const loadGraph = async (): Promise<LoadedGraph | null> => {
  if (cached) return cached;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const localPath = await assetManager.getLocalPath(GRAPH_ASSET_ID);
    if (!localPath) return null;
    try {
      const raw = await RNFS.readFile(localPath, 'utf8');
      const parsed = JSON.parse(raw) as GraphFile;
      const nodes = new Map<number, [number, number]>();
      for (const [k, v] of Object.entries(parsed.nodes)) {
        nodes.set(Number(k), v);
      }
      const adjacency = new Map<number, Array<[number, number]>>();
      for (const [k, edges] of Object.entries(parsed.adjacency)) {
        adjacency.set(
          Number(k),
          edges.map(([nb, m]) => [Number(nb), m]),
        );
      }
      cached = {
        bbox: parsed.bbox,
        nodes,
        adjacency,
        grid: buildGrid(nodes),
      };
      return cached;
    } catch (err) {
      console.warn('[routingService] failed to load graph:', err);
      return null;
    } finally {
      loadPromise = null;
    }
  })();
  return loadPromise;
};

const findNearestNode = (
  graph: LoadedGraph,
  lon: number,
  lat: number,
): {id: number; meters: number} | null => {
  // Search the cell containing the point + 1-cell ring (≈1.5km radius). Expand
  // if nothing found, capped at MAX_SNAP_METERS.
  const cx = Math.floor(lon / GRID_CELL_DEG);
  const cy = Math.floor(lat / GRID_CELL_DEG);
  const target: [number, number] = [lon, lat];
  let bestId = -1;
  let bestMeters = Infinity;

  for (let ring = 0; ring <= 4; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (
          ring > 0 &&
          Math.abs(dx) !== ring &&
          Math.abs(dy) !== ring
        )
          continue;
        const bucket = graph.grid.get(`${cx + dx}:${cy + dy}`);
        if (!bucket) continue;
        for (const id of bucket) {
          const coord = graph.nodes.get(id)!;
          const meters = haversineMeters(target, coord);
          if (meters < bestMeters) {
            bestMeters = meters;
            bestId = id;
          }
        }
      }
    }
    if (bestId !== -1 && bestMeters < (ring + 1) * 500) break;
  }

  if (bestId === -1 || bestMeters > MAX_SNAP_METERS) return null;
  return {id: bestId, meters: bestMeters};
};

// Binary-heap priority queue keyed by f-score.
class MinHeap {
  private heap: Array<{id: number; f: number}> = [];

  size(): number {
    return this.heap.length;
  }

  push(item: {id: number; f: number}): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): {id: number; f: number} | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
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

const aStar = (
  graph: LoadedGraph,
  startId: number,
  goalId: number,
): {path: number[]; distanceMeters: number} | null => {
  if (startId === goalId) return {path: [startId], distanceMeters: 0};

  const goalCoord = graph.nodes.get(goalId)!;
  const heuristic = (id: number): number =>
    haversineMeters(graph.nodes.get(id)!, goalCoord);

  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();

  gScore.set(startId, 0);
  open.push({id: startId, f: heuristic(startId)});

  while (open.size() > 0) {
    const current = open.pop()!;
    if (closed.has(current.id)) continue;
    if (current.id === goalId) {
      // Reconstruct
      const path: number[] = [goalId];
      let cur = goalId;
      while (cameFrom.has(cur)) {
        cur = cameFrom.get(cur)!;
        path.push(cur);
      }
      path.reverse();
      return {path, distanceMeters: gScore.get(goalId) ?? 0};
    }
    closed.add(current.id);

    const neighbors = graph.adjacency.get(current.id);
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

export const routingService = {
  isReady: async (): Promise<boolean> => {
    if (cached) return true;
    return assetManager.isInstalled(GRAPH_ASSET_ID);
  },

  /**
   * Compute a walking route between two LatLngs. Throws GraphNotLoadedError if
   * the graph asset isn't installed, NoRouteError if the points snap but no
   * walkable path connects them.
   */
  route: async (from: LatLng, to: LatLng): Promise<RouteResult> => {
    const graph = await loadGraph();
    if (!graph) throw new GraphNotLoadedError();

    const start = findNearestNode(graph, from.longitude, from.latitude);
    const goal = findNearestNode(graph, to.longitude, to.latitude);
    if (!start || !goal) throw new NoRouteError();

    const result = aStar(graph, start.id, goal.id);
    if (!result) throw new NoRouteError();

    // Build polyline: start point -> snapped start -> path nodes -> snapped goal -> end point.
    const polyline: LatLng[] = [
      from,
      ...result.path.map(id => {
        const [lon, lat] = graph.nodes.get(id)!;
        return {latitude: lat, longitude: lon};
      }),
      to,
    ];

    const totalMeters =
      result.distanceMeters + start.meters + goal.meters;
    return {
      polyline,
      distanceMeters: totalMeters,
      durationMinutesWalking: Math.ceil(totalMeters / WALKING_MPS / 60),
    };
  },
};
