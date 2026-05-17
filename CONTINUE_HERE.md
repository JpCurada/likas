# Where We Left Off — LIKAS Routing Graph

**Date:** 2026-05-17  
**Branch:** (check `git status`)

---

## What Was Done This Session

### ✅ Completed
1. **`MapTooltip.tsx`** — Added `onGetDirections` prop, removed the **Dismiss** button (X button in header handles close).
2. **`MapScreen.tsx`** — Added `handleGetDirections` that:
   - Fetches user location on-demand if not cached
   - Calls `routingService.route()` for A* walking route
   - **Falls back to a straight-line route** if `GraphNotLoadedError` is thrown (graph not installed)
3. **`ProfileScreen.tsx`** — Added **"Offline Data"** section card with:
   - Routing graph install status (Installed ✅ / Not installed)
   - **Sideload button** → reads `/sdcard/likas/pedestrian-graph.json` → registers via `assetManager.importFromPath`
4. **`scripts/generate-pedestrian-graph.mjs`** — Script to extract pedestrian graph from MBTiles (see below)
5. **`scripts/package.json`** + `scripts/node_modules/` — Pre-installed: `better-sqlite3`, `@mapbox/vector-tile`, `pbf`

---

## 🔴 BLOCKED — Graph Generator Not Working Yet

The script runs but extracts **0 nodes / 0 ways** from the MBTiles. Root cause is being debugged.

### What We Found
- MBTiles file: `Likas/assets/maps/philippines-extract.mbtiles` (500MB, maxzoom=14)
- **`Pbf` import issue** — must use `PbfLib.default ?? PbfLib` (ESM/CJS interop quirk)
- **Transportation layer exists** — confirmed in tile `col=13685, row=8840` at zoom=14
- **First feature found:** `{ class: 'bridge', brunnel: 'bridge' }` — `'bridge'` is NOT in `WALKABLE_CLASSES`

### What Needs Fixing

#### 1. Fix `Pbf` constructor import in the script
```js
// WRONG
const Pbf = require('pbf');
new Pbf(buf) // crashes

// CORRECT
const PbfLib = require('pbf');
const Pbf = PbfLib.default ?? PbfLib;
new Pbf(buf) // works
```

#### 2. Expand the tile bbox range slightly (+2 tiles padding on each edge)
The current computed range `x=13689..13707` should be `x=13685..13710`.

```js
// In generate-pedestrian-graph.mjs, change:
const [minX, minY, maxX, maxY] = [
  lonToTileX(BBOX[0], EXTRACT_ZOOM) - 2,   // pad left
  latToTileY(BBOX[3], EXTRACT_ZOOM) - 2,   // pad top
  lonToTileX(BBOX[2], EXTRACT_ZOOM) + 2,   // pad right
  latToTileY(BBOX[1], EXTRACT_ZOOM) + 2,   // pad bottom
];
```

#### 3. Audit actual `class` values in the transportation layer
The OpenMapTiles `transportation` layer uses different class values than raw OSM highway tags.

Run this probe first to see actual classes:
```bash
node -e "
const { createRequire } = require('module');
const req = createRequire(require.resolve('./scripts/package.json'));
const Database = req('better-sqlite3');
const { VectorTile } = req('@mapbox/vector-tile');
const PbfLib = req('pbf');
const Pbf = PbfLib.default ?? PbfLib;
const { gunzipSync } = require('zlib');
const db = new Database('Likas/assets/maps/philippines-extract.mbtiles', { readonly: true });
const tiles = db.prepare('SELECT tile_data FROM tiles WHERE zoom_level=14 AND tile_column BETWEEN 13685 AND 13710 AND tile_row BETWEEN 8840 AND 8890 LIMIT 50').all();
const classes = new Set();
for (const row of tiles) {
  let buf; try { buf = gunzipSync(row.tile_data); } catch { buf = row.tile_data; }
  const tile = new VectorTile(new Pbf(buf));
  const l = tile.layers.transportation;
  if (!l) continue;
  for (let i = 0; i < l.length; i++) classes.add(l.feature(i).properties.class);
}
console.log('Classes found:', [...classes]);
db.close();
"
```

Expected output will show classes like `'primary'`, `'secondary'`, `'path'`, `'service'`, `'track'` etc.  
Update `WALKABLE_CLASSES` in the script to match exactly what's found.

#### 4. After fixing, run the generator
```bash
node scripts/generate-pedestrian-graph.mjs
# Should produce scripts/pedestrian-graph.json (~20-60 MB)
```

#### 5. Sideload to device
```bash
adb push scripts/pedestrian-graph.json /sdcard/likas/pedestrian-graph.json
# Then in app: Profile → Offline Data → Sideload
```

---

## Current App Behavior (without graph)

- ✅ **Get Directions** works — shows **straight-line** route with haversine distance estimate
- ✅ Route banner shows distance + walking time
- ✅ Dismiss button removed, X button in tooltip header used instead
- ✅ Profile → Offline Data section shows graph install status

---

## Files Modified This Session

| File | Change |
|---|---|
| `src/components/MapTooltip.tsx` | Added `onGetDirections` prop, removed Dismiss button |
| `src/screens/MapScreen.tsx` | Added `handleGetDirections` with fallback routing |
| `src/screens/ProfileScreen.tsx` | Added Offline Data section with sideload UI |
| `scripts/generate-pedestrian-graph.mjs` | MBTiles extraction script (needs fixes above) |
| `scripts/package.json` | New — deps for generation script |
