# Asset Management Strategy

This directory serves as the **Single Source of Truth** for all shared assets (fonts, map tiles, and styles) used by the Likas mobile application.

## Directory Structure

- `fonts/`: Contains `.ttf` font files.
- `maps/`: Contains `.mbtiles` offline map tiles and `style.json` map styles.
- `glyphs/`: Contains Noto Sans PBF files for offline map labels (summoned via script).

## How it Works

React Native requires assets to be bundled into platform-specific native folders (`android/app/src/main/assets` and iOS Resources). To avoid manually managing these folders and duplicating files in version control, we use a linking workflow.

### 1. Source of Truth
All new assets must be added to **this folder** (`Likas/assets/`).

### 2. Linking
After adding or removing an asset, run the following command in the `Likas/` directory:

```bash
npm run link-assets
```

This tool performs the following:
- **Android**: Copies fonts to `assets/fonts` and other files to `assets/custom`.
- **iOS**: Links files to the Xcode project and updates `Info.plist` for fonts.

### 3. Version Control (Git)
To prevent repository bloat, the generated native asset folders and the raw glyph source are **ignored by Git** via the root `.gitignore`. Only the primary source files in `Likas/assets/` (excluding glyphs) are tracked.

## Adding New Assets

### Adding a Font
1. Drop the `.ttf` file into `Likas/assets/fonts/`.
2. Run `npm run link-assets`.
3. Use the font in your styles: `fontFamily: 'FontName'`.

### Map Glyphs (The "Summon" Workflow)

Glyphs are complex because they consist of thousands of small files. To keep the repository fast, we do not track them in Git.

**After cloning the repo or updating map labels:**
Run the following command to download missing glyphs and link them to Android:

```bash
npm run prepare-assets
```

**For iOS Linking:**
Because subdirectories must be preserved:
1.  Open `Likas/ios/Likas.xcworkspace` in Xcode.
2.  Drag the `Likas/assets/glyphs` folder into the file navigator.
3.  When prompted, select **"Create folder references"** (Blue folder icon).

Reference the files in your code using:
- **Android**: `asset://glyphs/{fontstack}/{range}.pbf`
- **iOS**: `glyphs/{fontstack}/{range}.pbf`

## Troubleshooting
If an asset is not appearing:
1. Re-run `npm run prepare-assets`.
2. Rebuild the app: `npm run android` or `npm run ios`.
