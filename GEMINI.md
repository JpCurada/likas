# LIKAS Disaster Companion - Project Context

## Project Overview
LIKAS (Filipino for "nature" and "to evacuate") is an offline-first, AI-powered disaster companion mobile application designed for Filipino communities. It transforms a smartphone into a self-contained survival tool by bundling maps, evacuation centers, disaster protocols, and a quantized language model (Gemma 4) for on-device inference.

The project is currently in the **Design and Requirements phase**.

### Main Technologies (Planned)
- **Framework:** React Native (Android 10+ / iOS 15+)
- **On-device AI:** Gemma 4 E2B via Google AI Edge's LiteRT-LM (Custom JSI Native Module)
- **Maps:** MapLibre React Native (`@maplibre/maplibre-react-native`) with bundled MBTiles
- **Database:** SQLite (`react-native-sqlite-storage`) with R-tree for geospatial queries
- **STT:** `whisper.rn` (Whisper.cpp bindings) for offline voice input
- **State Management:** Zustand

## Directory Structure
- `docs/`: Core project documentation.
    - `PRD.md`: Product Requirement Document covering the vision, challenge, and solution overview.
    - `requirements.md`: Detailed functional/non-functional requirements and acceptance criteria.
    - `design.md`: Technical architecture, component interfaces, data models, and testing strategy.
    - `assets.md`: Technical guide for managing maps, fonts, and glyphs (Linking workflow).

## Core Mandates
1. **Zero Network Transmission:** All core features (AI, maps, routing) must function with zero network dependency.
2. **Authority Alignment:** All guidance must align with official protocols from NDRRMC, PAGASA, and PHIVOLCS.
3. **Accessibility:** Support for Filipino and English, high-contrast UI, and visual-first survival instructions.
4. **Performance:** App launch < 5s, AI response < 10s, and RAM usage < 3GB on minimum hardware (3GB RAM).

## Development Status
- [x] PRD Finalized
- [x] Requirements Specification
- [x] Technical Design
- [x] React Native Project Initialization
- [x] Unified Asset Management (Source of Truth established)
- [x] On-Demand Glyph Pipeline (Automated labels summoning)
- [ ] Onboarding Implementation (TODO)
- [ ] Dashboard Implementation (TODO)
- [ ] AI Integration via `llama.rn` + Gemma 4 E2B GGUF (TODO — see [roadmap_ai.md](./docs/roadmap_ai.md))
- [x] Offline Maps Foundation (Phase 1 & 2 completed - see [roadmap_maps.md](./docs/roadmap_maps.md))

