import evacuationData from '../data/scraped/evacuation.json';
import hospitalData from '../data/scraped/hospital.json';
import gymnasiumData from '../data/scraped/gymnasium.json';
import schoolData from '../data/scraped/school.json';
import multiPurposeData from '../data/scraped/multi_purpose.json';
import coveredCourtData from '../data/scraped/covered_court.json';
import type {EvacuationCenter, EvacuationType} from '../types';

// ─── Address builder ──────────────────────────────────────────────────────────

const buildAddress = (addr: any): string => {
  if (!addr) return '';
  const parts = [
    addr.road,
    addr.neighbourhood,
    addr.suburb,
    addr.village || addr.hamlet || addr.quarter,
    addr.town || addr.city,
    addr.state,
  ].filter(Boolean);
  return parts.join(', ');
};

// ─── GeoJSON builders ─────────────────────────────────────────────────────────

export const getEvacuationGeoJSON = () => {
  const features = (evacuationData as any[])
    .filter(item => item.lat && item.lon)
    .map(item => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(item.lon), parseFloat(item.lat)],
      },
      properties: {
        id: item.place_id,
        name: item.name || item.display_name,
        type: item.type,
        category: item.category,
        address: buildAddress(item.address),
        city: item.address?.city || item.address?.town || item.address?.village || '',
        capacity: item.extratags?.['capacity:persons'] || '',
        hazard: item.extratags?.['emergency:hazard_type'] || '',
        operator: item.extratags?.operator || '',
        pointType: 'evacuation',
      },
    }));

  if (__DEV__) console.log(`[geoUtils] Evacuation centers: ${features.length}`);
  return { type: 'FeatureCollection', features };
};

export const getHospitalGeoJSON = () => {
  const features = (hospitalData as any[])
    .filter(item => item.lat && item.lon)
    .map(item => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(item.lon), parseFloat(item.lat)],
      },
      properties: {
        id: item.place_id,
        name: item.name || item.display_name,
        type: item.type,
        category: item.category,
        address: buildAddress(item.address),
        city: item.address?.city || item.address?.town || item.address?.village || '',
        operator: item.extratags?.operator || item.extratags?.['operator:type'] || '',
        emergency: item.extratags?.emergency || '',
        pointType: 'hospital',
      },
    }));

  if (__DEV__) console.log(`[geoUtils] Hospitals: ${features.length}`);
  return { type: 'FeatureCollection', features };
};

export const getGymnasiumGeoJSON = () => {
  const features = (gymnasiumData as any[])
    .filter(item => item.lat && item.lon)
    .map(item => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(item.lon), parseFloat(item.lat)],
      },
      properties: {
        id: item.place_id,
        name: item.name || item.display_name,
        type: item.type,
        category: item.category,
        address: buildAddress(item.address),
        city: item.address?.city || item.address?.town || item.address?.village || '',
        facility: item.extratags?.['emergency:social_facility'] || '',
        pointType: 'gymnasium',
      },
    }));

  if (__DEV__) console.log(`[geoUtils] Gymnasiums/Sports Centers: ${features.length}`);
  return { type: 'FeatureCollection', features };
};

export const getSchoolGeoJSON = () => {
  const features = (schoolData as any[])
    .filter(item => item.lat && item.lon)
    .map(item => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(item.lon), parseFloat(item.lat)],
      },
      properties: {
        id: item.place_id,
        name: item.name || item.display_name,
        type: item.type,
        category: item.category,
        address: buildAddress(item.address),
        city: item.address?.city || item.address?.town || item.address?.village || '',
        facility: item.extratags?.['emergency:social_facility'] || '',
        pointType: 'school',
      },
    }));

  if (__DEV__) console.log(`[geoUtils] Schools: ${features.length}`);
  return { type: 'FeatureCollection', features };
};

export const getMultiPurposeGeoJSON = () => {
  const features = (multiPurposeData as any[])
    .filter(item => item.lat && item.lon)
    .map(item => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(item.lon), parseFloat(item.lat)],
      },
      properties: {
        id: item.place_id,
        name: item.name || item.display_name,
        type: item.type,
        category: item.category,
        address: buildAddress(item.address),
        city: item.address?.city || item.address?.town || item.address?.village || '',
        facility: item.extratags?.['emergency:social_facility'] || '',
        pointType: 'multipurpose',
      },
    }));

  if (__DEV__) console.log(`[geoUtils] Multi-Purpose Halls: ${features.length}`);
  return { type: 'FeatureCollection', features };
};

