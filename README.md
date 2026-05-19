# LIKAS Disaster Companion

**LIKAS** (Filipino for "nature" — and also "to evacuate") is an offline-first, AI-powered disaster companion for Filipino communities. It turns a smartphone into a self-contained survival tool: maps, evacuation centers, a pedestrian routing graph, official disaster protocols, and a fine-tuned on-device language model are all bundled at install time. **Zero network calls at runtime — by mandate, not as a fallback.**

> Built for the **Global Resilience** track. A working proof-of-concept, not a mockup — see [`docs/kaggle-writeup.md`](docs/kaggle-writeup.md) for the full technical story.

## Key Features

- **Offline AI Assistant:** A fine-tuned **Gemma 4 E2B** model running fully on-device via `llama.cpp` (`llama.rn`). It does not free-form safety advice — it acts as a grammar-constrained tool dispatcher that routes every safety-critical query to grounded, authority-sourced data (NDRRMC / PAGASA / PHIVOLCS).
- **Profile-Aware Evacuation Routing:** Offline MapLibre rendering plus Dijkstra routing over a pre-computed OSM pedestrian graph. A weighted scorer ranks centers by `distance·0.4 + pwd·0.3 + pet·0.2 + capacity·0.1`, personalized to your household (infants, elderly, PWD, pets).
- **Verbatim Protocols:** Step-by-step earthquake, typhoon, and volcano guidance quoted *verbatim* from official sources — the model is forbidden from inventing safety steps.
- **Offline POI Search:** Find the nearest hospital, school, gym, covered court, or multi-purpose hall from bundled OSM data, with pins dropped on the map.
- **Emergency SOS:** One-tap formatting and sending of an emergency SMS with GPS coordinates to saved contacts (user-initiated only).
- **Resilient by design:** If the model can't load or the battery is below 15%, a deterministic keyword router still resolves evacuation and POI queries against the on-device data.

## Technology Stack

- **Framework:** [React Native](https://reactnative.dev/) 0.85 (Android / iOS)
- **AI Engine:** [`llama.rn`](https://github.com/mybigday/llama.rn) `^0.12.0` — the full `llama.cpp` engine in-process, no server
- **Model:** Gemma 4 E2B, LoRA fine-tuned with Unsloth, quantized to **Q4_K_M GGUF (~1.8 GB)**
- **Decoding:** GBNF grammar built from the live tool registry (`aiGrammar.ts`); locked low sampling (`temperature 0.4`)
- **Maps:** [MapLibre React Native](https://github.com/maplibre/maplibre-react-native) with local tiles + a pre-computed pedestrian graph
- **State:** [Zustand](https://github.com/pmndrs/zustand)

> **Note:** The original design doc specified Google AI Edge's LiteRT-LM behind a custom JSI module. Stabilizing quantized Gemma 4 across Android and iOS proved cleaner on `llama.cpp`, so the project pivoted to `llama.rn` + Q4_K_M GGUF. The tool-dispatcher, grammar, and system prompt were runtime-agnostic by construction, so the swap touched zero application logic. See Challenge 3 in the writeup.

## Project Structure

```text
├── Likas/              # React Native app
│   ├── src/services/   # AI dispatch loop, grammar, tools, evacuation/routing
│   ├── src/utils/      # Geo/grid spatial helpers
│   ├── assets/         # Bundled protocols, scraped OSM POIs, map + graph data
│   └── scripts/        # Dataset builders (build_dataset_v4.py), asset generators
├── notebooks/          # Fine-tuning, GGUF export, sample-prompt reproduction
├── docs/               # kaggle-writeup.md and project documentation
└── scripts/            # Asset upload / pedestrian-graph generation tooling
```

## Getting Started

The app lives in [`Likas/`](Likas/) — see [`Likas/README.md`](Likas/README.md) for build instructions.

```sh
cd Likas
npm install
npm run prepare-assets   # link bundled maps/fonts to the native projects
npm run android          # or: npm run ios
```

The Gemma 4 GGUF model is downloaded in-app from Setup; it is not committed to the repo.

## Core Mandates

1. **Zero Network Dependency:** Fully functional with no internet at runtime — there is no ambient HTTP client in the product path.
2. **Authority-First:** All safety advice is fetched from official Philippine government protocols, never recalled from model parameters.
3. **Privacy:** User data, location, and AI conversations are stored exclusively on-device.

## Project Links

| Resource | Link |
|---|---|
| Source Code | https://github.com/JpCurada/likas |
| Training Dataset | https://www.kaggle.com/datasets/jeypiic/likas-ai-datasets/ |
| Fine-Tuning Notebook (Unsloth) | https://www.kaggle.com/code/jeypiic/likas-fine-tuning-gemma-4-e2b-with-unsloth |
| GGUF Export Notebook | https://www.kaggle.com/code/jeypiic/likas-with-llama-ccp-llama-rn-gguf-export |
| Sample Prompts Notebook | https://www.kaggle.com/code/jeypiic/likas-sample-prompts-for-the-fine-tuned-model |
| Fine-Tuned Model (GGUF) | https://huggingface.co/jpcurada/likas-gemma4-e2b-gguf |
| LoRA Adapter | https://huggingface.co/jpcurada/likas-gemma4-e2b-lora |

---
*LIKAS: Your companion when calamity strikes the nation.*
