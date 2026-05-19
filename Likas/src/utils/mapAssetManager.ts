import RNFS from 'react-native-fs';
import {Platform} from 'react-native';
import {assetManager, type ManifestAsset} from '../services/assetManager';

const MAP_TILES_ASSET_ID = 'map-tiles';
const PEDESTRIAN_GRAPH_DB_ASSET_ID = 'pedestrian-graph-db';

const SIDELOAD_DIR =
  Platform.OS === 'android' ? RNFS.ExternalDirectoryPath : RNFS.DocumentDirectoryPath;

const sideloadPath = (filename: string): string =>
  `${SIDELOAD_DIR}/${filename}`;

export class MapAssetMissingError extends Error {
  constructor(public readonly assetId: string) {
    super(`Map asset not installed: ${assetId}`);
    this.name = 'MapAssetMissingError';
  }
}

const tryImportSideload = async (
  assetId: string,
  filename: string,
): Promise<string | null> => {
  const source = sideloadPath(filename);
  const exists = await RNFS.exists(source);
  if (__DEV__) {
    console.log(
      `[OfflineMap] tryImportSideload(${assetId}) — source=${source} exists=${exists}`,
    );
  }
  if (!exists) return null;
  try {
    if (__DEV__) console.log(`[OfflineMap] Importing sideload ${source}`);
    return await assetManager.importFromPath(assetId, source);
  } catch (error) {
    if (__DEV__) console.warn(`[OfflineMap] Sideload import failed:`, error);
    return null;
  }
};

/**
 * Copies the file out of the APK / iOS bundle into DocumentDirectoryPath and
 * registers it in installed.json so subsequent launches are instant.
 */
const tryExtractBundledAsset = async (
  assetId: string,
  asset: ManifestAsset,
): Promise<string | null> => {
  const finalPath = `${RNFS.DocumentDirectoryPath}/${asset.localSubdir}/${asset.localFilename}`;
  const dir = `${RNFS.DocumentDirectoryPath}/${asset.localSubdir}`;

  try {
    if (Platform.OS === 'android') {
      // Bundled at android/app/src/main/assets/custom/<filename>
      const bundledAssetPath = `custom/${asset.localFilename}`;
      if (__DEV__) {
        console.log(
          `[OfflineMap] tryExtractBundledAsset(${assetId}) — attempting copyFileAssets("${bundledAssetPath}" → "${finalPath}")`,
        );
      }
      await RNFS.mkdir(dir);
      await RNFS.copyFileAssets(bundledAssetPath, finalPath);
    } else {
      // iOS: file is in the main bundle root
      const bundledPath = `${RNFS.MainBundlePath}/${asset.localFilename}`;
      if (!(await RNFS.exists(bundledPath))) return null;
      if (__DEV__) {
        console.log(`[OfflineMap] Extracting bundled iOS asset: ${bundledPath}`);
      }
      await RNFS.mkdir(dir);
      await RNFS.copyFile(bundledPath, finalPath);
    }

    // Register in installed.json so next launch skips this copy
    const index = await assetManager.readInstalled();
    index.records[assetId] = {
      id: assetId,
      version: asset.version,
      sha256: asset.sha256,
      installedAt: new Date().toISOString(),
      localPath: finalPath,
    };
    const manifest = await assetManager.fetchManifest();
    index.manifestVersion = manifest.manifestVersion;
    await assetManager.writeInstalled(index);

    // Auto-extract if it's a .zip archive (e.g. glyphs bundle)
    await assetManager.decompressArchive(asset, finalPath);

    if (__DEV__) {
      console.log(`[OfflineMap] ✅ Bundled asset extracted to ${finalPath}`);
    }
    return finalPath;
  } catch (error) {
    if (__DEV__) console.warn(`[OfflineMap] Bundled asset extraction failed:`, error);
    return null;
  }
};

const ensureAsset = async (
  assetId: string,
  filename: string,
): Promise<string> => {
  if (__DEV__) console.log(`[OfflineMap] ensureAsset(${assetId}) — checking installed.json`);
  let path = await assetManager.getLocalPath(assetId);
  if (path) {
    if (__DEV__) console.log(`[OfflineMap] ensureAsset(${assetId}) — found locally at ${path}`);
    return path;
  }
  if (__DEV__) console.log(`[OfflineMap] ensureAsset(${assetId}) — not installed, trying sideload`);
  path = await tryImportSideload(assetId, filename);
  if (path) {
    if (__DEV__) console.log(`[OfflineMap] ensureAsset(${assetId}) — sideload succeeded → ${path}`);
    return path;
  }
  if (__DEV__) console.log(`[OfflineMap] ensureAsset(${assetId}) — no sideload, checking bundle`);
  const manifest = await assetManager.fetchManifest();
  const asset = manifest.assets[assetId];
  if (asset) {
    path = await tryExtractBundledAsset(assetId, asset);
    if (path) {
      if (__DEV__) console.log(`[OfflineMap] ensureAsset(${assetId}) — bundled extract succeeded → ${path}`);
      return path;
    }
  }
  if (__DEV__) console.warn(`[OfflineMap] ensureAsset(${assetId}) — exhausted all sources, throwing MapAssetMissingError`);
  throw new MapAssetMissingError(assetId);
};

