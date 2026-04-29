# LIKAS Disaster Companion

**LIKAS** (Filipino for "nature" and "to evacuate") is an offline-first, AI-powered disaster companion mobile application designed for Filipino communities. It transforms a smartphone into a self-contained survival tool, ensuring critical data—maps, evacuation centers, disaster protocols, and AI guidance—is available even when power grids and cell networks fail.

## Key Features

- **Offline-First AI Assistant:** Powered by **Gemma 4** via LiteRT-LM. Get context-aware survival guidance (NDRRMC, PAGASA, PHIVOLCS aligned) with zero network dependency.
- **Go-To Evacuation Routes:** Offline map rendering (MapLibre) and pedestrian routing to the nearest shelters, with a scoring system tailored to your family's needs (infants, elderly, pets, PWD).
- **Volcanic & Earthquake Guides:** Step-by-step protocols from PHIVOLCS, including ashfall zone overlays, fault line proximity warnings, and "Drop, Cover, and Hold On" visual guides.
- **Prep Zone:** Comprehensive checklists (Go-Bag essentials) and a First-Aid library with simple, icon-driven instructions for high-stress situations.
- **Emergency SOS:** A persistent one-tap button to format and send emergency SMS with your GPS coordinates to saved contacts.

## Technology Stack

- **Framework:** [Flutter](https://flutter.dev/) (Android 10+ / iOS 15+)
- **AI Engine:** [LiteRT-LM](https://ai.google.dev/edge/litert-lm) (formerly TensorFlow Lite LLM)
- **Model:** Gemma 4 E2B (4-bit quantized, ~2.58 GB)
- **Maps:** [MapLibre Native](https://maplibre.org/) with local MBTiles
- **Database:** SQLite with R-Tree extension for geospatial queries
- **State Management:** [Riverpod](https://riverpod.dev/)

## Project Structure

```text
├── docs/               # Core project documentation
│   ├── PRD.md          # Product Requirement Document
│   ├── requirements.md # Detailed functional/non-functional specs
│   └── design.md       # Technical architecture and data models
├── assets/             # (Planned) Bundled models, maps, and protocols
└── GEMINI.md           # AI instructional context
```

## Getting Started

Currently, the project is in the **Technical Design** phase.

### Prerequisites (Future)
- Flutter SDK (latest stable)
- 4GB available internal storage (for model and map assets)
- Android 10+ or iOS 15+ device with at least 3GB RAM

### Setup (Future)
1. Clone the repository.
2. Run `flutter pub get`.
3. Download and place the Gemma 4 `.litertlm` and Philippines `.mbtiles` in the `assets/` directory.
4. Run `flutter run`.

## Core Mandates

1. **Zero Network Dependency:** The app must be fully functional without internet access at runtime.
2. **Authority-First:** All advice must strictly follow official Philippine government protocols.
3. **Privacy:** User data, location history, and AI conversations are stored exclusively on-device.

---
*LIKAS: Your companion when calamity strikes the nation.*
