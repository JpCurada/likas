import RNFS from 'react-native-fs';
import {unzip} from 'react-native-zip-archive';
import devManifest from './manifest.dev.json'; // Cache buster

export type AssetKind = 'model' | 'mbtiles' | 'glyphs' | 'data';

export type ManifestAsset = {
  kind: AssetKind;
  version: string;
  url: string;
  sha256: string;
  size: number;
  required: boolean;
  localFilename: string;
  localSubdir: string;
};

export type Manifest = {
  manifestVersion: string;
  assets: Record<string, ManifestAsset>;
};

export type InstalledRecord = {
  id: string;
  version: string;
  sha256: string;
  installedAt: string;
  localPath: string;
};

export type InstalledIndex = {
  manifestVersion: string;
  records: Record<string, InstalledRecord>;
};

export type DownloadProgress = {
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
};

export type StorageCheck = {
  available: number;
  required: number;
  sufficient: boolean;
};

export class AssetDownloadError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AssetDownloadError';
  }
}

export class ChecksumMismatchError extends AssetDownloadError {
  constructor(public readonly expected: string, public readonly actual: string) {
    super(`SHA256 mismatch: expected ${expected}, got ${actual}`);
    this.name = 'ChecksumMismatchError';
  }
}

const INSTALLED_INDEX_PATH = `${RNFS.DocumentDirectoryPath}/installed.json`;
const STORAGE_SAFETY_MULTIPLIER = 1.2;
const PROGRESS_REPORT_INTERVAL_MS = 500;
const PLACEHOLDER_SHA = '0'.repeat(64);

const emptyIndex = (manifestVersion: string): InstalledIndex => ({
  manifestVersion,
  records: {},
});

const assetLocalPath = (asset: ManifestAsset): string =>
  `${RNFS.DocumentDirectoryPath}/${asset.localSubdir}/${asset.localFilename}`;

const getAsset = (manifest: Manifest, assetId: string): ManifestAsset => {
  const asset = manifest.assets[assetId];
  if (!asset) {
    throw new AssetDownloadError(`Unknown asset id: ${assetId}`);
  }
  return asset;
};

