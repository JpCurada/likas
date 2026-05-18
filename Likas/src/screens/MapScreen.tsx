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
  Animated,
  Linking,
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
  prepareGlyphs,
  prepareGraphDb,
  MapAssetMissingError,
} from '../utils/mapAssetManager';
import { MapTooltip, TooltipData } from '../components/MapTooltip';
import { AssetMissingPrompt } from '../components/AssetMissingPrompt';
import { useAppStore } from '../stores/appStore';
import { loadProfile, UserProfile } from '../database/storage';
import { useFocusEffect } from '@react-navigation/native';
import { routingService, GraphNotLoadedError, NoRouteError, RouteTooLongError } from '../services/routingService';
import activeFaultsGeoJSON from '../data/gem_active_faults_harmonized.json';
import { ChatScreen } from './ChatScreen';
import { Icon } from '../components/Icon';
import { SosFab } from '../components/SosFab';
import {
  ANDROID_LOCATION_PERMISSION_MESSAGE,
  geolocationIssueFromError,
  type GeolocationUserIssue,
} from '../utils/geolocationUserMessages';

// Bundled offline style base
const baseOfflineStyle = require('../../assets/maps/style.json');
const OFFLINE_GLYPH_FONT_STACK = ['Noto Sans Regular'];

const METRO_CENTER: [number, number] = [120.9842, 14.5995];

/** Steady-state 3D map camera — same as before entry-fly work. */
const MAP_CAMERA_ZOOM = 17;
const MAP_CAMERA_PITCH = 58;
const MAP_CAMERA_BEARING = 20;