export const getCoveredCourtGeoJSON = () => {
  const features = (coveredCourtData as any[])
    .filter(item => item.lat && item.lon)
    .map(item => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(item.lon), parseFloat(item.lat)],
      },
      properties: {
        id: item.place_id,
        name: item.name || item.display_name,
        type: item.type,
        category: item.category,
        address: buildAddress(item.address),
        city: item.address?.city || item.address?.town || item.address?.village || '',
        facility: item.extratags?.['emergency:social_facility'] || '',
        pointType: 'covered_court',
      },
    }));

  if (__DEV__) console.log(`[geoUtils] Covered Courts: ${features.length}`);
  return { type: 'FeatureCollection', features };
};
  
// ─── Distance Utilities ───────────────────────────────────────────────────────

/**
 * Calculates the distance between two coordinates in meters using the Haversine formula.
 */
export const getDistance = (lon1: number, lat1: number, lon2: number, lat2: number): number => {
  const R = 6371e3; // Earth radius in meters
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// ─── Evacuation center adapter (scraped OSM → EvacuationCenter) ───────────────

// OSM "capacity:persons" is free text: "250", "100-250", "approx 500".
// Take the largest number found; 0 means unknown (ranking treats it neutrally).
const parseCapacity = (raw: unknown): number => {
  if (raw == null) return 0;
  const nums = String(raw).match(/\d+/g);
  if (!nums) return 0;
  return Math.max(...nums.map(Number));
};

const ALL_EVAC_TYPES: EvacuationType[] = [
  'typhoon',
  'flood',
  'volcano',
  'earthquake',
];

// OSM "emergency:hazard_type" is ";"-delimited: "flood;earthquake;landslide".
// Map to our EvacuationType union; unknown/empty ⇒ assume usable for all.
const parseDisasterTypes = (raw: unknown): EvacuationType[] => {
  if (!raw) return [...ALL_EVAC_TYPES];
  const tokens = String(raw)
    .toLowerCase()
    .split(/[;,]/)
    .map(t => t.trim());
  const out = new Set<EvacuationType>();
  for (const t of tokens) {
    if (t.includes('flood')) out.add('flood');
    if (t.includes('earthquake') || t.includes('seismic')) out.add('earthquake');
    if (t.includes('volcan') || t.includes('ashfall') || t.includes('lahar'))
      out.add('volcano');
    if (t.includes('typhoon') || t.includes('storm') || t.includes('wind'))
      out.add('typhoon');
  }
  return out.size > 0 ? [...out] : [...ALL_EVAC_TYPES];
};

const toEvacuationCenter = (
  item: any,
  facilityType: string,
): EvacuationCenter | null => {
  const lat = parseFloat(item.lat);
  const lon = parseFloat(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const ex = item.extratags ?? {};
  const wheelchair = String(ex.wheelchair ?? '').toLowerCase();

  return {
    id: String(item.place_id ?? item.osm_id ?? `${lat},${lon}`),
    name: item.name || item.display_name || 'Unnamed evacuation site',
    address: buildAddress(item.address),
    latitude: lat,
    longitude: lon,
    capacity: parseCapacity(ex['capacity:persons']),
    facilityType,
    disasterTypes: parseDisasterTypes(ex['emergency:hazard_type']),
    isPwdFriendly: wheelchair === 'yes' || wheelchair === 'limited',
    isPetFriendly: false, // OSM has no reliable pet-friendly tag for shelters
  };
};

/**
 * The full nationwide evacuation-shelter universe from scraped OSM data:
 * dedicated evacuation centers plus the facility types that double as
 * real-world shelters (gyms, multi-purpose halls, covered courts). Schools and
 * hospitals are intentionally excluded — schools are too numerous and not all
 * are designated shelters; hospitals are surfaced via `find_nearby` instead.
 *
 * Not geo-clipped: distance ranking in evacuationService naturally excludes
 * far POIs per query, so this works anywhere in the Philippines rather than
 * only the Metro Manila pedestrian-graph footprint.
 *
 * This is the AI's evacuation data source (via evacuationService), replacing
 * the former 4-entry hardcoded seed list so `route_to_nearest_evacuation`
 * ranks against real nationwide coverage.
 */
let evacuationCache: EvacuationCenter[] | null = null;

export const getEvacuationCenters = (): EvacuationCenter[] => {
  if (evacuationCache) return evacuationCache;
  const sources: Array<[any[], string]> = [
    [evacuationData as any[], 'Evacuation Center'],
    [gymnasiumData as any[], 'Gymnasium'],
    [multiPurposeData as any[], 'Multi-Purpose Hall'],
    [coveredCourtData as any[], 'Covered Court'],
  ];
  const centers: EvacuationCenter[] = [];
  for (const [data, label] of sources) {
    for (const item of data) {
      const c = toEvacuationCenter(item, label);
      if (c) centers.push(c);
    }
  }
  if (__DEV__) {
    console.log(
      `[geoUtils] Evacuation universe (PH-wide): ${centers.length} sites`,
    );
  }
  evacuationCache = centers;
  return centers;
};

// ─── Spatial grid index ───────────────────────────────────────────────────────

// Cell size in degrees (~11 km at PH latitudes). A "nearest shelter" query
// only scans cells overlapping the origin's radius bbox instead of all ~2k
// rows — a coarse R-tree substitute with zero native deps or DB I/O.
const GRID_DEG = 0.1;

const cellKey = (lat: number, lon: number): string =>
  `${Math.floor(lat / GRID_DEG)}:${Math.floor(lon / GRID_DEG)}`;

let evacuationGrid: Map<string, EvacuationCenter[]> | null = null;

const getEvacuationGrid = (): Map<string, EvacuationCenter[]> => {
  if (evacuationGrid) return evacuationGrid;
  const grid = new Map<string, EvacuationCenter[]>();
  for (const c of getEvacuationCenters()) {
    const key = cellKey(c.latitude, c.longitude);
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(c);
  }
  evacuationGrid = grid;
  return grid;
};

/**
 * Returns only the shelters within ~radiusKm of the origin, using the grid
 * index so we touch a handful of candidates instead of the full nationwide
 * set. Caller still does precise Haversine ranking on this short list.
 *
 * Falls back to the full set if the origin's neighbourhood is empty (e.g. a
 * remote area with no nearby tagged shelters) so ranking never returns nothing
 * just because the radius was too tight.
 */
export const queryNearbyEvacuationCenters = (
  originLat: number,
  originLon: number,
  radiusKm = 15,
): EvacuationCenter[] => {
  const grid = getEvacuationGrid();
  // Degrees of latitude per km is ~constant; longitude shrinks with latitude.
  const latPad = radiusKm / 111;
  const lonPad =
    radiusKm / (111 * Math.cos((originLat * Math.PI) / 180) || 1);

  const minCellLat = Math.floor((originLat - latPad) / GRID_DEG);
  const maxCellLat = Math.floor((originLat + latPad) / GRID_DEG);
  const minCellLon = Math.floor((originLon - lonPad) / GRID_DEG);
  const maxCellLon = Math.floor((originLon + lonPad) / GRID_DEG);

  const out: EvacuationCenter[] = [];
  for (let cy = minCellLat; cy <= maxCellLat; cy++) {
    for (let cx = minCellLon; cx <= maxCellLon; cx++) {
      const bucket = grid.get(`${cy}:${cx}`);
      if (bucket) out.push(...bucket);
    }
  }

  if (out.length === 0) {
    if (__DEV__) {
      console.log(
        '[geoUtils] No shelters within radius; falling back to full set.',
      );
    }
    return getEvacuationCenters();
  }
  return out;
};

/**
 * Finds the nearest feature from an array of features to a given coordinate.
 */
export const getNearestFeature = (
  userLon: number,
  userLat: number,
  features: any[],
) => {
  if (!features || features.length === 0) return null;
  
  let nearest = null;
  let minDistance = Infinity;

  for (const feature of features) {
    if (!feature.geometry || !feature.geometry.coordinates) continue;
    const [lon, lat] = feature.geometry.coordinates;
    const distance = getDistance(userLon, userLat, lon, lat);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = { ...feature, distance };
    }
  }
  return nearest;
};
