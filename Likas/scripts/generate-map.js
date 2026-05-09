const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

const PLANETILER_URL = 'https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar';
const PLANETILER_JAR = path.join(__dirname, 'planetiler.jar');
const ASSETS_DIR = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets');
const OUTPUT_MBTILES = path.join(ASSETS_DIR, 'metro-manila.mbtiles');

// Default to the file you downloaded!
const defaultPbf = 'c:\\Users\\User\\CODERIST\\gemma\\likas\\planet_120.718,14.412_121.209,14.721.osm.pbf';
const pbfFile = process.argv[2] || defaultPbf;

if (!fs.existsSync(pbfFile)) {
    console.error(`❌ Error: Could not find the pbf file at: ${pbfFile}`);
    console.error('Usage: node scripts/generate-map.js [path-to-file.osm.pbf]');
    process.exit(1);
}

// Ensure assets directory exists for the android app
if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// Ensure the old mbtiles file is deleted so planetiler doesn't fail
if (fs.existsSync(OUTPUT_MBTILES)) {
    fs.unlinkSync(OUTPUT_MBTILES);
}

async function downloadPlanetiler() {
    if (fs.existsSync(PLANETILER_JAR)) {
        console.log('✅ planetiler.jar already exists. Skipping download.');
        return;
    }

    console.log('⬇️ Downloading Planetiler (this will take a minute)...');
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(PLANETILER_JAR);
        
        // Handle redirect since github releases use redirects
        const request = (url) => {
            https.get(url, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    return request(response.headers.location);
                }
                
                response.pipe(file);
                file.on('finish', () => {
                    file.close(resolve);
                });
            }).on('error', (err) => {
                fs.unlink(PLANETILER_JAR, () => {});
                reject(err);
            });
        };
        request(PLANETILER_URL);
    });
}

async function runPlanetiler() {
    console.log('🚀 Starting Planetiler to generate your offline map...');
    console.log(`📂 Input: ${pbfFile}`);
    console.log(`💾 Output: ${OUTPUT_MBTILES}`);
    
    return new Promise((resolve, reject) => {
        // Use the Android Studio Java executable since it's guaranteed to be there for React Native Windows users
        const javaExe = fs.existsSync('C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\java.exe') 
            ? 'C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\java.exe' 
            : 'java';

        const javaProcess = spawn(javaExe, [
            '-Xmx4g', // Give it 4GB of RAM to process fast
            '-jar',
            PLANETILER_JAR,
            '--download', // Tell Planetiler to download missing resources (water polygons, etc.)
            `--osm-path=${pbfFile}`,
            `--output=${OUTPUT_MBTILES}`
        ], {
            stdio: 'inherit' // Show output in terminal
        });

        javaProcess.on('close', (code) => {
            if (code === 0) {
                console.log('\n✨ SUCCESS! Your offline map has been created!');
                console.log(`It is safely stored at: ${OUTPUT_MBTILES}`);
                resolve();
            } else {
                console.error(`\n❌ Planetiler process failed with code ${code}`);
                reject(new Error('Map generation failed'));
            }
        });
    });
}

async function main() {
    try {
        await downloadPlanetiler();
        await runPlanetiler();
    } catch (err) {
        console.error('An error occurred:', err);
    }
}

main();