/** Wide flat view used only for the one-time entry zoom-in. */
const MAP_ENTRY_START_ZOOM = 10;
const MAP_ENTRY_START_PITCH = 0;
const MAP_ENTRY_FLY_MS = 2200;
const MAP_ENTRY_FLY_DELAY_MS = 200;
const MAP_ENTRY_GPS_WAIT_MS = 1200;

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
  const entryFlyDoneRef = useRef(false);
  const [entryFlyComplete, setEntryFlyComplete] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
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

  const [trackUser, setTrackUser] = useState<TrackUserLocation | undefined>(
    undefined,
  );
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [chatSheetIndex, setChatSheetIndex] = useState(-1);
  const [mapAreaHeight, setMapAreaHeight] = useState(0);
  const [icons, setIcons] = useState<any>({});
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [nearbyList, setNearbyList] = useState<any[]>([]);
  const [nearbyIndex, setNearbyIndex] = useState(0);

  const snapPoints = useMemo(() => ['15%', '50%', '90%'], []);

  const chatSheetSnapFractions = useMemo(
    () => snapPoints.map(s => Number(String(s).replace(/%/g, '')) / 100),
    [snapPoints],
  );

  const sosLiftForChatSheetPx = useMemo(() => {
    if (chatSheetIndex < 0 || mapAreaHeight <= 0) {
      return 0;
    }
    const f = chatSheetSnapFractions[chatSheetIndex];
    if (f == null || Number.isNaN(f)) {
      return 0;
    }
    return f * mapAreaHeight;
  }, [chatSheetIndex, mapAreaHeight, chatSheetSnapFractions]);

  const [assetMissing, setAssetMissing] = useState(false);
  const [isRerouting, setIsRerouting] = useState(false);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [calcDestName, setCalcDestName] = useState('');
  const calcPillAnim = useRef(new Animated.Value(400)).current;
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRoute = useAppStore(s => s.activeRoute);
  const setActiveRoute = useAppStore(s => s.setActiveRoute);
  const nearbyPins = useAppStore(s => s.nearbyPins);
  const setNearbyPins = useAppStore(s => s.setNearbyPins);
  const pendingMapFocus = useAppStore(s => s.pendingMapFocus);
  const setPendingMapFocus = useAppStore(s => s.setPendingMapFocus);
  const setOfflineMapStyle = useAppStore(s => s.setOfflineMapStyle);
  const setLiveLocation = useAppStore(s => s.setLiveLocation);

  const handleCancelCalculation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsCalculatingRoute(false);
    setIsRerouting(false);
  }, []);

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

  const nearbyPinsGeoJSON = useMemo(() => {
    if (!nearbyPins || nearbyPins.length === 0) return null;
    return {
      type: 'FeatureCollection',
      features: nearbyPins.map((p, i) => ({
        type: 'Feature',
        properties: {
          id: `ai-nearby-${i}`,
          name: p.name,
          address: p.address,
        },
        geometry: {
          type: 'Point',
          coordinates: [p.coordinates.longitude, p.coordinates.latitude],
        },
      })),
    };
  }, [nearbyPins]);

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

  // Slide route-calc pill up into view when calculating, drop it back off-screen when done
  useEffect(() => {
    Animated.spring(calcPillAnim, {
      toValue: isCalculatingRoute ? 0 : 400,
      useNativeDriver: true,
      tension: 68,
      friction: 12,
    }).start();
  }, [isCalculatingRoute, calcPillAnim]);

  useEffect(() => {
    const initializeMap = async () => {
      try {
        console.log('[MapScreen] Starting map initialization...');
        const absoluteMbtilesUrl = await prepareOfflineMap();

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
        // Publish the processed style to the global store so other screens
        // (e.g. MeetingPointPickerModal) can reuse it without re-initialising.
        setOfflineMapStyle(buildStyle(newStyle, true, {}));
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
  const [locationIssue, setLocationIssue] = useState<GeolocationUserIssue | null>(
    null,
  );
  const [geoSession, setGeoSession] = useState(0);

  const entryCenter = useMemo((): [number, number] => {
    if (userLocation) return userLocation;
    const meeting = profile?.location?.primaryMeeting?.coordinates;
    if (meeting?.latitude != null && meeting?.longitude != null) {
      return [meeting.longitude, meeting.latitude];
    }
    const home = profile?.location?.coordinates;
    if (home?.latitude != null && home?.longitude != null) {
      return [home.longitude, home.latitude];
    }
    return METRO_CENTER;
  }, [userLocation, profile]);

  const retryLocationAccess = useCallback(() => {
    setLocationIssue(null);
    setGeoSession(k => k + 1);
  }, []);

  // Request permission then watch GPS — geoSession bump retries after the user fixes settings.
  useEffect(() => {
    let watchId: number | null = null;
    let cancelled = false;

    const publish = (longitude: number, latitude: number) => {
      if (cancelled) return;
      setLocationIssue(null);
      setUserLocation([longitude, latitude]);
      // Also publish to the global store so AI tools (find_nearby /
      // route_to_nearest_evacuation) can use the user's CURRENT position
      // as the "nearest from" origin instead of the onboarded home
      // coordinates. Without this, every AI-suggested location is ranked
      // relative to where the user lived when they set up the app.
      setLiveLocation({latitude, longitude});
    };

    const onHardFailure = (error: { code: number; message: string }) => {
      if (cancelled) return;
      setLocationIssue(geolocationIssueFromError(error.code, error.message));
      setLiveLocation(null);
    };

    const startTracking = () => {
      Geolocation.getCurrentPosition(
        position =>
          publish(position.coords.longitude, position.coords.latitude),
        err => onHardFailure(err),
        {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 30000,
        },
      );
      watchId = Geolocation.watchPosition(
        position =>
          publish(position.coords.longitude, position.coords.latitude),
        err => {
          console.warn('[MapScreen] watchPosition error:', err);
          setUserLocation(prev => {
            if (prev === null && !cancelled) {
              onHardFailure(err);
            }
            return prev;
          });
        },
        { enableHighAccuracy: false, distanceFilter: 5 },
      );
    };

    const run = async () => {
      if (Platform.OS === 'android') {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location for offline map',
            message: ANDROID_LOCATION_PERMISSION_MESSAGE,
            buttonPositive: 'Allow',
            buttonNegative: 'Not now',
          },
        );
        if (cancelled) return;
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          onHardFailure({ code: 1, message: 'permission_denied' });
          return;
        }
      }
      startTracking();
    };

    void run();

    return () => {
      cancelled = true;
      if (watchId !== null) Geolocation.clearWatch(watchId);
    };
  }, [setLiveLocation, geoSession]);

  // One-time entry zoom: start wide, then fly into the user's position in 3D.
  useEffect(() => {
    if (!isMapReady || !isMapLoaded || !dynamicStyle || entryFlyDoneRef.current) {
      return;
    }

    const shouldSkip =
      activeRoute != null || (nearbyPins != null && nearbyPins.length > 0);

    if (shouldSkip) {
      entryFlyDoneRef.current = true;
      setEntryFlyComplete(true);
      setTrackUser('default');
      return;
    }

    let cancelled = false;
    let flyTimer: ReturnType<typeof setTimeout> | undefined;
    let zoomTimer: ReturnType<typeof setTimeout> | undefined;
    let trackTimer: ReturnType<typeof setTimeout> | undefined;
    let gpsWaitTimer: ReturnType<typeof setTimeout> | undefined;

    const animateTo = (lon: number, lat: number) => {
      if (cancelled || entryFlyDoneRef.current) return;
      entryFlyDoneRef.current = true;

      flyTimer = setTimeout(() => {
        if (cancelled) return;
        cameraRef.current?.jumpTo({
          center: [lon, lat],
          zoom: MAP_ENTRY_START_ZOOM,
          pitch: MAP_ENTRY_START_PITCH,
          bearing: 0,
        });
        zoomTimer = setTimeout(() => {
          if (cancelled) return;
          cameraRef.current?.flyTo({
            center: [lon, lat],
            zoom: MAP_CAMERA_ZOOM,
            pitch: MAP_CAMERA_PITCH,
            bearing: MAP_CAMERA_BEARING,
            duration: MAP_ENTRY_FLY_MS,
          });
          trackTimer = setTimeout(() => {
            if (!cancelled) {
              setEntryFlyComplete(true);
              setTrackUser('default');
            }
          }, MAP_ENTRY_FLY_MS + 100);
        }, 80);
      }, MAP_ENTRY_FLY_DELAY_MS);
    };

    if (userLocation) {
      animateTo(userLocation[0], userLocation[1]);
    } else {
      gpsWaitTimer = setTimeout(() => {
        if (cancelled || entryFlyDoneRef.current) return;
        animateTo(entryCenter[0], entryCenter[1]);
      }, MAP_ENTRY_GPS_WAIT_MS);
    }

    return () => {
      cancelled = true;
      if (flyTimer) clearTimeout(flyTimer);
      if (zoomTimer) clearTimeout(zoomTimer);
      if (trackTimer) clearTimeout(trackTimer);
      if (gpsWaitTimer) clearTimeout(gpsWaitTimer);
    };
  }, [
    isMapReady,
    isMapLoaded,
    dynamicStyle,
    userLocation,
    entryCenter,
    activeRoute,
    nearbyPins,
  ]);

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

  useEffect(() => {
    if (!nearbyPins || nearbyPins.length === 0 || !isMapReady) return;
    let minLon = nearbyPins[0].coordinates.longitude;
    let maxLon = nearbyPins[0].coordinates.longitude;
    let minLat = nearbyPins[0].coordinates.latitude;
    let maxLat = nearbyPins[0].coordinates.latitude;
    for (const p of nearbyPins) {
      if (p.coordinates.longitude < minLon) minLon = p.coordinates.longitude;
      if (p.coordinates.longitude > maxLon) maxLon = p.coordinates.longitude;
      if (p.coordinates.latitude < minLat) minLat = p.coordinates.latitude;
      if (p.coordinates.latitude > maxLat) maxLat = p.coordinates.latitude;
    }
    // ensure a small padding if there's only 1 pin or they are very close
    if (maxLon - minLon < 0.001) { minLon -= 0.005; maxLon += 0.005; }
    if (maxLat - minLat < 0.001) { minLat -= 0.005; maxLat += 0.005; }

    cameraRef.current?.fitBounds([minLon, minLat, maxLon, maxLat], {
      padding: { top: 120, bottom: 80, left: 60, right: 60 },
      duration: 1200,
    });
  }, [nearbyPins, isMapReady]);

  // A chat-driven tool produced a route or pins. Snap the chat sheet to its
  // half-screen point (index 1 = 50%) so the map stays dominant on top while
  // the conversation — still streaming — remains visible below. The fitBounds
  // effects above animate the camera to the new geometry in parallel.
  useEffect(() => {
    if (!pendingMapFocus || !isMapReady) return;
    bottomSheetRef.current?.snapToIndex(1);
    setPendingMapFocus(null);
  }, [pendingMapFocus, isMapReady, setPendingMapFocus]);

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
      err => {
        const issue = geolocationIssueFromError(err.code, err.message);
        Alert.alert(issue.title, issue.message);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 },
    );
  }, [userLocation, findAndNavigateToSafeZone]);

  const handleGetDirections = useCallback(async (dest: TooltipData) => {
    if (!dest.latitude || !dest.longitude) return;

    handleCancelCalculation(); // Abort any existing one
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsCalculatingRoute(true);
    setCalcDestName(dest.name);

    try {
      const origin = userLocation
        ? { latitude: userLocation[1], longitude: userLocation[0] }
        : await new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
            Geolocation.getCurrentPosition(
              p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
              reject,
              { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 },
            );
            controller.signal.addEventListener('abort', () => reject(new Error('Aborted')));
          }).catch((e: unknown) => {
            if (e instanceof Error && e.message === 'Aborted') return null;
            const geo = e as { code?: number; message?: string };
            const issue =
              typeof geo?.code === 'number'
                ? geolocationIssueFromError(geo.code, geo.message)
                : null;
            Alert.alert(
              issue?.title ?? 'Location unavailable',
              issue?.message ?? 'Could not determine your current location.',
            );
            return null;
          });

      if (!origin) {
        setIsCalculatingRoute(false);
        return;
      }

      if (controller.signal.aborted) return;

      const route = await routingService.route(origin, {
        latitude: dest.latitude,
        longitude: dest.longitude,
      }, controller.signal);

      setActiveRoute({
        ...route,
        destination: { latitude: dest.latitude, longitude: dest.longitude },
        destinationName: dest.name,
      });
    } catch (err: any) {
      if (err.message === 'Aborted') return;
      if (err instanceof GraphNotLoadedError || err instanceof RouteTooLongError) {
        // No walking route available (graph missing, or destination beyond the
        // pedestrian routing cap). We deliberately do NOT draw a straight line —
        // a fake path is misleading in an emergency. Just drop the destination
        // as a pin and tell the user plainly.
        setNearbyPins([
          {
            name: dest.name,
            address: '',
            distanceKm: 0,
            coordinates: { latitude: dest.latitude, longitude: dest.longitude },
          },
        ]);
        setPendingMapFocus('nearby');
        Alert.alert(
          'Too far to route on foot',
          err instanceof RouteTooLongError
            ? `${dest.name} is beyond the walking-route range. Its location is shown on the map — head toward it and use the in-app route once you are closer.`
            : `Offline pedestrian map data is not installed, so a walking route can't be drawn. ${dest.name}'s location is shown on the map.`,
        );
        console.warn(`[MapScreen] No route drawn — ${err.message}`);
      } else {
        Alert.alert(
          'Routing failed',
          err?.message ?? 'Could not calculate a walking route to this location.',
        );
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setIsCalculatingRoute(false);
        abortControllerRef.current = null;
      }
    }
  }, [userLocation, setActiveRoute, handleCancelCalculation]);

  const handleReroute = useCallback(async () => {
    if (!userLocation || !activeRoute) {
      Alert.alert('Cannot reroute', 'Location and active route are required.');
      return;
    }

    handleCancelCalculation(); // Abort any existing one
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsRerouting(true);
    const origin = { latitude: userLocation[1], longitude: userLocation[0] };
    const dest = activeRoute.destination;

    try {
      const newRoute = await routingService.route(origin, dest, controller.signal);
      setActiveRoute({
        ...activeRoute,
        ...newRoute,
      });
    } catch (err: any) {
      if (err.message === 'Aborted') return;
      if (err instanceof GraphNotLoadedError || err instanceof RouteTooLongError) {
        // No straight-line fallback — clear the stale route and just show the
        // destination location so the user isn't misled by a fake path.
        setNearbyPins([
          {
            name: activeRoute.destinationName ?? 'Destination',
            address: '',
            distanceKm: 0,
            coordinates: { latitude: dest.latitude, longitude: dest.longitude },
          },
        ]);
        setPendingMapFocus('nearby');
        Alert.alert(
          'Cannot reroute on foot',
          err instanceof RouteTooLongError
            ? 'Your current position is beyond the walking-route range from the destination. Its location is still shown on the map.'
            : 'Offline pedestrian map data is not installed, so a walking route can\'t be recalculated. The destination is still shown on the map.',
        );
        console.warn(`[MapScreen] Reroute — no route drawn: ${err.message}`);
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
      if (abortControllerRef.current === controller) {
        setIsRerouting(false);
        abortControllerRef.current = null;
      }
    }
  }, [userLocation, activeRoute, setActiveRoute, handleCancelCalculation]);

  const handleRouteToPrimaryMeeting = useCallback(() => {
    if (!profile) return;
    const pm = profile.location.primaryMeeting;
    const c = pm.coordinates;
    if (c == null || typeof c.latitude !== 'number' || typeof c.longitude !== 'number') {
      Alert.alert(
        'Meeting point not pinned',
        'Open Profile and use "Tap to pin on map" for your primary meeting point, then you can get walking directions here.',
      );
      return;
    }
    handleGetDirections({
      name: pm.landmark?.trim() ? pm.landmark : 'Primary meeting point',
      type: 'Meeting point',
      category: 'meeting',
      pointType: 'school',
      latitude: c.latitude,
      longitude: c.longitude,
    });
  }, [profile, handleGetDirections]);

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
        </View>
        {locationIssue ? (
          <View
            style={styles.locationIssueBanner}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite">
            <Icon
              name="crosshairs-question"
              size={18}
              color={COLORS.accentGreen}
            />
            <View style={styles.locationIssueTextCol}>
              <Text style={styles.locationIssueTitle}>{locationIssue.title}</Text>
              <Text style={styles.locationIssueBody}>{locationIssue.message}</Text>
            </View>
            <View style={styles.locationIssueActions}>
              <TouchableOpacity
                style={styles.locationIssueBtn}
                onPress={retryLocationAccess}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.locationIssueBtnTxt}>Retry</Text>
              </TouchableOpacity>
              {locationIssue.code === 'permission_denied' ? (
                <TouchableOpacity
                  style={styles.locationIssueBtn}
                  onPress={() => {
                    void Linking.openSettings();
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.locationIssueBtnTxt}>Settings</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
        {profile?.location.primaryMeeting.landmark ? (
          <View style={styles.meetBanner}>
            <Icon name="map-marker" size={14} color={COLORS.lightGreen} />
            <Text style={styles.meetTxt} numberOfLines={1}>
              Meeting: {profile.location.primaryMeeting.landmark}
            </Text>
            <TouchableOpacity
              style={styles.meetRouteBtn}
              onPress={handleRouteToPrimaryMeeting}
              activeOpacity={0.85}
              accessibilityLabel="Walking route to primary meeting point"
              accessibilityRole="button">
              <Icon name="routes" size={15} color={COLORS.white} />
              <Text style={styles.meetRouteBtnText}>Route</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <View
        style={styles.container}
        onLayout={e => setMapAreaHeight(e.nativeEvent.layout.height)}>
        <Map
          style={styles.map}
          mapStyle={dynamicStyle}
          logo={false}
          attribution={false}
          onPress={handleMapPress}
          onRegionWillChange={() => setTrackUser(undefined)}
          onDidFinishLoadingMap={() => setIsMapLoaded(true)}
        >
          <Images images={icons} />
          <UserLocation />
          <Camera
            key={cameraKey}
            ref={cameraRef}
            trackUserLocation={trackUser}
            {...(entryFlyComplete
              ? {
                  zoom: MAP_CAMERA_ZOOM,
                  pitch: MAP_CAMERA_PITCH,
                  bearing: MAP_CAMERA_BEARING,
                  duration: 3000,
                }
              : {
                  initialViewState: {
                    center: entryCenter,
                    zoom: MAP_ENTRY_START_ZOOM,
                    pitch: MAP_ENTRY_START_PITCH,
                    bearing: 0,
                  },
                })}
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

          {nearbyPinsGeoJSON ? (
            <GeoJSONSource id="aiNearbyPinsSource" data={nearbyPinsGeoJSON as any}>
              <Layer
                id="aiNearbyPinsHalo"
                type="circle"
                paint={{
                  'circle-color': COLORS.primaryGreen,
                  'circle-radius': 24,
                  'circle-opacity': 0.25,
                  'circle-blur': 0.8,
                }}
              />
              <Layer
                id="aiNearbyPinsMarker"
                type="circle"
                paint={{
                  'circle-color': COLORS.primaryGreen,
                  'circle-radius': 10,
                  'circle-stroke-width': 3,
                  'circle-stroke-color': COLORS.white,
                }}
              />
              <Layer
                id="aiNearbyPinsLabel"
                type="symbol"
                layout={{
                  'text-field': ['get', 'name'],
                  'text-font': OFFLINE_GLYPH_FONT_STACK,
                  'text-size': 13,
                  'text-anchor': 'bottom',
                  'text-offset': [0, -1.2],
                }}
                paint={{
                  'text-color': '#111',
                  'text-halo-color': '#fff',
                  'text-halo-width': 2,
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
              activeOpacity={0.7}
            >
              <Icon name="close" size={18} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Route calculation loading pill */}
        <Animated.View
          style={[
            styles.routeCalcPill,
            { transform: [{ translateY: calcPillAnim }] },
          ]}
          pointerEvents={isCalculatingRoute || isRerouting ? 'auto' : 'none'}
        >
          <ActivityIndicator size="small" color={COLORS.primaryGreen} />
          <View style={{ flex: 1 }}>
            <Text style={styles.routeCalcLabel}>Calculating route</Text>
            <Text style={styles.routeCalcDest} numberOfLines={1}>
              {calcDestName || 'Rerouting...'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.routeCalcCancel}
            onPress={handleCancelCalculation}
            activeOpacity={0.7}
          >
            <Icon name="close" size={16} color={COLORS.primaryGreen} />
          </TouchableOpacity>
        </Animated.View>

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

        <SosFab liftForSheetPx={0} />

        {/* AI Chat Bottom Sheet */}
        <BottomSheet
          ref={bottomSheetRef}
          index={-1}
          snapPoints={snapPoints}
          enablePanDownToClose={true}
          onChange={setChatSheetIndex}
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
  locationIssueBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 6,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  locationIssueTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  locationIssueTitle: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 13,
    color: COLORS.white,
  },
  locationIssueBody: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 16,
  },
  locationIssueActions: {
    flexDirection: 'column',
    gap: 6,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  locationIssueBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  locationIssueBtnTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 12,
    color: COLORS.accentGreen,
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
    minWidth: 0,
  },
  meetRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryGreen,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  meetRouteBtnText: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 11,
    color: COLORS.white,
    letterSpacing: 0.2,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
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
  routeCalcPill: {
    position: 'absolute',
    bottom: 236,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 32,
    gap: 12,
    maxWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 14,
    borderWidth: 1,
    borderColor: COLORS.lightGreen,
  },
  routeCalcLabel: {
    fontFamily: FONTS.primaryMedium,
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.primaryGreen,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  routeCalcDest: {
    fontFamily: FONTS.primaryBold,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.darkGreen,
    marginTop: 1,
  },
  routeCalcCancel: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 179, 114, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default MapScreen;
