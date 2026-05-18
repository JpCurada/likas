/**
 * package-assets.js
 * 
 * Zips glyphs, calculates hashes and sizes for all assets,
 * and updates manifest.dev.json.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

// ─── Configuration ────────────────────────────────────────────────────────────
const MANIFEST_PATH = path.join(__dirname, '..', 'src', 'services', 'manifest.dev.json');
const ASSETS_BASE = path.join(__dirname, '..', 'assets');

const TARGETS = [
  {
    id: 'map-glyphs',
    srcDir: path.join(ASSETS_BASE, 'glyphs'),
    outZip: 'noto-sans-v1.0.0.zip',
  }
];

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

async function packageTarget(target, manifest) {
  console.log(`\n📦 Packaging ${target.id}…`);
  
  if (!fs.existsSync(target.srcDir)) {
    console.warn(`⚠️  Source directory not found: ${target.srcDir}. Skipping.`);
    return;
  }

  const outPath = path.join(ASSETS_BASE, target.outZip);
  
  console.log(`🤐 Zipping ${target.srcDir} -> ${target.outZip}…`);
  const zip = new AdmZip();
  zip.addLocalFolder(target.srcDir);
  zip.writeZip(outPath);
  
  const stats = fs.statSync(outPath);
  const hash = await getFileHash(outPath);

  if (manifest.assets[target.id]) {
    manifest.assets[target.id].sha256 = hash;
    manifest.assets[target.id].size = stats.size;
    manifest.assets[target.id].localFilename = target.outZip;
    console.log(`✅ Updated manifest for ${target.id}`);
  }
}

async function updateFileMetadata(assetId, filePath, manifest) {
  if (fs.existsSync(filePath)) {
    console.log(`📄 Updating metadata for ${assetId}…`);
    const hash = await getFileHash(filePath);
    const stats = fs.statSync(filePath);
    if (manifest.assets[assetId]) {
      manifest.assets[assetId].sha256 = hash;
      manifest.assets[assetId].size = stats.size;
      console.log(`✅ Updated manifest for ${assetId}`);
      return true;
    }
  } else {
    console.warn(`⚠️  File not found for ${assetId}: ${filePath}`);
  }
  return false;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting Asset Packaging…');

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`❌ Manifest not found at ${MANIFEST_PATH}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  // 1. Package compressed targets
  for (const target of TARGETS) {
    await packageTarget(target, manifest);
  }

  // 2. Update metadata for individual large files
  const standaloneAssets = [
    { id: 'map-tiles', path: path.join(ASSETS_BASE, 'maps', 'philippines-extract.mbtiles') },
    { id: 'pedestrian-graph', path: path.join(ASSETS_BASE, 'maps', 'pedestrian-graph.json') },
    { id: 'pedestrian-graph-db', path: path.join(ASSETS_BASE, 'maps', 'pedestrian-graph.db') }
  ];

  for (const asset of standaloneAssets) {
    await updateFileMetadata(asset.id, asset.path, manifest);
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('\n✨ All assets processed and manifest updated.');
}

main().catch(console.error);
