# Asset Management & Deployment Strategy

This project uses a hybrid asset strategy to balance app size, performance, and the ability to update data without releasing new APKs.

## 🏗️ Asset Categories

1.  **Bundled Assets (Baked-in):** Small, critical files included in the APK.
    *   Fonts, UI Icons, Onboarding Data.
    *   **Scraped POIs:** Hospitals, schools, and multi-purpose halls are bundled in `src/data/scraped/` for instant offline access.
2.  **On-Demand Assets (Dynamic):** Large files downloaded during the "Setup" phase.
    *   **Map Tiles:** `philippines-extract.mbtiles` (~524MB).
    *   **Map Glyphs:** Noto Sans PBFs bundled as a `.zip` (~125MB).
    *   **Pedestrian Graph:** Routing database and JSON (~200MB).

---

## 🛠️ Developer Workflow

### 1. Preparation (Local)
If you are adding new fonts or refreshing the glyphs:
- **Fonts:** Add to `Likas/assets/fonts/` and run `npm run link-assets`.
- **Glyphs:** Run `npm run prepare-assets` to download PBFs from the CDN to your local machine.

### 2. Packaging for Deployment
When you are ready to update the assets for production users:
Run the packaging script in the root directory:
```bash
npm run package-assets
```
**What this does:**
*   Zips the local `assets/glyphs` into `noto-sans-v1.0.0.zip`.
*   Calculates the **SHA256 hash** and **file size** for all large assets.
*   **Updates `manifest.dev.json`** with these new values to ensure app-side verification succeeds.
*   Copies everything to the `scripts/assets/` staging folder.

### 3. CDN Upload (Production)
Likas uses **Cloudflare R2** (S3-compatible) to host large assets. 
1.  Navigate to `scripts/`.
2.  Ensure your `.env` has the correct R2 credentials.
3.  Run the upload script:
    ```bash
    python upload_to_cloudflare.py
    ```
This syncs the `scripts/assets/` folder to `s3://<bucket>/likas/`.

---

## 📱 App-Side Logic (`AssetManager`)

The app manages these files using `src/services/assetManager.ts` and `src/utils/mapAssetManager.ts`.

### Manifest System
The app first fetches `manifest.json` from the CDN. 
*   **Version Check:** If the CDN version is newer than the local version, the app prompts for an update.
*   **Verification:** Every download is verified against the `sha256` hash in the manifest.

### Archive Extraction
For assets like **Map Glyphs**, the app downloads a single `.zip` file to save bandwidth.
*   The `AssetManager` automatically detects the `.zip` extension.
*   It decompresses the archive into a local `extracted/` subdirectory.
*   The map engine then reads the files using `file:///.../extracted/{fontstack}/{range}.pbf`.

### Sideloading (Offline First)
For LGU or NGO deployments where internet is unavailable:
1.  Copy the large assets (`.mbtiles`, `.zip`, `.db`) to the phone's **Internal Storage** folder: `Android/data/com.likas/files/`.
2.  The app will detect these files on launch, verify their hashes, and "import" them into the app's private data folder automatically.

---

## 🔒 Version Control (Git)

To keep the repository fast and lean:
*   **LARGE FILES ARE IGNORED:** MBTiles, Zips, and DBs are in `.gitignore`.
*   **STAGING IS IGNORED:** The `scripts/assets/` folder is never committed.
*   **GIT LFS:** Use Git LFS only for files that *must* be tracked in the repository (e.g., small AI models or specific map style files).

## Troubleshooting

- **Map Labels Missing?** Check if `noto-sans-v1.0.0.zip` was successfully extracted in the app's `DocumentDirectory/glyphs/extracted`.
- **Download Failing?** Verify that the `sha256` in `manifest.json` matches the actual file on the CDN. Running `npm run package-assets` fixes this automatically.
- **Routing Not Working?** Ensure both `pedestrian-graph.json` and `pedestrian-graph.db` are present and verified in the manifest.
