# Roadmap: Offline Maps Integration

This document outlines the strategic implementation plan for the offline mapping capabilities of LIKAS. All mapping features are designed for **Zero Network Transmission** using MapLibre and bundled MBTiles.

## Phase 1: Foundation & Asset Pipeline
*Goal: Establish the ability to render vector tiles from the local filesystem with zero network calls.*

- [x] **MapLibre v11 Integration**: Initialize `@maplibre/maplibre-react-native` with native module configuration.
- [x] **MBTiles Generation Script**: Implement `generate-map.js` using Planetiler to convert `.osm.pbf` to `.mbtiles`.
- [x] **Unified Asset Management**: Standardized `Likas/assets/` as the single source of truth for fonts, maps, and glyphs.
- [x] **On-Demand Glyph Pipeline**: Implemented `npm run prepare-assets` to summon ~2,000 map label PBFs while keeping the repo clean.
- [x] **Offline Asset Manager**: Create `mapAssetManager.ts` to handle the extraction of large map files from Android APK assets to internal storage.
- [x] **Local Style Definition**: Configure `style.json` to reference the `mbtiles://` source and handle platform-specific offline glyph paths.

## Phase 2: Core Map Features (Current)
*Goal: Provide a functional 2D/3D navigation experience for Metro Manila.*

- [x] **2D/3D Toggle Implementation**: Dynamic building extrusion and camera pitch/bearing transitions.
- [x] **Locked Zone Overlay**: Visual boundary restricting map interaction to Metro Manila (current dataset scope).
- [x] **Interactive POI Layers**: Basic GeoJSON rendering for Evacuation Centers and Hospitals.
- [x] **Bottom Sheet Tooltips**: Implement `MapTooltip.tsx` for displaying detailed center information on tap.
- [x] **Native Storage Optimization**: Implement logic to verify checksums before re-extracting map assets to save device life.

## Phase 3: Data & Authority Alignment
*Goal: Move from mock/utility data to official NDRRMC/PHIVOLCS/PAGASA datasets.*

- [x] **SQLite R-Tree Integration**: Migrate POIs from static files to a local SQLite database for fast spatial queries.
- [x] **Fault Line Overlay**: Integrate PHIVOLCS Active Fault Line geospatial data as a toggleable layer.
- [ ] **Hazard Zone Polygons**: Implement flood hazard (PAGASA) and ashfall projection (PHIVOLCS) overlays on the map.
- [ ] **Authority Attribution**: Ensure every POI and hazard layer clearly displays its official source and last update timestamp.

## Phase 4: Advanced Offline Intelligence
*Goal: Integrate mapping with AI and routing to provide life-saving guidance.*

- [ ] **Offline Routing Engine**: Implement a pre-computed pedestrian routing graph using a Dijkstra-based approach.
- [ ] **Hazard-Aware Pathfinding**: Logic to calculate routes that automatically avoid active flood or ashfall zones.
- [x] **AI Map Integration**: Connected the Gemma 4 assistant to the mapping service with manual "Reroute" capability to nearest evacuation centers.
- [ ] **Android App Bundle (AAB) Assets**: Implement Play Asset Delivery for the "Entire Philippines" map pack (~250MB) to bypass the 150MB APK limit.

---
*Last Updated: 2026-05-11*
