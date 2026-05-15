import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { StyleSheet, View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Map, Camera, GeoJSONSource, Layer, Images } from '@maplibre/maplibre-react-native';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS } from '../theme';
import { getEvacuationGeoJSON, getHospitalGeoJSON, getGymnasiumGeoJSON, getSchoolGeoJSON, getMultiPurposeGeoJSON, getCoveredCourtGeoJSON } from '../utils/geoUtils';
import { prepareOfflineMap, prepareGlyphs, MapAssetMissingError } from '../utils/mapAssetManager';
import { MapTooltip, TooltipData } from '../components/MapTooltip';
import { AssetMissingPrompt } from '../components/AssetMissingPrompt';
import { useAppStore } from '../stores/appStore';
import activeFaultsGeoJSON from '../data/gem_active_faults_harmonized.json';

// Metro Manila center
const INITIAL_COORDINATES = [121.0509, 14.5823];

// Bundled offline style base
const baseOfflineStyle = require('../../assets/maps/style.json');
const OFFLINE_GLYPH_FONT_STACK = ['Noto Sans Regular'];

/** Rebuilds the style object with building layers toggled between 2D / 3D */
const buildStyle = (base: any, is3D: boolean): any => {
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
      return { ...layer, layout: { ...layer.layout, visibility: is3D ? 'none' : 'visible' } };
    }
    if (layer.id === 'building-3d') {
      return { ...layer, layout: { ...layer.layout, visibility: is3D ? 'visible' : 'none' } };
    }
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

