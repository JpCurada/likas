const fs = require('fs');

const inputFile = 'Likas/src/data/gem_active_faults_harmonized.json';
console.log('Reading ' + inputFile + '...');
const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const initialCount = data.features.length;

// Philippines approximate bounding box:
// Min Lon: 116.0, Max Lon: 127.0
// Min Lat: 4.0, Max Lat: 22.0
const MIN_LON = 116.0;
const MAX_LON = 127.0;
const MIN_LAT = 4.0;
const MAX_LAT = 22.0;

const filteredFeatures = data.features.filter(feature => {
    const geom = feature.geometry;
    let coords = [];
    if (!geom) return false;
    
    if (geom.type === 'LineString') {
        coords = geom.coordinates;
    } else if (geom.type === 'MultiLineString') {
        coords = geom.coordinates.flat();
    } else {
        return false;
    }

    // Check if any point of the fault line falls within the PH bounding box
    return coords.some(coord => {
        const lon = coord[0];
        const lat = coord[1];
        return lon >= MIN_LON && lon <= MAX_LON && lat >= MIN_LAT && lat <= MAX_LAT;
    });
});

data.features = filteredFeatures;
fs.writeFileSync(inputFile, JSON.stringify(data));

console.log(`Filtered features from ${initialCount} to ${filteredFeatures.length} (Philippines only).`);