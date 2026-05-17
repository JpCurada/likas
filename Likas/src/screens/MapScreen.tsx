import React, {
  useMemo,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import {
  StyleSheet,
  View,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Platform,
  Alert,
  PermissionsAndroid,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Map,
  Camera,
  GeoJSONSource,
  Layer,
  Images,
  UserLocation,
} from '@maplibre/maplibre-react-native';
import type {
  CameraRef,
  TrackUserLocation,
} from '@maplibre/maplibre-react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import BottomSheet from '@gorhom/bottom-sheet';
import { COLORS, FONTS, SIZES } from '../theme';
import {
  getEvacuationGeoJSON,
  getHospitalGeoJSON,
  getGymnasiumGeoJSON,
  getSchoolGeoJSON,
  getMultiPurposeGeoJSON,
  getCoveredCourtGeoJSON,
  getNearestFeature,
} from '../utils/geoUtils';
import {
  prepareOfflineMap,
  prepareFloodMap,
  prepareGlyphs,
  prepareGraphDb,
  MapAssetMissingError,
} from '../utils/mapAssetManager';
import { MapTooltip, TooltipData } from '../components/MapTooltip';
import { AssetMissingPrompt } from '../components/AssetMissingPrompt';
import { useAppStore } from '../stores/appStore';
import { loadProfile, UserProfile } from '../database/storage';
import { useFocusEffect } from '@react-navigation/native';
import { routingService, GraphNotLoadedError, NoRouteError } from '../services/routingService';
import activeFaultsGeoJSON from '../data/gem_active_faults_harmonized.json';
import { ChatScreen } from './ChatScreen';
import { Icon } from '../components/Icon';

// Metro Manila center
const INITIAL_COORDINATES = [121.0509, 14.5823];

// Bundled offline style base
const baseOfflineStyle = require('../../assets/maps/style.json');
const OFFLINE_GLYPH_FONT_STACK = ['Noto Sans Regular'];

/** Rebuilds the style object with building layers toggled between 2D / 3D */
const buildStyle = (base: any, is3D: boolean, activeFilters: Record<string, boolean>): any => {
  const clone = JSON.parse(JSON.stringify(base));
  clone.layers = clone.layers.map((layer: any) => {
    if (layer.type === 'symbol') {
      return {
        ...layer,
        layout: {
          ...layer.layout,
          'text-font': OFFLINE_GLYPH_FONT_STACK,
        },
      };
    }
    if (layer.id === 'building-2d') {
      return {
        ...layer,
        layout: { ...layer.layout, visibility: is3D ? 'none' : 'visible' },
      };
    }
    if (layer.id === 'building-3d') {
      return {
        ...layer,
        layout: { ...layer.layout, visibility: is3D ? 'visible' : 'none' },
      };
    }
    /* 
    // Flood layers visibility
    if (layer.id === 'flood_zones_fill' || layer.id === 'flood_zones_outline') {
        return {
          ...layer,
          layout: { 
            ...layer.layout, 
            visibility: activeFilters.flood ? 'visible' : 'none' 
          },
        };
    }
    */
    return layer;
  });
  return clone;
};

type ViewMode = '2D' | '3D';

const ICON_NAMES = {
  evacuation: 'shield-home',
  hospital: 'hospital-building',
  gymnasium: 'basketball',
  school: 'school',
  multipurpose: 'office-building',
};

const FILTER_OPTIONS = [
  // { id: 'flood', label: 'Flood Zones', color: '#BF00FF' },
  { id: 'evacuation', label: 'Evacuation', color: COLORS.primaryGreen },
  { id: 'hospital', label: 'Hospitals', color: COLORS.error },
  { id: 'faults', label: 'Fault Lines', color: COLORS.error },
  { id: 'gymnasium', label: 'Gymnasiums', color: '#FF9800' },
  { id: 'school', label: 'Schools', color: '#2196F3' },
  { id: 'multipurpose', label: 'Multi-Purpose', color: '#9C27B0' },
  { id: 'covered_court', label: 'Covered Courts', color: '#9C27B0' },
];

export const MapScreen: React.FC = () => {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const cameraRef = useRef<CameraRef>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [isMapReady, setIsMapReady] = useState(false);
  const [baseStyle, setBaseStyle] = useState<any>(null);

  const [activeFilters, setActiveFilters] = useState<Record<string, boolean>>({
    // flood: true,
    evacuation: true,
    hospital: true,
    faults: true,
    gymnasium: false,
    school: false,
    multipurpose: false,
    covered_court: false,
  });
  const [showLayersMenu, setShowLayersMenu] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadProfile().then(setProfile);
    }, []),
  );

  const [trackUser, setTrackUser] = useState<TrackUserLocation | undefined>('default');
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [icons, setIcons] = useState<any>({});
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [nearbyList, setNearbyList] = useState<any[]>([]);
  const [nearbyIndex, setNearbyIndex] = useState(0);

  const snapPoints = useMemo(() => ['15%', '50%', '90%'], []);

  const [assetMissing, setAssetMissing] = useState(false);
  const [isRerouting, setIsRerouting] = useState(false);
  const activeRoute = useAppStore(s => s.activeRoute);
  const setActiveRoute = useAppStore(s => s.setActiveRoute);

  const routeGeoJSON = useMemo(() => {
    if (!activeRoute || activeRoute.polyline.length < 2) return null;
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: activeRoute.polyline.map(p => [
              p.longitude,
              p.latitude,
            ]),
          },
        },
      ],
    };
  }, [activeRoute]);

  const evacuationGeoJSON = useMemo(() => getEvacuationGeoJSON(), []);
  const hospitalGeoJSON = useMemo(() => getHospitalGeoJSON(), []);
  const gymnasiumGeoJSON = useMemo(() => getGymnasiumGeoJSON(), []);
  const schoolGeoJSON = useMemo(() => getSchoolGeoJSON(), []);
  const multiPurposeGeoJSON = useMemo(() => getMultiPurposeGeoJSON(), []);
  const coveredCourtGeoJSON = useMemo(() => getCoveredCourtGeoJSON(), []);

  // Derive the active style from base + filters, hardcoded to 3D mode
  const dynamicStyle = useMemo(() => {
    if (!baseStyle) return null;
    return buildStyle(baseStyle, true, activeFilters);
  }, [baseStyle, activeFilters]);

  // ── Nearby-list helpers ───────────────────────────────────────────────────

  /** Sort features by straight-line distance from the user (degree-space Euclidean — fine for ordering). */
  const sortByDistance = (features: any[], userLon: number, userLat: number): any[] =>
    [...features]
      .filter(f => Array.isArray(f.geometry?.coordinates) && f.geometry.coordinates.length >= 2)
      .map(f => ({
        ...f,
        _d: Math.hypot(f.geometry.coordinates[0] - userLon, f.geometry.coordinates[1] - userLat),
      }))
      .sort((a, b) => a._d - b._d);

  /** Return all features of the same pointType as the tapped POI. */
  const getFeaturesByType = useCallback((pointType: string): any[] => {
    switch (pointType) {
      case 'evacuation':   return evacuationGeoJSON.features;
      case 'hospital':     return hospitalGeoJSON.features;
      case 'gymnasium':    return gymnasiumGeoJSON.features;
      case 'school':       return schoolGeoJSON.features;
      case 'multipurpose':
      case 'multi_purpose': return [...multiPurposeGeoJSON.features, ...coveredCourtGeoJSON.features];
      case 'covered_court': return coveredCourtGeoJSON.features;
      default:             return [];
    }
  }, [evacuationGeoJSON, hospitalGeoJSON, gymnasiumGeoJSON, schoolGeoJSON, multiPurposeGeoJSON, coveredCourtGeoJSON]);

  useEffect(() => {
    const initializeMap = async () => {
      try {
        console.log('[MapScreen] Starting map initialization...');
        const absoluteMbtilesUrl = await prepareOfflineMap();

        let floodUrl = null;
        /*
        try {
            floodUrl = await prepareFloodMap();
        } catch (floodErr) {
            console.warn('[MapScreen] Flood MBTiles not installed:', floodErr);
        }
        */

        let glyphsPath;
        try {
          glyphsPath = await prepareGlyphs();
        } catch (glyphErr) {
          console.warn(
            '[MapScreen] Glyph preparation failed, using default fallback:',
            glyphErr,
          );
          glyphsPath =
            Platform.OS === 'android'
              ? 'asset://glyphs/{fontstack}/{range}.pbf'
              : 'glyphs/{fontstack}/{range}.pbf';
        }

        const newStyle = JSON.parse(JSON.stringify(baseOfflineStyle));
        newStyle.sources.openmaptiles.url = absoluteMbtilesUrl;
        newStyle.glyphs = glyphsPath;

        /* 
        if (floodUrl) {
            newStyle.sources.flood_zones = {
                type: 'vector',
                url: floodUrl,
            };
            // Add fill layer directly into style
            newStyle.layers.push({
                id: 'flood_zones_fill',
                type: 'fill',
                source: 'flood_zones',
                'source-layer': 'flood_zones',
                paint: {
                    'fill-color': [
                        'match',
                        ['to-string', ['coalesce', ['get', 'level'], ['get', 'Var'], ['get', 'GRIDCODE'], ['get', 'DN']]],
                        ['High', '3'], '#FF0000',      // Neon Red
                        ['Medium', '2'], '#BF00FF',    // Electric Purple
                        ['Low', '1'], '#00BFFF',       // Sky Blue
                        '#FF0000'                      // Fallback to Red if matched but value unknown
                    ],
                    'fill-opacity': 0.75,
                },
                layout: {
                    visibility: 'visible'
                }
            });
            // Add thin outline
            newStyle.layers.push({
                id: 'flood_zones_outline',
                type: 'line',
                source: 'flood_zones',
                'source-layer': 'flood_zones',
                paint: {
                    'line-color': [
                        'match',
                        ['to-string', ['coalesce', ['get', 'level'], ['get', 'Var'], ['get', 'GRIDCODE'], ['get', 'DN']]],
                        ['High', '3'], '#8B0000',
                        ['Medium', '2'], '#4B0082',
                        ['Low', '1'], '#00008B',
                        '#8B0000'
                    ],
                    'line-width': 1.2,
                    'line-opacity': 0.9,
                },
                layout: {
                    visibility: 'visible'
                }
            });
            // Add Diagnostic Label
            newStyle.layers.push({
                id: 'flood_zones_label',
                type: 'symbol',
                source: 'flood_zones',
                'source-layer': 'flood_zones',
                minzoom: 12,
                layout: {
                    'text-field': [
                        'concat',
                        'Var:', ['to-string', ['get', 'Var']],
                        ' DN:', ['to-string', ['get', 'DN']],
                        ' GC:', ['to-string', ['get', 'gridcode']],
                        ' LVL:', ['to-string', ['get', 'level']],
                    ],
                    'text-font': OFFLINE_GLYPH_FONT_STACK,
                    'text-size': 11,
                    'text-allow-overlap': false,
                    'text-ignore-placement': false,
                },
                paint: {
                    'text-color': '#FFFFFF',
                    'text-halo-color': '#000000',
                    'text-halo-width': 2,
                },
            });
        }
        */

        setBaseStyle(newStyle);
        setIsMapReady(true);
        console.log('[MapScreen] Map initialization successful.');

        // Register pedestrian graph DB from sideload / bundled APK so routingService can find it.
        prepareGraphDb().then(p => {
          if (p) console.log('[MapScreen] Pedestrian graph DB ready:', p);
          else console.log('[MapScreen] Pedestrian graph DB not installed — straight-line fallback active.');
        });
      } catch (error) {
        console.error('[MapScreen] CRITICAL: Map Init Failed:', error);
        if (error instanceof MapAssetMissingError) {
          setAssetMissing(true);
          return;
        }
      }
    };

    const loadIcons = async () => {
      try {
        const evacuationIcon = await MaterialCommunityIcons.getImageSource(
          ICON_NAMES.evacuation,
          40,
          '#ffffff',
        );
        const hospitalIcon = await MaterialCommunityIcons.getImageSource(
          ICON_NAMES.hospital,
          40,
          '#ffffff',
        );
        const gymnasiumIcon = await MaterialCommunityIcons.getImageSource(
          ICON_NAMES.gymnasium,
          40,
          '#ffffff',
        );
        const schoolIcon = await MaterialCommunityIcons.getImageSource(
          ICON_NAMES.school,
          40,
          '#ffffff',
        );
        const multipurposeIcon = await MaterialCommunityIcons.getImageSource(
          ICON_NAMES.multipurpose,
          40,
          '#ffffff',
        );

        setIcons({
          evacuation: { source: evacuationIcon },
          hospital: { source: hospitalIcon },
          gymnasium: { source: gymnasiumIcon },
          school: { source: schoolIcon },
          multipurpose: { source: multipurposeIcon },
        });
      } catch (err) {
        console.error('Failed to load icons', err);
      }
    };

    initializeMap();
    loadIcons();
  }, []);

  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  // Request permission then watch GPS position
  useEffect(() => {
    let watchId: number | null = null;

    const startTracking = () => {
      // Immediately get current position for a fast first fix
      Geolocation.getCurrentPosition(
        position => {
          setUserLocation([position.coords.longitude, position.coords.latitude]);
        },
        error => console.warn('[MapScreen] getCurrentPosition error:', error),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 },
      );
      // Then keep watching for updates
      watchId = Geolocation.watchPosition(
        position => {
          setUserLocation([position.coords.longitude, position.coords.latitude]);
        },
        error => console.warn('[MapScreen] watchPosition error:', error),
        { enableHighAccuracy: false, distanceFilter: 5 },
      );
    };

    if (Platform.OS === 'android') {
      PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: 'LIKAS needs your location to find nearby safe zones.',
          buttonPositive: 'Allow',
        },
      ).then(result => {
        if (result === PermissionsAndroid.RESULTS.GRANTED) {
          startTracking();
        } else {
          console.warn('[MapScreen] Location permission denied');
        }
      });
    } else {
      startTracking();
    }

    return () => {
      if (watchId !== null) Geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    if (!activeRoute || !isMapReady) return;
    const coords = activeRoute.polyline;
    if (coords.length === 0) return;
    let minLon = coords[0].longitude;
    let maxLon = coords[0].longitude;
    let minLat = coords[0].latitude;
    let maxLat = coords[0].latitude;
    for (const c of coords) {
      if (c.longitude < minLon) minLon = c.longitude;
      if (c.longitude > maxLon) maxLon = c.longitude;
      if (c.latitude < minLat) minLat = c.latitude;
      if (c.latitude > maxLat) maxLat = c.latitude;
    }
    cameraRef.current?.fitBounds([minLon, minLat, maxLon, maxLat], {
      padding: { top: 120, bottom: 80, left: 60, right: 60 },
      duration: 900,
    });
  }, [activeRoute, isMapReady]);

  const toggleFilter = useCallback((id: string) => {
    setActiveFilters(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const findAndNavigateToSafeZone = useCallback((lon: number, lat: number) => {
    const safeZones = [...evacuationGeoJSON.features, ...hospitalGeoJSON.features];
    const sorted = sortByDistance(safeZones, lon, lat);
    if (sorted.length === 0 || !cameraRef.current) {
      Alert.alert('Not found', 'Could not find any safe zones nearby.');
      return;
    }
    setNearbyList(sorted);
    setNearbyIndex(0);
    const nearest = sorted[0];
    const [nearLon, nearLat] = nearest.geometry.coordinates;
    setTrackUser(undefined);
    cameraRef.current.flyTo({ center: [nearLon, nearLat], zoom: 16, duration: 1000 });
    const props = nearest.properties as TooltipData;
    setTooltip({ ...props, longitude: nearLon, latitude: nearLat });
    setSelectedFeatureId(props.id || null);
  }, [evacuationGeoJSON, hospitalGeoJSON]);

  const handleFindNearestSafeZone = useCallback(() => {
    if (userLocation) {
      // Already have cached location — use it immediately
      findAndNavigateToSafeZone(userLocation[0], userLocation[1]);
      return;
    }
    // Location not yet cached — request it on-demand
    Geolocation.getCurrentPosition(
      position => {
        const { longitude, latitude } = position.coords;
        setUserLocation([longitude, latitude]);
        findAndNavigateToSafeZone(longitude, latitude);
      },
      () => {
        Alert.alert(
          'Location unavailable',
          'Unable to determine your location. Please ensure location services are enabled.',
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 },
    );
  }, [userLocation, findAndNavigateToSafeZone]);

  const handleGetDirections = useCallback(async (dest: TooltipData) => {
    if (!dest.latitude || !dest.longitude) return;
    const origin = userLocation
      ? { latitude: userLocation[1], longitude: userLocation[0] }
      : await new Promise<{ latitude: number; longitude: number }>((resolve, reject) =>
          Geolocation.getCurrentPosition(
            p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
            reject,
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 },
          ),
        ).catch(() => null);

    if (!origin) {
      Alert.alert('Location unavailable', 'Could not determine your current location.');
      return;
    }

    try {
      const route = await routingService.route(origin, {
        latitude: dest.latitude,
        longitude: dest.longitude,
      });
      setActiveRoute({
        ...route,
        destination: { latitude: dest.latitude, longitude: dest.longitude },
        destinationName: dest.name,
      });
    } catch (err: any) {
      if (err instanceof GraphNotLoadedError) {
        // Pedestrian graph not installed — use straight-line estimate as fallback
        const R = 6_371_000;
        const toRad = (d: number) => (d * Math.PI) / 180;
        const dLat = toRad(dest.latitude - origin.latitude);
        const dLon = toRad(dest.longitude - origin.longitude);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(origin.latitude)) *
            Math.cos(toRad(dest.latitude)) *
            Math.sin(dLon / 2) ** 2;
        const distanceMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const WALKING_MPS = 1.167;
        setActiveRoute({
          polyline: [origin, { latitude: dest.latitude, longitude: dest.longitude }],
          distanceMeters,
          durationMinutesWalking: Math.ceil(distanceMeters / WALKING_MPS / 60),
          destination: { latitude: dest.latitude, longitude: dest.longitude },
          destinationName: dest.name,
        });
        console.warn('[MapScreen] Routing graph not installed — showing straight-line route');
      } else {
        Alert.alert(
          'Routing failed',
          err?.message ?? 'Could not calculate a walking route to this location.',
        );
      }
    }
  }, [userLocation, setActiveRoute]);

  const handleReroute = useCallback(async () => {
    if (!userLocation || !activeRoute) {
      Alert.alert('Cannot reroute', 'Location and active route are required.');
      return;
    }

    setIsRerouting(true);
    const origin = { latitude: userLocation[1], longitude: userLocation[0] };
    const dest = activeRoute.destination;

    try {
      const newRoute = await routingService.route(origin, dest);
      setActiveRoute({
        ...activeRoute,
        ...newRoute,
      });
    } catch (err: any) {
      if (err instanceof GraphNotLoadedError) {
        // Pedestrian graph not installed — fall back to straight-line from new position
        const R = 6_371_000;
        const toRad = (d: number) => (d * Math.PI) / 180;
        const dLat = toRad(dest.latitude - origin.latitude);
        const dLon = toRad(dest.longitude - origin.longitude);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(origin.latitude)) *
            Math.cos(toRad(dest.latitude)) *
            Math.sin(dLon / 2) ** 2;
        const distanceMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const WALKING_MPS = 1.167;
        setActiveRoute({
          ...activeRoute,
          polyline: [origin, dest],
          distanceMeters,
          durationMinutesWalking: Math.ceil(distanceMeters / WALKING_MPS / 60),
        });
        console.warn('[MapScreen] Reroute — graph not installed, showing straight-line from new position');
      } else if (err instanceof NoRouteError) {
        Alert.alert(
          'No path found',
          'Could not find a walkable path from your current location. The route may cross impassable terrain.',
        );
      } else {
        console.warn('[MapScreen] Reroute failed:', err);
        Alert.alert('Reroute failed', err?.message ?? 'Could not recalculate path from your current location.');
      }
    } finally {
      setIsRerouting(false);
    }
  }, [userLocation, activeRoute, setActiveRoute]);

  const handleFeaturePress = useCallback((e: any) => {
    const feature = e?.nativeEvent?.features?.[0] ?? e?.features?.[0];
    if (!feature?.properties) return;
    if (e.stopPropagation) e.stopPropagation();
    if (feature.properties.cluster) return;

    const coords = feature?.geometry?.coordinates;
    const props = feature.properties as TooltipData;
    setTooltip({
      ...props,
      longitude: coords?.[0] ?? undefined,
      latitude: coords?.[1] ?? undefined,
    });
    setSelectedFeatureId(props.id || null);

    // Build a distance-sorted list for the same POI type so the user can
    // cycle through all nearby options with ← Prev / Next → in the tooltip.
    if (userLocation) {
      const [uLon, uLat] = userLocation;
      const typeFeatures = getFeaturesByType(props.pointType);
      const sorted = sortByDistance(typeFeatures, uLon, uLat);
      setNearbyList(sorted);
      const idx = sorted.findIndex(f => f.properties?.id === props.id);
      setNearbyIndex(Math.max(0, idx));
    } else {
      setNearbyList([]);
      setNearbyIndex(0);
    }
  }, [userLocation, getFeaturesByType]);

  const handleMapPress = useCallback((e: any) => {
    const features = e?.nativeEvent?.features ?? e?.features;

    if (__DEV__ && features?.length) {
      console.log(`[MapDebug] Tapped — ${features.length} feature(s) at point`);
      features.forEach((f: any, i: number) => {
        console.log(`[MapDebug] Feature[${i}] layer="${f?.layer?.id}" props=`, JSON.stringify(f?.properties));
      });
    } else if (__DEV__) {
      console.log('[MapDebug] Tapped — no features at this point (empty tile or outside data)');
    }

    if (features && features.length > 0) return;
    setTooltip(null);
    setSelectedFeatureId(null);
    setNearbyList([]);
    if (showLayersMenu) setShowLayersMenu(false);
  }, [showLayersMenu]);

  const handleCloseTooltip = useCallback(() => {
    setTooltip(null);
    setSelectedFeatureId(null);
    setNearbyList([]);
  }, []);

  /** Pan the map to nearbyList[idx] and update the tooltip. */
  const navigateToNearbyAt = useCallback((idx: number) => {
    const feature = nearbyList[idx];
    if (!feature || !cameraRef.current) return;
    const [lon, lat] = feature.geometry.coordinates;
    setTrackUser(undefined);
    cameraRef.current.flyTo({ center: [lon, lat], zoom: 16, duration: 600 });
    const props = feature.properties as TooltipData;
    setTooltip({ ...props, longitude: lon, latitude: lat });
    setSelectedFeatureId(props.id || null);
    setNearbyIndex(idx);
  }, [nearbyList]);

  const handleNearbyPrev = useCallback(() => {
    const prev = (nearbyIndex - 1 + nearbyList.length) % nearbyList.length;
    navigateToNearbyAt(prev);
  }, [nearbyIndex, nearbyList.length, navigateToNearbyAt]);

  const handleNearbyNext = useCallback(() => {
    const next = (nearbyIndex + 1) % nearbyList.length;
    navigateToNearbyAt(next);
  }, [nearbyIndex, nearbyList.length, navigateToNearbyAt]);

  const renderPoiSource = (
    id: string,
    data: any,
    color: string,
    iconKey: string,
  ) => {
    return (
      <GeoJSONSource
        id={id}
        data={data as any}
        cluster={true}
        clusterRadius={40}
        clusterMaxZoom={14}
        onPress={handleFeaturePress}
      >
        <Layer
          id={`${id}-cluster`}
          type="circle"
          filter={['has', 'point_count']}
          paint={{
            'circle-color': color,
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              16,
              10,
              22,
              50,
              28,
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
          }}
        />
        <Layer
          id={`${id}-cluster-count`}
          type="symbol"
          filter={['has', 'point_count']}
          layout={{
            'text-field': '{point_count_abbreviated}',
            'text-font': OFFLINE_GLYPH_FONT_STACK,
            'text-size': 14,
            'text-allow-overlap': true,
          }}
          paint={{
            'text-color': '#ffffff',
          }}
        />
        <Layer
          id={`${id}-glow`}
          type="circle"
          filter={['!', ['has', 'point_count']]}
          paint={{
            'circle-color': color,
            'circle-radius': [
              'case',
              ['==', ['get', 'id'], selectedFeatureId || ''],
              22,
              16,
            ],
            'circle-opacity': [
              'case',
              ['==', ['get', 'id'], selectedFeatureId || ''],
              0.3,
              0.15,
            ],
            'circle-blur': 0.8,
          }}
        />
        <Layer
          id={`${id}-circles`}
          type="circle"
          filter={['!', ['has', 'point_count']]}
          paint={{
            'circle-color': color,
            'circle-radius': [
              'case',
              ['==', ['get', 'id'], selectedFeatureId || ''],
              14,
              11,
            ],
            'circle-stroke-width': 2.5,
            'circle-stroke-color': COLORS.white,
          }}
        />
        <Layer
          id={`${id}-icon`}
          type="symbol"
          filter={['!', ['has', 'point_count']]}
          layout={{
            'icon-image': iconKey,
            'icon-size': [
              'case',
              ['==', ['get', 'id'], selectedFeatureId || ''],
              0.6,
              0.45,
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          }}
        />
        <Layer
          id={`${id}-name`}
          type="symbol"
          minzoom={13.5}
          filter={['!', ['has', 'point_count']]}
          layout={{
            'text-field': ['get', 'name'],
            'text-font': OFFLINE_GLYPH_FONT_STACK,
            'text-size': 12,
            'text-anchor': 'left',
            'text-offset': [1.6, 0],
            'text-optional': true,
          }}
          paint={{
            'text-color': '#111111',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2.5,
            'text-halo-blur': 0.5,
          }}
        />
      </GeoJSONSource>
    );
  };

  if (assetMissing) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AssetMissingPrompt
          iconName="map-marker-off"
          title="Offline maps not installed"
          body="Download the offline map data to see evacuation centers, hospitals, and routes without internet."
          ctaLabel="Download maps"
        />
      </SafeAreaView>
    );
  }

  if (!isMapReady || !dynamicStyle) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primaryGreen} />
          <Text style={styles.loadingText}>
            Extracting offline map for first use...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Welcome & Meeting Point Header */}
      <View style={styles.welcomeBanner}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.welcomeGreeting}>
            Mabuhay, {profile?.name || 'Friend'}
          </Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusDot}>●</Text>
            <Text style={styles.statusTxt}>Ready</Text>
          </View>
        </View>
        {profile?.location.primaryMeeting.landmark ? (
          <View style={styles.meetBanner}>
            <Icon name="map-marker" size={14} color={COLORS.lightGreen} />
            <Text style={styles.meetTxt} numberOfLines={1}>
              Meeting: {profile.location.primaryMeeting.landmark}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.container}>
        <Map
          style={styles.map}
          mapStyle={dynamicStyle}
          logo={false}
          attribution={false}
          onPress={handleMapPress}
          onRegionWillChange={() => setTrackUser(undefined)}
        >
          <Images images={icons} />
          <UserLocation />
          <Camera
            key={cameraKey}
            ref={cameraRef}
            trackUserLocation={trackUser}
            zoom={17}
            pitch={58}
            bearing={20}
            duration={3000}
          />

          {/* Fault Lines */}
          {activeFilters.faults && (
            <GeoJSONSource id="faultLineSource" data={activeFaultsGeoJSON as any}>
              <Layer
                id="faultLineBuffer"
                type="line"
                paint={{
                  'line-color': COLORS.error,
                  'line-width': 12,
                  'line-opacity': 0.15,
                }}
              />
              <Layer
                id="faultLineCore"
                type="line"
                paint={{
                  'line-color': COLORS.error,
                  'line-width': 1.5,
                }}
              />
              <Layer
                id="faultLineLabel"
                type="symbol"
                minzoom={10}
                layout={{
                  'symbol-placement': 'line',
                  'text-field': ['get', 'name'],
                  'text-font': OFFLINE_GLYPH_FONT_STACK,
                  'text-size': 11,
                  'text-letter-spacing': 0.1,
                  'text-keep-upright': true,
                  'text-offset': [0, -1],
                  'text-optional': true,
                }}
                paint={{
                  'text-color': COLORS.error,
                  'text-halo-color': '#ffffff',
                  'text-halo-width': 2,
                  'text-halo-blur': 0.5,
                }}
              />
            </GeoJSONSource>
          )}

          {/* POI Layers */}
          {activeFilters.evacuation && renderPoiSource(
            'evacuationSource',
            evacuationGeoJSON,
            COLORS.primaryGreen,
            'evacuation',
          )}
          {activeFilters.hospital && renderPoiSource(
            'hospitalSource',
            hospitalGeoJSON,
            COLORS.error,
            'hospital',
          )}
          {activeFilters.gymnasium && renderPoiSource(
            'gymnasiumSource',
            gymnasiumGeoJSON,
            '#FF9800',
            'gymnasium',
          )}
          {activeFilters.school && renderPoiSource('schoolSource', schoolGeoJSON, '#2196F3', 'school')}
          {activeFilters.multipurpose && renderPoiSource(
            'multipurposeSource',
            multiPurposeGeoJSON,
            '#9C27B0',
            'multipurpose',
          )}
          {activeFilters.covered_court && renderPoiSource(
            'coveredCourtSource',
            coveredCourtGeoJSON,
            '#9C27B0',
            'multipurpose',
          )}

          {routeGeoJSON ? (
            <GeoJSONSource id="activeRouteSource" data={routeGeoJSON as any}>
              <Layer
                id="activeRouteCasing"
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': '#091610',
                  'line-width': 7,
                  'line-opacity': 0.55,
                }}
              />
              <Layer
                id="activeRouteLine"
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': COLORS.primaryGreen,
                  'line-width': 4,
                }}
              />
            </GeoJSONSource>
          ) : null}
        </Map>

        {/* Floating Map Layers Menu */}
        {showLayersMenu && (
          <View style={styles.layersMenuContainer}>
            <View style={styles.layersHeader}>
              <Text style={styles.layersTitle}>Map Layers</Text>
              <TouchableOpacity onPress={() => setShowLayersMenu(false)}>
                <Icon name="close" size={20} color={COLORS.gray} />
              </TouchableOpacity>
            </View>
            {FILTER_OPTIONS.map(opt => (
              <TouchableOpacity 
                key={opt.id} 
                style={styles.layerItem}
                onPress={() => toggleFilter(opt.id)}
                activeOpacity={0.7}
              >
                <View style={styles.layerInfo}>
                  <View style={[styles.layerColor, { backgroundColor: opt.color }]} />
                  <Text style={styles.layerText}>{opt.label}</Text>
                </View>
                <Icon 
                  name={activeFilters[opt.id] ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} 
                  size={20} 
                  color={activeFilters[opt.id] ? COLORS.primaryGreen : '#ccc'} 
                />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Toggle Layers Button */}
        {!showLayersMenu && (
          <TouchableOpacity 
            style={styles.layersToggleBtn} 
            onPress={() => setShowLayersMenu(true)}
            activeOpacity={0.8}
          >
            <Icon name="layers" size={24} color={COLORS.gray} />
          </TouchableOpacity>
        )}

        {activeRoute ? (
          <View style={styles.routeBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.routeBannerTitle}>
                Route to {activeRoute.destinationName}
              </Text>
              <Text style={styles.routeBannerSub}>
                {(activeRoute.distanceMeters / 1000).toFixed(2)} km · ~
                {activeRoute.durationMinutesWalking} min walking
              </Text>
            </View>
            <TouchableOpacity
              style={styles.routeBannerReroute}
              onPress={handleReroute}
              disabled={isRerouting}
            >
              {isRerouting ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.routeBannerRerouteText}>Reroute</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.routeBannerClose}
              onPress={() => setActiveRoute(null)}
            >
              <Text style={styles.routeBannerCloseText}>Clear</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Find Nearest Safe Zone FAB */}
        <TouchableOpacity
          style={styles.fabNearest}
          onPress={handleFindNearestSafeZone}
          activeOpacity={0.8}
        >
          <Icon name="shield-search" size={24} color={COLORS.white} />
          <Text style={styles.fabNearestText}>Find Safe Zone</Text>
        </TouchableOpacity>

        {/* Tooltip bottom sheet — always mounted so exit animation plays */}
        <MapTooltip
          data={tooltip}
          onClose={handleCloseTooltip}
          onGetDirections={handleGetDirections}
          onPrev={nearbyList.length > 1 ? handleNearbyPrev : undefined}
          onNext={nearbyList.length > 1 ? handleNearbyNext : undefined}
          listIndex={nearbyIndex}
          listTotal={nearbyList.length}
        />

        {/* Center on Me FAB */}
        <TouchableOpacity
          style={styles.fabCenter}
          onPress={() => {
            setTrackUser('default');
            setCameraKey(prev => prev + 1);
          }}
          activeOpacity={0.8}
        >
          <Icon name="crosshairs-gps" size={28} color={COLORS.white} />
        </TouchableOpacity>

        {/* AI Chat FAB */}
        <TouchableOpacity
          style={styles.fabAi}
          onPress={() => bottomSheetRef.current?.expand()}
          activeOpacity={0.8}
        >
          <Icon name="robot" size={28} color={COLORS.white} />
        </TouchableOpacity>

        {/* AI Chat Bottom Sheet */}
        <BottomSheet
          ref={bottomSheetRef}
          index={-1}
          snapPoints={snapPoints}
          enablePanDownToClose={true}
          handleIndicatorStyle={{ backgroundColor: COLORS.lightGreen }}
          backgroundStyle={{ backgroundColor: '#f0fdf4' }}
        >
          <ChatScreen
            onClose={() => bottomSheetRef.current?.close()}
            isBottomSheet={true}
          />
        </BottomSheet>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.gray,
    fontWeight: '500',
  },
  layersToggleBtn: {
    position: 'absolute',
    left: 14,
    top: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    padding: 10,
    borderRadius: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  layersMenuContainer: {
    position: 'absolute',
    left: 14,
    top: 14,
    backgroundColor: 'rgba(255,255,255,0.98)',
    padding: 14,
    borderRadius: 16,
    width: 200,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  layersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  layersTitle: {
    fontWeight: '700',
    fontSize: 15,
    color: '#333',
  },
  layerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  layerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  layerColor: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 10,
  },
  layerText: {
    fontSize: 14,
    color: '#444',
  },
  viewToggleContainer: {
    position: 'absolute',
    top: 14,
    right: 14,
  },
  viewToggleOption: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 18,
  },
  viewToggleActive: {
    backgroundColor: COLORS.primaryGreen,
  },
  viewToggleTextActive: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  welcomeBanner: {
    backgroundColor: COLORS.darkGreen,
    paddingHorizontal: SIZES.padding,
    paddingVertical: 10,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primaryGreen,
  },
  welcomeGreeting: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.h3,
    color: COLORS.white,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusDot: { color: COLORS.accentGreen, fontSize: 10 },
  statusTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 12,
    color: COLORS.white,
  },
  meetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  meetTxt: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.lightGreen,
    flex: 1,
  },
  routeBanner: {
    position: 'absolute',
    top: 14,
    right: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(9,22,16,0.88)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  routeBannerTitle: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 13,
  },
  routeBannerSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 2,
  },
  routeBannerReroute: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.primaryGreen,
  },
  routeBannerRerouteText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 12,
  },
  routeBannerClose: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  routeBannerCloseText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 12,
  },
  fabNearest: {
    position: 'absolute',
    bottom: 168,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primaryGreen,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabNearestText: {
    color: COLORS.white,
    fontWeight: '700',
    marginLeft: 8,
    fontSize: 14,
  },
  fabCenter: {
    position: 'absolute',
    bottom: 96,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primaryGreen,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabAi: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primaryGreen,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
});

export default MapScreen;
