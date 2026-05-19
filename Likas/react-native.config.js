// Assets that ship inside the APK / iOS main bundle via `npx
// react-native-asset`. Explicit file paths only — wildcard directories
// would sweep in the 500 MB Philippines MBTiles extract and the 130 MB
// pedestrian-graph DB, both of which are CDN-downloaded at first launch
// and must NOT bloat the install.
//
// Bundled here:
// - Fonts: Sora + Clinton families (UI typography).
// - Map style + small flood overlay: needed offline from boot.
//
// NOTE: Map glyphs (Noto Sans, ~100 MB) are NOT linked via this config
// because react-native-asset doesn't recurse into nested subdirectories
// (the glyphs live under "Noto Sans Bold/", "Noto Sans Italic/", etc.
// with literal spaces in folder names). They are copied directly into
// android/app/src/main/assets/glyphs/ by `npm run bundle-glyphs`, and
// MapLibre reads them via the `asset://glyphs/{fontstack}/{range}.pbf`
// URL pattern set in src/utils/mapAssetManager.ts. For iOS, glyphs need
// to be added to the Xcode project as a folder reference (blue folder)
// so the nested directory structure is preserved at runtime.
module.exports = {
  assets: [
    './assets/fonts/',
    './assets/maps/style.json',
    './assets/maps/flood_zones.mbtiles',
  ],
};