export const assetManager = {
  async fetchManifest(): Promise<Manifest> {
    return devManifest as Manifest;
  },

  async readInstalled(): Promise<InstalledIndex> {
    const manifest = await this.fetchManifest();
    if (!(await RNFS.exists(INSTALLED_INDEX_PATH))) {
      return emptyIndex(manifest.manifestVersion);
    }
    try {
      const raw = await RNFS.readFile(INSTALLED_INDEX_PATH, 'utf8');
      return JSON.parse(raw) as InstalledIndex;
    } catch {
      return emptyIndex(manifest.manifestVersion);
    }
  },

  async writeInstalled(index: InstalledIndex): Promise<void> {
    await RNFS.writeFile(INSTALLED_INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');
  },

  async isInstalled(assetId: string): Promise<boolean> {
    const index = await this.readInstalled();
    const record = index.records[assetId];
    if (!record) return false;
    return RNFS.exists(record.localPath);
  },

  async getLocalPath(assetId: string): Promise<string | null> {
    const index = await this.readInstalled();
    const record = index.records[assetId];
    if (!record) return null;
    return (await RNFS.exists(record.localPath)) ? record.localPath : null;
  },

  async checkStorage(requiredBytes: number): Promise<StorageCheck> {
    const info = await RNFS.getFSInfo();
    const required = Math.ceil(requiredBytes * STORAGE_SAFETY_MULTIPLIER);
    return {
      available: info.freeSpace,
      required,
      sufficient: info.freeSpace >= required,
    };
  },

  async verifyChecksum(filePath: string, expectedSha256: string): Promise<boolean> {
    if (expectedSha256.toLowerCase() === PLACEHOLDER_SHA) {
      if (__DEV__) {
        console.warn(
          `[assetManager] Skipping SHA verification for ${filePath} — manifest uses placeholder hash`,
        );
      }
      return true;
    }
    const actual = await RNFS.hash(filePath, 'sha256');
    return actual.toLowerCase() === expectedSha256.toLowerCase();
  },

  async downloadAsset(
    assetId: string,
    onProgress?: (p: DownloadProgress) => void,
  ): Promise<string> {
    const manifest = await this.fetchManifest();
    const asset = getAsset(manifest, assetId);

    const storage = await this.checkStorage(asset.size);
    if (!storage.sufficient) {
      throw new AssetDownloadError(
        `Insufficient storage: need ${storage.required} bytes, have ${storage.available}`,
      );
    }

    const finalPath = assetLocalPath(asset);
    const partialPath = `${finalPath}.partial`;
    const dir = `${RNFS.DocumentDirectoryPath}/${asset.localSubdir}`;
    await RNFS.mkdir(dir);

    let lastReportAt = 0;
    const result = await RNFS.downloadFile({
      fromUrl: asset.url,
      toFile: partialPath,
      background: true,
      discretionary: true,
      progressDivider: 1,
      progress: ({contentLength, bytesWritten}) => {
        if (!onProgress) return;
        const now = Date.now();
        if (now - lastReportAt < PROGRESS_REPORT_INTERVAL_MS) return;
        lastReportAt = now;
        const total = contentLength > 0 ? contentLength : asset.size;
        onProgress({
          bytesDownloaded: bytesWritten,
          totalBytes: total,
          percent: total > 0 ? bytesWritten / total : 0,
        });
      },
    }).promise;

    if (result.statusCode < 200 || result.statusCode >= 300) {
      await RNFS.unlink(partialPath).catch(() => {});
      throw new AssetDownloadError(`HTTP ${result.statusCode} downloading ${asset.url}`);
    }

    const matches = await this.verifyChecksum(partialPath, asset.sha256);
    if (!matches) {
      const actual = await RNFS.hash(partialPath, 'sha256');
      await RNFS.unlink(partialPath).catch(() => {});
      throw new ChecksumMismatchError(asset.sha256, actual);
    }

    if (await RNFS.exists(finalPath)) {
      await RNFS.unlink(finalPath);
    }
    await RNFS.moveFile(partialPath, finalPath);

    const index = await this.readInstalled();
    index.records[assetId] = {
      id: assetId,
      version: asset.version,
      sha256: asset.sha256,
      installedAt: new Date().toISOString(),
      localPath: finalPath,
    };
    index.manifestVersion = manifest.manifestVersion;
    await this.writeInstalled(index);

    return finalPath;
  },

  async importFromPath(assetId: string, sourcePath: string): Promise<string> {
    const manifest = await this.fetchManifest();
    const asset = getAsset(manifest, assetId);
    if (!(await RNFS.exists(sourcePath))) {
      throw new AssetDownloadError(`Sideload source not found: ${sourcePath}`);
    }
    const finalPath = assetLocalPath(asset);
    const dir = `${RNFS.DocumentDirectoryPath}/${asset.localSubdir}`;
    await RNFS.mkdir(dir);

    const matches = await this.verifyChecksum(sourcePath, asset.sha256);
    if (!matches) {
      const actual = await RNFS.hash(sourcePath, 'sha256');
      throw new ChecksumMismatchError(asset.sha256, actual);
    }

    if (await RNFS.exists(finalPath)) {
      await RNFS.unlink(finalPath);
    }
    await RNFS.copyFile(sourcePath, finalPath);

    const index = await this.readInstalled();
    index.records[assetId] = {
      id: assetId,
      version: asset.version,
      sha256: asset.sha256,
      installedAt: new Date().toISOString(),
      localPath: finalPath,
    };
    index.manifestVersion = manifest.manifestVersion;
    await this.writeInstalled(index);
    return finalPath;
  },

  async deleteAsset(assetId: string): Promise<void> {
    const index = await this.readInstalled();
    const record = index.records[assetId];
    if (!record) return;
    if (await RNFS.exists(record.localPath)) {
      await RNFS.unlink(record.localPath);
    }
    delete index.records[assetId];
    await this.writeInstalled(index);
  },

  /**
   * If the asset's localFilename ends in `.zip`, unzips it into an
   * `extracted/` subdirectory next to the archive file.
   * No-op for non-archive assets.
   */
  async decompressArchive(asset: ManifestAsset, archivePath: string): Promise<void> {
    if (!asset.localFilename.endsWith('.zip')) return;
    const extractDir = `${RNFS.DocumentDirectoryPath}/${asset.localSubdir}/extracted`;
    if (await RNFS.exists(extractDir)) {
      if (__DEV__) {
        console.log(`[assetManager] Archive already extracted at ${extractDir}`);
      }
      return;
    }
    await RNFS.mkdir(extractDir);
    if (__DEV__) {
      console.log(`[assetManager] Unzipping ${archivePath} → ${extractDir}`);
    }
    await unzip(archivePath, extractDir);
    if (__DEV__) {
      console.log(`[assetManager] ✅ Unzip complete: ${extractDir}`);
    }
  },
};
