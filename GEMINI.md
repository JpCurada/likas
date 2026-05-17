# LIKAS Disaster Companion - Project Context

## Project Overview
LIKAS (Filipino for "nature" and "to evacuate") is an offline-first, AI-powered disaster companion mobile application designed for Filipino communities. It transforms a smartphone into a self-contained survival tool with bundled maps, evacuation centers, disaster protocols, and an on-device Gemma 4 E2B language model for conversational guidance.

The project is in **active implementation**: onboarding, maps, AI assistant, STT, and asset pipeline are functional; SQLite migration, hazard overlays, and SMS SOS remain outstanding.

### Main Technologies
- **Framework:** React Native (Android 10+ / iOS 15+)
- **On-device AI:** Gemma 4 E2B (Q4_K_XL GGUF) via [`llama.rn`](https://github.com/mybigday/llama.rn) — `llama.cpp` bindings for React Native. Output is constrained by a GBNF grammar over a JSON envelope so the model can call in-process tools (`get_protocol`, `route_to_nearest_evacuation`, `find_nearby`, `get_user_profile`).
- **Maps:** MapLibre React Native (`@maplibre/maplibre-react-native`) with self-generated MBTiles (Planetiler over Geofabrik OSM extracts)
- **Persistence:** AsyncStorage today; SQLite + R-tree is the planned target for spatial queries
- **STT:** `whisper.rn` (Whisper.cpp bindings) for offline voice input
- **State Management:** Zustand

## Directory Structure
- `Likas/`: React Native app source (all `npm` commands run from here)
- `docs/`: Core project documentation.
    - `PRD.md`: Product Requirement Document covering the vision, challenge, and solution overview.
    - `requirements.md`: Detailed functional/non-functional requirements and acceptance criteria.
    - `design.md`: Technical architecture, component interfaces, data models, and testing strategy.
    - `assets.md`: Technical guide for managing maps, fonts, and glyphs (linking + summon workflow).
    - `roadmap_maps.md`: Phased plan for the offline mapping stack.

## Core Mandates
1. **Zero Network at Runtime:** No HTTP in product code paths. Network is permitted only during user-initiated build scripts and the first-run Setup screen (downloads MBTiles, glyph PBFs, Gemma 4 GGUF).
2. **Authority Alignment:** All guidance must align with official protocols from NDRRMC, PAGASA, and PHIVOLCS. The AI quotes `assets/protocols/*.json` verbatim via `get_protocol`.
3. **Privacy:** User profile, location, and chat history stay on-device. No telemetry, no analytics.
4. **Accessibility:** Filipino, English, and Taglish support; high-contrast UI; visual-first survival instructions.
5. **Performance:** App launch < 5s, AI response < 10s (greetings short-circuited to < 100 ms), RAM < 3 GB on minimum hardware.

## Development Status
- [x] PRD Finalized
- [x] Requirements Specification
- [x] Technical Design
- [x] React Native Project Initialization
- [x] Unified Asset Management (source of truth in `Likas/assets/`)
- [x] On-Demand Glyph Pipeline (`npm run prepare-assets`)
- [x] 5-step Onboarding + Profile persistence (AsyncStorage)
- [x] Offline Maps Foundation — Phase 1 & 2 (MapLibre, MBTiles, Metro Manila POIs, 2D/3D toggle) — see [roadmap_maps.md](./docs/roadmap_maps.md)
- [x] AI Assistant via `llama.rn` + Gemma 4 E2B GGUF (grammar-constrained JSON, tool dispatch loop, fallback responder, UI tool-call trail)
- [x] Asset Manager + first-run Setup screen (downloads MBTiles + Gemma 4 GGUF)
- [x] Whisper-based STT (`whisper.rn`)
- [ ] Pedestrian routing graph asset (service stub exists, graph not yet provisioned)
- [ ] SQLite + R-tree migration
- [ ] Fault-line and ashfall hazard overlays
- [ ] Emergency SMS SOS

