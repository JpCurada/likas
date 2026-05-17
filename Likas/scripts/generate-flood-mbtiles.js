const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

// ─── Configuration ────────────────────────────────────────────────────────────

// The tool that converts GeoJSON data to MBTiles
const PLANETILER_URL = 'https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar';
const PLANETILER_JAR = path.join(__dirname, 'planetiler.jar');

// Input/Output files
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const INPUT_GEOJSON = path.join(DATA_DIR, 'MetroManila_Flood_100year.json');

const MAPS_DIR = path.join(__dirname, '..', 'assets', 'maps');
const OUTPUT_MBTILES = path.join(MAPS_DIR, 'flood_zones.mbtiles');
const CONFIG_YML = path.join(__dirname, 'flood_config.yml');

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

function writeYamlConfig(geojsonPath) {
    const yamlContent = `
sources:
  flood_zones_source:
    type: geojson
    local_path: "${geojsonPath.replace(/\\/g, '/')}"

layers:
  - id: flood_zones
    features:
      - source: flood_zones_source
        geometry: polygon
        min_zoom: 0
        attributes:
          - key: Var
            value: "\${feature.tags.Var}"
            type: integer
          - key: DN
            value: "\${feature.tags.DN}"
            type: integer
          - key: GRIDCODE
            value: "\${feature.tags.GRIDCODE}"
            type: integer
          - key: gridcode
            value: "\${feature.tags.gridcode}"
            type: integer
          - key: hazard
            value: "\${feature.tags.hazard}"
          - key: level
            value: "\${feature.tags.level}"
`;
    fs.writeFileSync(CONFIG_YML, yamlContent.trim());
    console.log(`✅ Created Planetiler configuration: ${CONFIG_YML}`);
}

async function runPlanetiler(geojsonPath) {
    console.log('\n🚀 Starting Planetiler to generate your offline flood map...');
    console.log(`📂 Input:  ${geojsonPath}`);
    console.log(`💾 Output: ${OUTPUT_MBTILES}\n`);

    if (!fs.existsSync(MAPS_DIR)) {
        fs.mkdirSync(MAPS_DIR, { recursive: true });
    }

    return new Promise((resolve, reject) => {
        // Prefer JAVA_HOME, fall back to whatever 'java' resolves on PATH.
        let javaExe = 'java';
        if (process.env.JAVA_HOME) {
            const possibleExe = path.join(process.env.JAVA_HOME, 'bin', 'java.exe');
            if (fs.existsSync(possibleExe)) {
                javaExe = possibleExe;
            }
        }

        const args = [
            '-Xmx4g', // Recommended RAM
            '-jar', PLANETILER_JAR,
            'generate-custom',
            `--schema=${CONFIG_YML}`,
            `--output=${OUTPUT_MBTILES}`,
            '--force',
            '--nodownload'
        ];

        const javaProcess = spawn(javaExe, args, { stdio: 'inherit' });

        javaProcess.on('close', (code) => {
            if (code === 0) {
                console.log('\n✨ SUCCESS! Your offline flood MBTiles have been created!');
                console.log(`📍 Location: ${OUTPUT_MBTILES}`);
                console.log('\nNext steps:');
                console.log('1. Run: npm run link-assets');
                console.log('2. The map layer will now stream directly from this local .mbtiles file!');
                resolve();
            } else {
                console.error(`\n❌ Planetiler process failed with code ${code}`);
                reject(new Error('Map generation failed'));
            }
        });
        
        javaProcess.on('error', (err) => {
           console.error('\n❌ Failed to start Java process:', err.message);
           console.log('Make sure Java 17+ is installed and in your PATH, or JAVA_HOME is set.');
           reject(err);
        });
    });
}

async function main() {
    let finalInputGeojson = INPUT_GEOJSON;
    const customInput = process.argv[2];
    if (customInput) {
        // Allow overriding input if user wants to process a raw shapefile that they converted to geojson
        finalInputGeojson = path.resolve(customInput);
    }

    try {
        if (!fs.existsSync(finalInputGeojson)) {
            throw new Error(`Could not find input GeoJSON at: ${finalInputGeojson}. Please place your flood data there.`);
        }

        await downloadFile(PLANETILER_URL, PLANETILER_JAR, 'Planetiler Tool');
        
        writeYamlConfig(finalInputGeojson);

        await runPlanetiler(finalInputGeojson);
    } catch (err) {
        console.error('\n❌ An error occurred:', err.message);
        process.exit(1);
    }
}

main();
