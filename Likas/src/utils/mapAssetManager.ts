import RNFS from 'react-native-fs';
import {Platform} from 'react-native';
import {assetManager, type ManifestAsset} from '../services/assetManager';

const MAP_TILES_ASSET_ID = 'map-tiles';
const MAP_GLYPHS_ASSET_ID = 'map-glyphs';
const PEDESTRIAN_GRAPH_ASSET_ID = 'pedestrian-graph';
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
  if (!(await RNFS.exists(source))) return null;
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
        console.log(`[OfflineMap] Extracting bundled APK asset: ${bundledAssetPath}`);
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
  let path = await assetManager.getLocalPath(assetId);
  if (path) return path;
  path = await tryImportSideload(assetId, filename);
  if (path) return path;
  const manifest = await assetManager.fetchManifest();
  const asset = manifest.assets[assetId];
  if (asset) {
    path = await tryExtractBundledAsset(assetId, asset);
    if (path) return path;
  }
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
  const manifest = await assetManager.fetchManifest();
  const asset = manifest.assets[MAP_TILES_ASSET_ID];
  if (!asset) {
    throw new MapAssetMissingError(MAP_TILES_ASSET_ID);
  }

  const destPath = await ensureAsset(MAP_TILES_ASSET_ID, asset.localFilename);
  const absolutePrefix = destPath.startsWith('/') ? 'mbtiles://' : 'mbtiles:///';
  return `${absolutePrefix}${destPath}`;
};

export const prepareFloodMap = async (): Promise<string> => {
  const ASSET_ID = 'flood-zones-mbtiles';
  const manifest = await assetManager.fetchManifest();
  const asset = manifest.assets[ASSET_ID];
  if (!asset) {
    throw new MapAssetMissingError(ASSET_ID);
  }

  const destPath = await ensureAsset(ASSET_ID, asset.localFilename);
  const absolutePrefix = destPath.startsWith('/') ? 'mbtiles://' : 'mbtiles:///';
  return `${absolutePrefix}${destPath}`;
};

/**
 * Returns a glyph URL pattern suitable for a MapLibre style.json `glyphs`
 * property. Falls back to bundled APK glyphs when nothing is installed and
 * no sideload archive exists.
 */
export const prepareGlyphs = async (): Promise<string> => {
  const manifest = await assetManager.fetchManifest();
  const asset = manifest.assets[MAP_GLYPHS_ASSET_ID];

  if (asset) {
    try {
      const installed = await ensureAsset(MAP_GLYPHS_ASSET_ID, asset.localFilename);
      const glyphDir = `${RNFS.DocumentDirectoryPath}/${asset.localSubdir}/extracted`;
      if (await RNFS.exists(glyphDir)) {
        return `file://${glyphDir}/{fontstack}/{range}.pbf`;
      }
      if (__DEV__) {
        console.log(
          `[OfflineMap] Glyph archive installed at ${installed} but not extracted; using bundled fallback`,
        );
      }
    } catch {
      // Fall through to bundled glyph path.
    }
  }

  return Platform.OS === 'android'
    ? 'asset://glyphs/{fontstack}/{range}.pbf'
    : 'glyphs/{fontstack}/{range}.pbf';
};

/**
 * Ensures the pedestrian routing graph is available in DocumentDirectoryPath
 * and registered in installed.json. Checks sideload dir first, then bundled
 * APK assets. Returns the absolute path on success, null if not available.
 * Does NOT throw — the routing service handles the missing-graph case.
 */
export const prepareGraph = async (): Promise<string | null> => {
  const manifest = await assetManager.fetchManifest();
  const asset = manifest.assets[PEDESTRIAN_GRAPH_ASSET_ID];
  if (!asset) return null;
  try {
    return await ensureAsset(PEDESTRIAN_GRAPH_ASSET_ID, asset.localFilename);
  } catch {
    return null;
  }
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
