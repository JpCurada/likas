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

// Glyph ranges to bundle. The basemap only renders English + Filipino
// place names, both of which use Latin script — so we trim the default
// "every Unicode range" set (256 ranges, ~33 MB per font stack) down to
// just what we actually need. Total bundled glyphs drop from ~99 MB to
// ~1.2 MB without losing any visible character coverage.
//
// Ranges kept:
// - 0-255       Basic Latin + Latin-1 Supplement (ASCII, ñ Ñ, á é í ó ú,
//               ü, basic punctuation — covers 99% of Tagalog/English).
// - 256-511     Latin Extended-A (Š š, ą ē — rare diacritics in
//               loanwords and academic Filipino).
// - 7680-7935   Latin Extended Additional (ḑ ḷ ṅ — Spanish-derived
//               and historic Filipino spellings).
// - 8192-8447   General Punctuation (em/en dashes, smart quotes,
//               ellipsis used in OSM name tags).
// - 8448-8703   Letterlike Symbols + Number Forms (Roman numerals
//               Ⅰ Ⅱ Ⅻ used in admin names like "Region XII", fractions
//               ⅓ ⅔, the °F/°C symbol family). MapLibre logs
//               "Failed to load glyph range" without this on PH tiles.
// - 9984-10239  Dingbats / decorative symbols (U+2700–U+27FF) — some POI /
//               admin labels use ✓, ★, etc.; MapLibre requests this range
//               for Noto Sans Regular on Philippines tiles.
//
// To re-enable a wider range (e.g. for Arabic or CJK rendering), just
// add the `start-end` string here and re-run `npm run bundle-glyphs`.
const RANGES = [
  '0-255',
  '256-511',
  '7680-7935',
  '8192-8447',
  '8448-8703',
  '9984-10239',
];

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Downloads one URL to destPath. Retries on 429/503 with exponential backoff
 * (demotiles.maplibre.org rate-limits parallel requests).
 */
async function downloadFile(url, destPath) {
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await new Promise((resolve) => {
      const request = (currentUrl) => {
        https
          .get(currentUrl, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
              return request(res.headers.location);
            }
            if (res.statusCode === 429 || res.statusCode === 503) {
              res.resume();
              return resolve({kind: 'retry'});
            }
            if (res.statusCode === 404 || res.statusCode === 204) {
              res.resume();
              return resolve({kind: 'fail'});
            }
            if (res.statusCode !== 200) {
              res.resume();
              return resolve({kind: 'fail'});
            }
            const contentType = String(res.headers['content-type'] || '').toLowerCase();
            if (contentType.includes('text/html')) {
              res.resume();
              return resolve({kind: 'fail'});
            }
            const file = fs.createWriteStream(destPath);
            res.pipe(file);
            file.on('finish', () => file.close(() => resolve({kind: 'ok'})));
            file.on('error', () => resolve({kind: 'fail'}));
          })
          .on('error', () => resolve({kind: 'fail'}));
      };
      request(url);
    });

    if (result.kind === 'ok') return true;
    if (result.kind === 'retry' && attempt < maxAttempts) {
      const delay = 800 * Math.pow(2, attempt - 1);
      process.stdout.write(`\n  (rate limited, waiting ${delay}ms before retry ${attempt + 1}/${maxAttempts})`);
      await sleep(delay);
      continue;
    }
    return false;
  }
  return false;
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

async function downloadBatch(tasks, concurrency = 4) {
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

/**
 * Removes any .pbf file from `dir` whose `<basename>.pbf` is not in the
 * provided allowlist of range strings. Leaves non-pbf files (e.g. .zip
 * archives) untouched so other tooling doesn't break. Returns the number
 * of files removed and their cumulative size in bytes.
 */
function prunePbfsToAllowlist(dir, allowedRanges) {
  if (!fs.existsSync(dir)) return { removed: 0, freed: 0 };
  const allowed = new Set(allowedRanges);
  let removed = 0;
  let freed = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.pbf')) continue;
    const range = entry.name.slice(0, -'.pbf'.length);
    if (allowed.has(range)) continue;
    const p = path.join(dir, entry.name);
    try {
      freed += fs.statSync(p).size;
      fs.unlinkSync(p);
      removed++;
    } catch {
      /* noop */
    }
  }
  return { removed, freed };
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

  // Prune any out-of-allowlist PBFs left over from previous runs. This
  // keeps both the source dir and the Android assets dir aligned with
  // the current RANGES list, so shrinking the allowlist later actually
  // shrinks the APK without manual cleanup.
  console.log('\n🧹 Pruning out-of-allowlist glyph ranges…');
  let totalPruned = 0;
  let totalFreed = 0;
  for (const stack of FONT_STACKS) {
    const stackDir = path.join(SHARED_ASSETS_DIR, stack);
    const { removed, freed } = prunePbfsToAllowlist(stackDir, RANGES);
    totalPruned += removed;
    totalFreed += freed;
    if (removed > 0) {
      console.log(`   ${stack}: removed ${removed} files (${(freed / 1024 / 1024).toFixed(1)} MB)`);
    }
  }
  if (totalPruned === 0) {
    console.log('   Source already trimmed; nothing to prune.');
  } else {
    console.log(`   Freed ${(totalFreed / 1024 / 1024).toFixed(1)} MB from source.`);
  }

  if (linkAndroid) {
    console.log(`\n🔗 Linking glyphs to Android native assets…`);
    // Wipe the destination first so removed stacks/ranges don't linger
    // and so non-glyph cruft (e.g. an old noto-sans-vX.zip from the
    // legacy download flow) doesn't sneak into the APK.
    if (fs.existsSync(ANDROID_ASSETS_DIR)) {
      fs.rmSync(ANDROID_ASSETS_DIR, { recursive: true, force: true });
    }
    let linkedBytes = 0;
    for (const stack of FONT_STACKS) {
      const stackDest = path.join(ANDROID_ASSETS_DIR, stack);
      fs.mkdirSync(stackDest, { recursive: true });
      for (const range of RANGES) {
        const src = path.join(SHARED_ASSETS_DIR, stack, `${range}.pbf`);
        if (!fs.existsSync(src)) continue;
        const dest = path.join(stackDest, `${range}.pbf`);
        fs.copyFileSync(src, dest);
        linkedBytes += fs.statSync(dest).size;
      }
    }
    console.log(
      `   Done! ${(linkedBytes / 1024).toFixed(1)} KB across ${FONT_STACKS.length} font stacks → ${ANDROID_ASSETS_DIR}`,
    );
  }

  console.log('\n✨ Asset preparation complete.');
  console.log('   The map style will use asset://glyphs/{fontstack}/{range}.pbf on Android.');
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
