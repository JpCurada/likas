/**
 * download-fonts.js
 *
 * Downloads Noto Sans glyph PBF files from the OpenMapTiles font CDN
 * and saves them into the shared assets directory and optionally
 * copies them to the Android native assets directory.
 *
 * Usage:  node scripts/download-fonts.js [--link-android]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── Configuration ────────────────────────────────────────────────────────────
const FONT_CDN = 'https://demotiles.maplibre.org/font';

// The three font stacks referenced in style.json and MapScreen.tsx
const FONT_STACKS = [
  'Noto Sans Regular',
  'Noto Sans Bold',
  'Noto Sans Italic',
];

// Glyph ranges: each range covers 256 Unicode code-points (0-255, 256-511, …)
const RANGES = [];
for (let start = 0; start <= 65280; start += 256) {
  RANGES.push(`${start}-${start + 255}`);
}

// Source of truth (shared assets)
const SHARED_ASSETS_DIR = path.join(__dirname, '..', 'assets', 'glyphs');

// Destination for Android native assets
const ANDROID_ASSETS_DIR = path.join(
  __dirname,
  '..',
  'android',
  'app',
  'src',
  'main',
  'assets',
  'glyphs',
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadFile(url, destPath) {
  return new Promise((resolve) => {
    const request = (currentUrl) => {
      https
        .get(currentUrl, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            return request(res.headers.location);
          }
          if (res.statusCode === 404 || res.statusCode === 204) {
            res.resume();
            return resolve(false);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return resolve(false);
          }
          const contentType = String(res.headers['content-type'] || '').toLowerCase();
          if (contentType.includes('text/html')) {
            res.resume();
            return resolve(false);
          }
          const file = fs.createWriteStream(destPath);
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve(true)));
          file.on('error', () => resolve(false));
        })
        .on('error', () => resolve(false));
    };
    request(url);
  });
}

function isHtmlDisguisedAsPbf(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const preview = fs.readFileSync(filePath, { encoding: 'utf8', flag: 'r' }).slice(0, 128).toLowerCase();
    return preview.includes('<!doctype html') || preview.includes('<html');
  } catch {
    return false;
  }
}

async function downloadBatch(tasks, concurrency = 10) {
  let index = 0;
  let downloaded = 0;
  let skipped = 0;
  const total = tasks.length;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      const { url, dest } = tasks[i];
      const ok = await downloadFile(url, dest);
      if (ok) downloaded++;
      else {
        skipped++;
        try { fs.unlinkSync(dest); } catch { /* noop */ }
      }
      const pct = Math.round(((downloaded + skipped) / total) * 100);
      process.stdout.write(`\r  Progress: ${pct}% (${downloaded} saved, ${skipped} skipped)`);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  console.log('');
  return { downloaded, skipped };
}

/** Recursively copy directory */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const linkAndroid = process.argv.includes('--link-android');

  console.log('🔤 Downloading offline glyph PBFs for MapLibre…');
  console.log(`   Source: ${SHARED_ASSETS_DIR}\n`);

  const tasks = [];
  for (const fontStack of FONT_STACKS) {
    const fontDir = path.join(SHARED_ASSETS_DIR, fontStack);
    fs.mkdirSync(fontDir, { recursive: true });

    for (const range of RANGES) {
      const encodedFont = encodeURIComponent(fontStack);
      const url = `${FONT_CDN}/${encodedFont}/${range}.pbf`;
      const dest = path.join(fontDir, `${range}.pbf`);

      if (fs.existsSync(dest) && fs.statSync(dest).size > 0 && !isHtmlDisguisedAsPbf(dest)) {
        continue;
      }
      tasks.push({ url, dest });
    }
  }

  if (tasks.length > 0) {
    console.log(`📥 Downloading ${tasks.length} glyph files…`);
    await downloadBatch(tasks);
  } else {
    console.log('✅ All glyph files already in shared assets.');
  }

  if (linkAndroid) {
    console.log(`\n🔗 Linking glyphs to Android native assets…`);
    copyDirSync(SHARED_ASSETS_DIR, ANDROID_ASSETS_DIR);
    console.log(`   Done! Android glyphs at: ${ANDROID_ASSETS_DIR}`);
  }

  console.log('\n✨ Asset preparation complete.');
  console.log('   The map style will use asset://glyphs/{fontstack}/{range}.pbf on Android.');
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
