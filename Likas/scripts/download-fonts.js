/**
 * download-fonts.js
 *
 * Downloads Noto Sans glyph PBF files from the OpenMapTiles font CDN
 * and saves them into the Android assets directory so MapLibre can
 * render text labels fully offline.
 *
 * Usage:  node scripts/download-fonts.js
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
// We download the most commonly used ranges. Full Unicode goes up to 65535
// but most ranges beyond ~13000 are empty for Latin/Filipino text + map labels.
const RANGES = [];
for (let start = 0; start <= 65280; start += 256) {
  RANGES.push(`${start}-${start + 255}`);
}

// Destination inside the Android app assets
const ASSETS_DIR = path.join(
  __dirname,
  '..',
  'android',
  'app',
  'src',
  'main',
  'assets',
  'fonts',
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Follow redirects and download a URL to a file. Returns true on success. */
function downloadFile(url, destPath) {
  return new Promise((resolve) => {
    const request = (currentUrl) => {
      https
        .get(currentUrl, (res) => {
          // Follow redirects
          if (res.statusCode === 301 || res.statusCode === 302) {
            return request(res.headers.location);
          }

          // Skip empty / missing ranges silently
          if (res.statusCode === 404 || res.statusCode === 204) {
            res.resume(); // drain
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
          file.on('finish', () => {
            file.close(() => resolve(true));
          });
          file.on('error', () => resolve(false));
        })
        .on('error', () => resolve(false));
    };

    request(url);
  });
}

/** Quick guard against accidentally cached HTML pages with .pbf extension */
function isHtmlDisguisedAsPbf(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const preview = fs.readFileSync(filePath, { encoding: 'utf8', flag: 'r' }).slice(0, 128).toLowerCase();
    return preview.includes('<!doctype html') || preview.includes('<html');
  } catch {
    return false;
  }
}

/** Throttled batch download to avoid hammering the CDN */
async function downloadBatch(tasks, concurrency = 10) {
  let index = 0;
  let downloaded = 0;
  let skipped = 0;
  const total = tasks.length;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      const { url, dest, label } = tasks[i];
      const ok = await downloadFile(url, dest);
      if (ok) {
        downloaded++;
      } else {
        skipped++;
        // Remove empty file if created
        try { fs.unlinkSync(dest); } catch { /* noop */ }
      }
      const pct = Math.round(((downloaded + skipped) / total) * 100);
      process.stdout.write(`\r  Progress: ${pct}% (${downloaded} saved, ${skipped} skipped)`);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  console.log(''); // newline
  return { downloaded, skipped };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔤 Downloading offline glyph PBFs for MapLibre…');
  console.log(`   CDN:        ${FONT_CDN}`);
  console.log(`   Font stacks: ${FONT_STACKS.join(', ')}`);
  console.log(`   Ranges:     0-255 → 65280-65535 (${RANGES.length} per font)\n`);

  const tasks = [];

  for (const fontStack of FONT_STACKS) {
    const fontDir = path.join(ASSETS_DIR, fontStack);
    fs.mkdirSync(fontDir, { recursive: true });

    for (const range of RANGES) {
      const encodedFont = encodeURIComponent(fontStack);
      const url = `${FONT_CDN}/${encodedFont}/${range}.pbf`;
      const dest = path.join(fontDir, `${range}.pbf`);

      // Skip if already downloaded
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0 && !isHtmlDisguisedAsPbf(dest)) {
        continue;
      }

      tasks.push({ url, dest, label: `${fontStack}/${range}` });
    }
  }

  if (tasks.length === 0) {
    console.log('✅ All glyph files already downloaded. Nothing to do!');
    return;
  }

  console.log(`📥 Downloading ${tasks.length} glyph files (skipping already-present)…\n`);

  const { downloaded, skipped } = await downloadBatch(tasks);

  console.log(`\n✨ Done!  ${downloaded} files saved, ${skipped} empty ranges skipped.`);
  console.log(`   Fonts stored at: ${ASSETS_DIR}`);
  console.log('   The map style will use asset://fonts/{fontstack}/{range}.pbf');
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
