import evacuationData from '../data/scraped/evacuation.json';
import hospitalData from '../data/scraped/hospital.json';
import gymnasiumData from '../data/scraped/gymnasium.json';
import schoolData from '../data/scraped/school.json';
import multiPurposeData from '../data/scraped/multi_purpose.json';
import coveredCourtData from '../data/scraped/covered_court.json';

// ─── Address builder ──────────────────────────────────────────────────────────

const buildAddress = (addr: any): string => {
  if (!addr) return '';
  const parts = [
    addr.road,
    addr.neighbourhood,
    addr.suburb,
    addr.village || addr.hamlet || addr.quarter,
    addr.town || addr.city,
    addr.state,
  ].filter(Boolean);
  return parts.join(', ');
};

// ─── GeoJSON builders ─────────────────────────────────────────────────────────

export const getEvacuationGeoJSON = () => {
  const features = (evacuationData as any[])
    .filter(item => item.lat && item.lon)
    .map(item => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(item.lon), parseFloat(item.lat)],
      },
      properties: {
        id: item.place_id,
        name: item.name || item.display_name,
        type: item.type,
        category: item.category,
        address: buildAddress(item.address),
        city: item.address?.city || item.address?.town || item.address?.village || '',
        capacity: item.extratags?.['capacity:persons'] || '',
        hazard: item.extratags?.['emergency:hazard_type'] || '',
        operator: item.extratags?.operator || '',
        pointType: 'evacuation',
      },
    }));

  if (__DEV__) console.log(`[geoUtils] Evacuation centers: ${features.length}`);
  return { type: 'FeatureCollection', features };
};

export const getHospitalGeoJSON = () => {
  const features = (hospitalData as any[])
    .filter(item => item.lat && item.lon)
    .map(item => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(item.lon), parseFloat(item.lat)],
      },
      properties: {
        id: item.place_id,
        name: item.name || item.display_name,
        type: item.type,
        category: item.category,
        address: buildAddress(item.address),
        city: item.address?.city || item.address?.town || item.address?.village || '',
        operator: item.extratags?.operator || item.extratags?.['operator:type'] || '',
        emergency: item.extratags?.emergency || '',
        pointType: 'hospital',
      },
    }));

  if (__DEV__) console.log(`[geoUtils] Hospitals: ${features.length}`);
  return { type: 'FeatureCollection', features };
};

export const getGymnasiumGeoJSON = () => {
  const features = (gymnasiumData as any[])
    .filter(item => item.lat && item.lon)
    .map(item => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(item.lon), parseFloat(item.lat)],
      },
      properties: {
        id: item.place_id,
        name: item.name || item.display_name,
        type: item.type,
        category: item.category,
        address: buildAddress(item.address),
        city: item.address?.city || item.address?.town || item.address?.village || '',
        facility: item.extratags?.['emergency:social_facility'] || '',
        pointType: 'gymnasium',
      },
    }));

  if (__DEV__) console.log(`[geoUtils] Gymnasiums/Sports Centers: ${features.length}`);
  return { type: 'FeatureCollection', features };
};

export const getSchoolGeoJSON = () => {
  const features = (schoolData as any[])
    .filter(item => item.lat && item.lon)
    .map(item => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(item.lon), parseFloat(item.lat)],
      },
      properties: {
        id: item.place_id,
        name: item.name || item.display_name,
        type: item.type,
        category: item.category,
        address: buildAddress(item.address),
        city: item.address?.city || item.address?.town || item.address?.village || '',
        facility: item.extratags?.['emergency:social_facility'] || '',
        pointType: 'school',
      },
    }));

  if (__DEV__) console.log(`[geoUtils] Schools: ${features.length}`);
  return { type: 'FeatureCollection', features };
};

export const getMultiPurposeGeoJSON = () => {
  const features = (multiPurposeData as any[])
    .filter(item => item.lat && item.lon)
    .map(item => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(item.lon), parseFloat(item.lat)],
      },
      properties: {
        id: item.place_id,
        name: item.name || item.display_name,
        type: item.type,
        category: item.category,
        address: buildAddress(item.address),
        city: item.address?.city || item.address?.town || item.address?.village || '',
        facility: item.extratags?.['emergency:social_facility'] || '',
        pointType: 'multipurpose',
      },
    }));

  if (__DEV__) console.log(`[geoUtils] Multi-Purpose Halls: ${features.length}`);
  return { type: 'FeatureCollection', features };
};

export const getCoveredCourtGeoJSON = () => {
  const features = (coveredCourtData as any[])
    .filter(item => item.lat && item.lon)
    .map(item => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(item.lon), parseFloat(item.lat)],
      },
      properties: {
        id: item.place_id,
        name: item.name || item.display_name,
        type: item.type,
        category: item.category,
        address: buildAddress(item.address),
        city: item.address?.city || item.address?.town || item.address?.village || '',
        facility: item.extratags?.['emergency:social_facility'] || '',
        pointType: 'covered_court',
      },
    }));

  if (__DEV__) console.log(`[geoUtils] Covered Courts: ${features.length}`);
  return { type: 'FeatureCollection', features };
};