export const isOfflineMapReady = async (): Promise<boolean> => {
  const tiles = await assetManager.isInstalled(MAP_TILES_ASSET_ID);
  if (tiles) return true;
  const manifest = await assetManager.fetchManifest();
  const asset = manifest.assets[MAP_TILES_ASSET_ID];
  if (!asset) return false;
  const sideload = sideloadPath(asset.localFilename);
  return RNFS.exists(sideload);
};

/**
 * Returns the absolute mbtiles:// URI for MapLibre. Resolves from CDN-downloaded
 * file in DocumentDirectoryPath, with a fallback to an SD-card sideload path
 * for offline-install scenarios documented for LGU/NGO deployments.
 */
export const prepareOfflineMap = async (): Promise<string> => {
  const t0 = Date.now();
  if (__DEV__) console.log('[OfflineMap] prepareOfflineMap → fetching manifest');
  const manifest = await assetManager.fetchManifest();
  if (__DEV__) {
    console.log(
      `[OfflineMap] prepareOfflineMap → manifest fetched in ${Date.now() - t0} ms (version ${manifest.manifestVersion})`,
    );
  }
  const asset = manifest.assets[MAP_TILES_ASSET_ID];
  if (!asset) {
    if (__DEV__) console.warn(`[OfflineMap] prepareOfflineMap → manifest has no '${MAP_TILES_ASSET_ID}' entry`);
    throw new MapAssetMissingError(MAP_TILES_ASSET_ID);
  }

  const destPath = await ensureAsset(MAP_TILES_ASSET_ID, asset.localFilename);
  const absolutePrefix = destPath.startsWith('/') ? 'mbtiles://' : 'mbtiles:///';
  const url = `${absolutePrefix}${destPath}`;
  if (__DEV__) {
    console.log(
      `[OfflineMap] prepareOfflineMap → ${url}  (total ${Date.now() - t0} ms)`,
    );
  }
  return url;
};

/**
 * Returns a glyph URL pattern suitable for a MapLibre style.json `glyphs`
 * property. Glyphs are bundled into the APK at build time by
 * `npm run bundle-glyphs` (which copies Likas/assets/glyphs/* into
 * android/app/src/main/assets/glyphs/), so MapLibre reads them via the
 * `asset://` scheme. No download or unzip is performed at runtime, which
 * guarantees offline-first map text rendering and avoids the EACCES
 * errors we previously hit unzipping directory names containing spaces
 * (e.g. "Noto Sans Bold") on Android.
 *
 * iOS note: this expects the `glyphs` folder to be added to the Xcode
 * project as a folder reference (blue folder icon) so the nested
 * fontstack subdirectories survive bundling. See bundle-glyphs script
 * documentation.
 */
export const prepareGlyphs = async (): Promise<string> => {
  return Platform.OS === 'android'
    ? 'asset://glyphs/{fontstack}/{range}.pbf'
    : 'glyphs/{fontstack}/{range}.pbf';
};


/**
 * Ensures the pedestrian routing SQLite DB is available in DocumentDirectoryPath
 * and registered in installed.json. Checks sideload dir first, then bundled APK.
 * Returns the absolute path on success, null if not available.
 * Does NOT throw — the routing service handles the missing-graph case.
 */
export const prepareGraphDb = async (): Promise<string | null> => {
  const manifest = await assetManager.fetchManifest();
  const asset = manifest.assets[PEDESTRIAN_GRAPH_DB_ASSET_ID];
  if (!asset) return null;
  try {
    const p = await ensureAsset(PEDESTRIAN_GRAPH_DB_ASSET_ID, asset.localFilename);
    if (__DEV__) console.log('[mapAssetManager] Pedestrian graph DB ready:', p);
    return p;
  } catch {
    if (__DEV__) console.log('[mapAssetManager] Pedestrian graph DB not installed.');
    return null;
  }
};
