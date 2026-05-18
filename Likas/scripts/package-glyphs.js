/**
 * package-glyphs.js
 * 
 * Zips the local glyph PBF files, calculates their SHA256 and size,
 * and updates manifest.dev.json with the correct values.
 * 
 * Usage: node scripts/package-glyphs.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

// ─── Configuration ────────────────────────────────────────────────────────────
const GLYPHS_DIR = path.join(__dirname, '..', 'assets', 'glyphs');
const MANIFEST_PATH = path.join(__dirname, '..', 'src', 'services', 'manifest.dev.json');
const OUTPUT_FILENAME = 'noto-sans-v1.0.0.zip';
const OUTPUT_PATH = path.join(__dirname, '..', 'assets', OUTPUT_FILENAME);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📦 Packaging glyphs for manifest…');

  if (!fs.existsSync(GLYPHS_DIR)) {
    console.error(`❌ Error: Glyphs directory not found at ${GLYPHS_DIR}`);
    console.log('   Run `npm run prepare-assets` first to download glyphs.');
    process.exit(1);
  }

  // 1. Create Zip
  console.log(`🤐 Zipping contents of ${GLYPHS_DIR}…`);
  const zip = new AdmZip();
  zip.addLocalFolder(GLYPHS_DIR);
  zip.writeZip(OUTPUT_PATH);
  
  const stats = fs.statSync(OUTPUT_PATH);
  const size = stats.size;
  const hash = await getFileHash(OUTPUT_PATH);

  console.log(`✅ Created ${OUTPUT_FILENAME}`);
  console.log(`   Size: ${size} bytes`);
  console.log(`   SHA256: ${hash}`);

  // 2. Update Manifest
  if (fs.existsSync(MANIFEST_PATH)) {
    console.log(`📝 Updating manifest at ${MANIFEST_PATH}…`);
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    
    if (manifest.assets && manifest.assets['map-glyphs']) {
      manifest.assets['map-glyphs'].sha256 = hash;
      manifest.assets['map-glyphs'].size = size;
      manifest.assets['map-glyphs'].localFilename = OUTPUT_FILENAME;
      
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
      console.log('✨ Manifest updated successfully.');
    } else {
      console.warn('⚠️  Warning: "map-glyphs" entry not found in manifest. Skipping update.');
    }
  } else {
    console.warn(`⚠️  Warning: Manifest not found at ${MANIFEST_PATH}. Skipping update.`);
  }

  console.log('\n🚀 Done! You can now upload the zip to your CDN.');
  console.log(`   Location: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
