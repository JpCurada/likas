const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

// ─── Configuration ────────────────────────────────────────────────────────────

// The tool that converts OSM data to MBTiles
const PLANETILER_URL = 'https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar';
const PLANETILER_JAR = path.join(__dirname, 'planetiler.jar');

// Destination: Our shared assets folder (Source of Truth)
const MAPS_DIR = path.join(__dirname, '..', 'assets', 'maps');
const OUTPUT_MBTILES = path.join(MAPS_DIR, 'philippines-extract.mbtiles');

// Geofabrik Philippines extract (approx 400MB)
const OSM_EXTRACT_URL = 'https://download.geofabrik.de/asia/philippines-latest.osm.pbf';
const DEFAULT_PBF = path.join(__dirname, 'philippines-latest.osm.pbf');

// ─── Logic ────────────────────────────────────────────────────────────────────

async function downloadFile(url, destPath, label) {
    if (fs.existsSync(destPath)) {
        console.log(`✅ ${label} already exists. Skipping download.`);
        return;
    }

    console.log(`⬇️ Downloading ${label} (this may take a few minutes)...`);
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        const request = (currentUrl) => {
            https.get(currentUrl, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    return request(response.headers.location);
                }
                if (response.statusCode !== 200) {
                    return reject(new Error(`Failed to download: ${response.statusCode}`));
                }
                response.pipe(file);
                file.on('finish', () => {
                    file.close(resolve);
                });
            }).on('error', (err) => {
                fs.unlink(destPath, () => {});
                reject(err);
            });
        };
        request(url);
    });
}

async function runPlanetiler(pbfFile) {
    console.log('\n🚀 Starting Planetiler to generate your offline map...');
    console.log(`📂 Input:  ${pbfFile}`);
    console.log(`💾 Output: ${OUTPUT_MBTILES}\n`);

    if (!fs.existsSync(MAPS_DIR)) {
        fs.mkdirSync(MAPS_DIR, { recursive: true });
    }

    // Skip if we already have real tiles (anything >10MB is a real build,
    // not an empty SQLite header from an interrupted previous run).
    if (fs.existsSync(OUTPUT_MBTILES)) {
        const sizeMB = fs.statSync(OUTPUT_MBTILES).size / 1024 / 1024;
        if (sizeMB > 10) {
            console.log(`✅ MBTiles already exists (${sizeMB.toFixed(1)} MB). Skipping rebuild.`);
            console.log(`   Pass --force to regenerate, or delete the file manually first.`);
            if (!process.argv.includes('--force')) return;
            console.log('   --force flag detected, regenerating...');
        }
        fs.unlinkSync(OUTPUT_MBTILES);
    }

    return new Promise((resolve, reject) => {
        // Prefer JAVA_HOME, fall back to whatever 'java' resolves on PATH.
        const javaExe = process.env.JAVA_HOME
            ? path.join(process.env.JAVA_HOME, 'bin', 'java')
            : 'java';

        const args = [
            '-Xmx4g', // Recommended RAM
            '-jar', PLANETILER_JAR,
            '--download', // Downloads required water/boundary files
            `--osm-path=${pbfFile}`,
            `--output=${OUTPUT_MBTILES}`,
            '--force'
        ];

        const javaProcess = spawn(javaExe, args, { stdio: 'inherit' });

        javaProcess.on('close', (code) => {
            if (code === 0) {
                console.log('\n✨ SUCCESS! Your offline map has been created!');
                console.log(`📍 Location: ${OUTPUT_MBTILES}`);
                console.log('\nNext steps:');
                console.log('1. Run: npm run link-assets');
                console.log('2. Rebuild your app.');
                resolve();
            } else {
                console.error(`\n❌ Planetiler process failed with code ${code}`);
                reject(new Error('Map generation failed'));
            }
        });
    });
}

async function main() {
    const inputArg = process.argv[2];
    const pbfFile = inputArg || DEFAULT_PBF;

    try {
        await downloadFile(PLANETILER_URL, PLANETILER_JAR, 'Planetiler Tool');
        
        // Only download OSM data if no custom path was provided
        if (!inputArg && !fs.existsSync(DEFAULT_PBF)) {
            await downloadFile(OSM_EXTRACT_URL, DEFAULT_PBF, 'Philippines OSM Extract');
        }

        if (!fs.existsSync(pbfFile)) {
            throw new Error(`Could not find OSM PBF file at: ${pbfFile}`);
        }

        await runPlanetiler(pbfFile);
    } catch (err) {
        console.error('\n❌ An error occurred:', err.message);
        process.exit(1);
    }
}

main();