export const MapScreen: React.FC = () => {
  const cameraRef = useRef<CameraRef>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [baseStyle, setBaseStyle] = useState<any>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('2D');
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const [assetMissing, setAssetMissing] = useState(false);
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
            coordinates: activeRoute.polyline.map(p => [p.longitude, p.latitude]),
          },
        },
      ],
    };
  }, [activeRoute]);

  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [icons, setIcons] = useState<any>({});

  const evacuationGeoJSON = useMemo(() => getEvacuationGeoJSON(), []);
  const hospitalGeoJSON = useMemo(() => getHospitalGeoJSON(), []);
  const gymnasiumGeoJSON = useMemo(() => getGymnasiumGeoJSON(), []);
  const schoolGeoJSON = useMemo(() => getSchoolGeoJSON(), []);
  const multiPurposeGeoJSON = useMemo(() => getMultiPurposeGeoJSON(), []);
  const coveredCourtGeoJSON = useMemo(() => getCoveredCourtGeoJSON(), []);

  // Derive the active style from base + current viewMode
  const dynamicStyle = useMemo(() => {
    if (!baseStyle) return null;
    return buildStyle(baseStyle, viewMode === '3D');
  }, [baseStyle, viewMode]);

  useEffect(() => {
    const initializeMap = async () => {
      try {
        const [absoluteMbtilesUrl, glyphsPath] = await Promise.all([
          prepareOfflineMap(),
          prepareGlyphs(),
        ]);
        const newStyle = JSON.parse(JSON.stringify(baseOfflineStyle));
        newStyle.sources.openmaptiles.url = absoluteMbtilesUrl;
        newStyle.glyphs = glyphsPath;
        
        if (__DEV__) {
          console.log('[MapScreen] 🗺️ Initializing Offline Map');
          console.log('[MapScreen] 📦 MBTiles path:', absoluteMbtilesUrl);
          console.log('[MapScreen] 🔤 Glyphs path:', glyphsPath);
        }

        setBaseStyle(newStyle);
        setIsMapReady(true);
      } catch (error) {
        if (error instanceof MapAssetMissingError) {
          setAssetMissing(true);
          return;
        }
        console.error('Failed to initialize offline map:', error);
      }
    };

    const loadIcons = async () => {
      try {
        const evacuationIcon = await MaterialCommunityIcons.getImageSource(ICON_NAMES.evacuation, 40, '#ffffff');
        const hospitalIcon = await MaterialCommunityIcons.getImageSource(ICON_NAMES.hospital, 40, '#ffffff');
        const gymnasiumIcon = await MaterialCommunityIcons.getImageSource(ICON_NAMES.gymnasium, 40, '#ffffff');
        const schoolIcon = await MaterialCommunityIcons.getImageSource(ICON_NAMES.school, 40, '#ffffff');
        const multipurposeIcon = await MaterialCommunityIcons.getImageSource(ICON_NAMES.multipurpose, 40, '#ffffff');
        
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
      padding: {top: 120, bottom: 80, left: 60, right: 60},
      duration: 900,
    });
  }, [activeRoute, isMapReady]);

  const handleToggleView = useCallback(() => {
    const next: ViewMode = viewMode === '2D' ? '3D' : '2D';
    setViewMode(next);
    cameraRef.current?.flyTo({
      center: INITIAL_COORDINATES as [number, number],
      zoom: next === '3D' ? 15 : 12,
      pitch: next === '3D' ? 58 : 0,
      bearing: next === '3D' ? 20 : 0,
      duration: 900,
      easing: 'fly',
    });
  }, [viewMode]);

  const handleFeaturePress = useCallback((e: any) => {
    const feature = e?.nativeEvent?.features?.[0] ?? e?.features?.[0];
    if (!feature?.properties) return;
    if (e.stopPropagation) e.stopPropagation();

    // Check if it's a cluster tap
    if (feature.properties.cluster) {
      return;
    }

    const coords = feature?.geometry?.coordinates;
    const props = feature.properties as TooltipData;
    setTooltip({
      ...props,
      longitude: coords?.[0] ?? undefined,
      latitude: coords?.[1] ?? undefined,
    });
    setSelectedFeatureId(props.id || null);
  }, []);

  const handleMapPress = useCallback((e: any) => {
    const features = e?.nativeEvent?.features ?? e?.features;
    if (features && features.length > 0) return;
    setTooltip(null);
    setSelectedFeatureId(null);
  }, []);

  const handleCloseTooltip = useCallback(() => {
    setTooltip(null);
    setSelectedFeatureId(null);
  }, []);

  const renderPoiSource = (id: string, data: any, color: string, iconKey: string) => {
    return (
      <GeoJSONSource
        id={id}
        data={data as any}
        cluster={true}
        clusterRadius={40}
        clusterMaxZoom={14}
        onPress={handleFeaturePress}
      >
        {/* Cluster Layer */}
        <Layer
          id={`${id}-cluster`}
          type="circle"
          filter={['has', 'point_count']}
          paint={{
            'circle-color': color,
            'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28],
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

        {/* Unclustered Point Layer */}
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
          <Text style={styles.loadingText}>Extracting offline map for first use...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Map
          style={styles.map}
          mapStyle={dynamicStyle}
          logo={false}
          attribution={false}
          onPress={handleMapPress}
        >
          <Images images={icons} />
          <Camera
            ref={cameraRef}
            initialViewState={{
              center: INITIAL_COORDINATES as [number, number],
              zoom: 12,
              pitch: 0,
              bearing: 0,
            }}
          />

          {/* Fault Lines */}
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

          {/* POI Layers */}
          {renderPoiSource('evacuationSource', evacuationGeoJSON, COLORS.primaryGreen, 'evacuation')}
          {renderPoiSource('hospitalSource', hospitalGeoJSON, COLORS.error, 'hospital')}
          {renderPoiSource('gymnasiumSource', gymnasiumGeoJSON, '#FF9800', 'gymnasium')}
          {renderPoiSource('schoolSource', schoolGeoJSON, '#2196F3', 'school')}
          {renderPoiSource('multipurposeSource', multiPurposeGeoJSON, '#9C27B0', 'multipurpose')}
          {renderPoiSource('coveredCourtSource', coveredCourtGeoJSON, '#9C27B0', 'multipurpose')}

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
              style={styles.routeBannerClose}
              onPress={() => setActiveRoute(null)}
            >
              <Text style={styles.routeBannerCloseText}>Clear</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ─── 2D / 3D View Toggle ──────────────────────────────────────── */}
        <View style={styles.viewToggleContainer}>
          <View style={styles.viewTogglePill}>
            <TouchableOpacity
              style={[styles.viewToggleOption, viewMode === '2D' && styles.viewToggleActive]}
              onPress={() => viewMode !== '2D' && handleToggleView()}
              activeOpacity={0.8}
            >
              <Text style={[styles.viewToggleText, viewMode === '2D' && styles.viewToggleTextActive]}>
                2D
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewToggleOption, viewMode === '3D' && styles.viewToggleActive]}
              onPress={() => viewMode !== '3D' && handleToggleView()}
              activeOpacity={0.8}
            >
              <Text style={[styles.viewToggleText, viewMode === '3D' && styles.viewToggleTextActive]}>
                3D
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tooltip bottom sheet — always mounted so exit animation plays */}
        <MapTooltip data={tooltip} onClose={handleCloseTooltip} />
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
  // ─── 2D / 3D Toggle ───────────────────────────────────────────────────
  viewToggleContainer: {
    position: 'absolute',
    top: 14,
    left: 14,
  },
  viewTogglePill: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    padding: 3,
    gap: 2,
  },
  viewToggleOption: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 18,
  },
  viewToggleActive: {
    backgroundColor: COLORS.primaryGreen,
  },
  viewToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
  },
  viewToggleTextActive: {
    color: '#ffffff',
  },
  routeBanner: {
    position: 'absolute',
    top: 14,
    right: 14,
    left: 78,
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
});

export default MapScreen;