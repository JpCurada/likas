# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

The repo root holds documentation only. The React Native app lives in the **`Likas/`** subdirectory — all `npm` commands, builds, and edits to application code happen from there, not the repo root.

```
likas/
├── docs/           # PRD, requirements, design, assets, roadmap_maps
├── GEMINI.md       # AI instructional context (mirrors README intent)
└── Likas/          # React Native app (Android + iOS)
    ├── assets/     # Source of truth: fonts/, maps/, glyphs/ (glyphs gitignored)
    ├── scripts/    # download-fonts.js, generate-map.js
    └── src/        # Application source
```

## Commands

All commands run from `Likas/`.

| Task | Command |
|---|---|
| Install deps | `npm install` |
| Start Metro | `npm start` |
| Run Android | `npm run android` |
| Run iOS | `npm run ios` |
| Lint | `npm run lint` |
| Tests (all) | `npm test` |
| Single test | `npx jest path/to/file.test.tsx` or `npx jest -t "test name"` |
| Link assets to native | `npm run link-assets` |
| Download glyphs + link | `npm run prepare-assets` |
| Regenerate MBTiles | `npm run generate-map` (needs Java + ~4GB RAM) |

Node `>= 22.11.0` required (see `package.json` engines).

## Asset Pipeline (Important)

This is the most non-obvious part of the codebase. Read [docs/assets.md](docs/assets.md) before touching anything in `Likas/assets/` or native asset folders.

- **`Likas/assets/`** is the **single source of truth** for fonts, MBTiles, and glyphs. Never edit `android/app/src/main/assets/` directly — it is generated and gitignored.
- After adding/removing any asset, run `npm run link-assets` (wraps `react-native-asset`). On Android, fonts go to `assets/fonts/` and everything else lands in `assets/custom/` — this is why `mapAssetManager.ts` reads from `custom/philippines-extract.mbtiles`.
- **Glyphs are not committed.** After cloning or pulling map-label changes, run `npm run prepare-assets` to summon ~2,000 Noto Sans PBFs from the OpenMapTiles CDN.
- **Map data is not committed** (`.mbtiles`, `*.osm.pbf`, `planetiler.jar` are gitignored). `npm run generate-map` downloads the Philippines OSM extract from Geofabrik and runs Planetiler to produce `philippines-extract.mbtiles`.
- iOS glyph linking is manual — drag `Likas/assets/glyphs` into Xcode as a **folder reference** (blue), not a group.

MBTiles are accessed at runtime via the `mbtiles://` scheme; `mapAssetManager.prepareOfflineMap()` copies the file out of the APK into `DocumentDirectoryPath` on first launch so MapLibre's internal SQLite can read it.

## Architecture

**Offline-first by mandate.** No ambient HTTP client; every feature (AI, maps, routing, protocols) must work with zero network access at runtime. The only exceptions are user-initiated build-time scripts (asset downloads).

### Layers

- **UI** — React Native screens under `src/screens/` (Onboarding, Home, Chat, Prep, Map, Profile), bottom-tab + stack navigator in `src/navigation/AppNavigator.tsx`. Onboarding gate routes to `Main` only after `isOnboardingComplete()` resolves true.
- **State** — Zustand store at `src/stores/appStore.ts` (active disaster context, profile, packed-item checklist, chat messages). Note: the in-memory `UserProfile` shape in `appStore.ts` is older/simpler than the persisted `UserProfile` in `src/database/storage.ts` — the latter is canonical for onboarding flows.
- **Services** — `src/services/` houses domain logic (`aiAssistantService`, `evacuationService`, `emergencyService`). These are the contracts that will eventually wrap the JSI LiteRT-LM module; today they are mostly typed stubs/mocks.
- **Persistence** — Currently **AsyncStorage** (`src/database/storage.ts`) for profile, onboarding flag, and prep checklist. The design doc specifies SQLite + R-tree as the target; treat that as planned, not implemented.
- **Data** — Static GeoJSON for POIs (evacuation centers, hospitals, schools, gyms, multi-purpose halls, covered courts) lives under `src/data/scraped/`. Loaded synchronously via `src/utils/geoUtils.ts`.

### Map Screen

`src/screens/MapScreen.tsx` consumes the bundled `assets/maps/style.json`, clones it at render time, and rewrites every `symbol` layer's `text-font` to `['Noto Sans Regular']` to match the on-device glyph stack. The same routine toggles `building-2d` / `building-3d` layer visibility for the 2D/3D switch. Camera is bounded to a Metro Manila bbox.

### Theming

`src/theme.ts` exports `COLORS`, `FONTS`, `SIZES`. Fonts are `Sora-*` (primary) and `Clinton-*` (secondary); both families must be present in `Likas/assets/fonts/` and linked before running the app, otherwise text falls back to system defaults.

### Icons

Use the `Icon` component from `src/components/Icon.tsx` (wraps `react-native-vector-icons` MaterialCommunity + Ionicons). Per past cleanup, the codebase uses this uniform icon system instead of emojis — don't reintroduce emojis in UI.

## Core Mandates (from docs/)

Treat these as hard constraints when proposing changes:

1. **Zero network at runtime** — no fetch/axios in product code paths. Network is only acceptable in `scripts/` (build-time asset prep).
2. **Authority-first content** — survival/safety text must align with NDRRMC, PAGASA, PHIVOLCS. Don't invent protocol steps.
3. **Privacy** — user profile, location, chat history stay on-device. No telemetry, no analytics SDKs.
4. **Performance budgets** — app launch < 5s, AI response < 10s, RAM < 3GB on 3GB-RAM devices, dashboard "big button" first-step render < 500ms.

## Status / What's Real vs. Planned

When reading [docs/design.md](docs/design.md), keep in mind it describes the **target** architecture. Current implementation reality:

- On-device LLM: **not yet integrated** (services are stubs). Plan switched from LiteRT-LM JSI to `llama.rn` + Gemma 4 E2B GGUF — see [docs/roadmap_ai.md](docs/roadmap_ai.md).
- SQLite + R-tree: **not yet integrated** (AsyncStorage is in use).
- MapLibre + offline MBTiles + 2D/3D + Metro Manila POIs: **implemented**.
- Onboarding (5-step flow), Profile screen, prep checklist persistence: **implemented**.
- Routing graph, fault-line overlay, ashfall overlay, SMS SOS: **not yet implemented**.

See [docs/roadmap_maps.md](docs/roadmap_maps.md) and the status checklist in [GEMINI.md](GEMINI.md) for the up-to-date state.
