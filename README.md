# LIKAS Disaster Companion

**LIKAS** (Filipino for "nature" and "to evacuate") is an offline-first, AI-powered disaster companion mobile application designed for Filipino communities. It transforms a smartphone into a self-contained survival tool, ensuring critical data—maps, evacuation centers, disaster protocols, and AI guidance—is available even when power grids and cell networks fail.

## Key Features

- **Offline-First AI Assistant:** Powered by **Gemma 4 E2B** running locally via `llama.rn` (`llama.cpp` bindings for React Native). Output is constrained by a GBNF grammar so the model can call in-process tools — `get_protocol`, `route_to_nearest_evacuation`, `find_nearby`, `get_user_profile` — quoting NDRRMC/PAGASA/PHIVOLCS protocol text verbatim with zero network dependency.
- **Go-To Evacuation Routes:** Offline map rendering (MapLibre) and (planned) pedestrian routing to the nearest shelters, with a scoring system tailored to your family's needs (infants, elderly, pets, PWD).
- **Volcanic & Earthquake Guides:** Step-by-step protocols sourced from PHIVOLCS/NDRRMC, surfaced both via the AI assistant and bundled JSON. Fault-line and ashfall overlays are on the roadmap.
- **Prep Zone:** Checklists (Go-Bag essentials, pet needs, home prep) with locally persisted progress, plus a First-Aid library with simple, icon-driven instructions.
- **Emergency SOS (planned):** A one-tap button to format and send emergency SMS with GPS coordinates to saved contacts.

## Technology Stack

- **Framework:** [React Native](https://reactnative.dev/) (Android 10+ / iOS 15+)
- **AI Engine:** [`llama.rn`](https://github.com/mybigday/llama.rn) (React Native bindings for `llama.cpp`)
- **Model:** Gemma 4 E2B instruction-tuned, Q4_K_XL GGUF (~3.2 GB; `unsloth/gemma-4-E2B-it-GGUF`)
- **Maps:** [MapLibre React Native](https://github.com/maplibre/maplibre-react-native) with self-generated MBTiles (Planetiler over Geofabrik OSM)
- **Persistence:** AsyncStorage today; SQLite + R-tree is the planned target for spatial queries
- **STT:** [`whisper.rn`](https://github.com/mybigday/whisper.rn) for offline voice input
- **State Management:** [Zustand](https://github.com/pmndrs/zustand)

## Project Structure

```text
├── docs/               # Core project documentation (PRD, requirements, design, roadmap, assets guide)
├── Likas/              # React Native app source — run all npm commands here
│   ├── assets/         # Source of truth: fonts, maps, glyphs, protocols, POI GeoJSON
│   ├── scripts/        # download-fonts.js, generate-map.js
│   └── src/            # Screens, services, hooks, stores, components
├── GEMINI.md           # AI instructional context (status checklist + mandates)
└── CLAUDE.md           # Claude Code instructions (commands, architecture, mandates)
```

## Getting Started

### Prerequisites
- Node.js >= 22.11.0 (see `Likas/package.json` engines) and React Native CLI
- Android 10+ or iOS 15+ device with at least 3 GB RAM and ~4 GB free storage (model + map assets)
- For map generation: Java (bundled with Android Studio) and ~4 GB of free RAM

### Setup
1. Clone the repository.
2. From `Likas/`, run `npm install`.
3. Run `npm run generate-map` to build the Philippines MBTiles from Geofabrik OSM data (one-time, requires Java).
4. Run `npm run prepare-assets` to download Noto Sans glyph PBFs and link assets to the native projects.
5. Run `npm run android` or `npm run ios`.
6. On first launch, complete the in-app Setup screen — it downloads the Gemma 4 E2B GGUF (~3.2 GB) and any remaining map assets. After Setup, all features work offline.

## Core Mandates

1. **Zero Network Dependency:** The app must be fully functional without internet access at runtime.
2. **Authority-First:** All advice must strictly follow official Philippine government protocols.
3. **Privacy:** User data, location history, and AI conversations are stored exclusively on-device.

---
*LIKAS: Your companion when calamity strikes the nation.*
