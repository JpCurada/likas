import RNFS from 'react-native-fs';
import {Platform} from 'react-native';
import {assetManager} from '../services/assetManager';

const MAP_TILES_ASSET_ID = 'map-tiles';
const MAP_GLYPHS_ASSET_ID = 'map-glyphs';

const SIDELOAD_DIR =
  Platform.OS === 'android' ? '/sdcard/likas' : RNFS.DocumentDirectoryPath;

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

const ensureAsset = async (
  assetId: string,
  filename: string,
): Promise<string> => {
  let path = await assetManager.getLocalPath(assetId);
  if (path) return path;
  path = await tryImportSideload(assetId, filename);
  if (path) return path;
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
