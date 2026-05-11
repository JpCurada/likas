import RNFS from 'react-native-fs';

/**
 * Ensures the offline map database (MBTiles) is extracted from the Android APK
 * to the physical device storage so that MapLibre's internal SQLite engine can read it.
 *
 * @returns The absolute `mbtiles://` URI for MapLibre
 */
export const prepareOfflineMap = async (): Promise<string> => {
  const assetName = 'custom/philippines-extract.mbtiles';
  const fileName = 'philippines-extract.mbtiles';
  const destPath = `${RNFS.DocumentDirectoryPath}/${fileName}`;

  try {
    const exists = await RNFS.exists(destPath);

    if (!exists) {
      if (__DEV__) console.log(`[OfflineMap] Copying ${assetName} from assets to: ${destPath}`);
      // Copy from Android assets/custom folder into physical storage
      await RNFS.copyFileAssets(assetName, destPath);
      if (__DEV__) console.log('[OfflineMap] Copy successful!');
    } else {
      if (__DEV__) console.log(`[OfflineMap] Map already exists at: ${destPath}`);
    }

    // MapLibre expects the absolute file path with the mbtiles:// scheme, with three slashes (mbtiles:///)
    const absolutePrefix = destPath.startsWith('/') ? 'mbtiles://' : 'mbtiles:///';
    return `${absolutePrefix}${destPath}`;
  } catch (error) {
    console.error('[OfflineMap] Error preparing offline map:', error);
    throw error;
  }
};
