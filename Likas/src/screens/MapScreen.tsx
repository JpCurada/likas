import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { StyleSheet, View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Map, Camera, GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { COLORS } from '../theme';
import { getEvacuationGeoJSON, getHospitalGeoJSON, getGymnasiumGeoJSON, getSchoolGeoJSON, getMultiPurposeGeoJSON, getCoveredCourtGeoJSON } from '../utils/geoUtils';
import { prepareOfflineMap, prepareGlyphs, MapAssetMissingError } from '../utils/mapAssetManager';
import { MapTooltip, TooltipData } from '../components/MapTooltip';
import { AssetMissingPrompt } from '../components/AssetMissingPrompt';
import { useAppStore } from '../stores/appStore';

// Metro Manila center
const INITIAL_COORDINATES = [121.0509, 14.5823];

// Metro Manila approximate bounding box
const METRO_MANILA_BOUNDS = {
  minLon: 120.85,
  maxLon: 121.30,
  minLat: 14.25,
  maxLat: 14.90,
};

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
    initializeMap();
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
    // MapLibre RN v11 wraps events in NativeSyntheticEvent — data is in nativeEvent
    const feature = e?.nativeEvent?.features?.[0] ?? e?.features?.[0];
    if (!feature?.properties) return;
    // Stop the event from bubbling up to <Map onPress> so it doesn't dismiss
    if (e.stopPropagation) e.stopPropagation();
    // Extract lat/lon from the GeoJSON geometry so MapTooltip can open Maps
    const coords = feature?.geometry?.coordinates;
    const props = feature.properties as TooltipData;
    setTooltip({
      ...props,
      longitude: coords?.[0] ?? undefined,
      latitude: coords?.[1] ?? undefined,
    });
  }, []);

  // Map background tap: dismiss tooltip
  // Safety: if features exist in the event (propagation wasn't stopped), don't dismiss
  const handleMapPress = useCallback((e: any) => {
    const features = e?.nativeEvent?.features ?? e?.features;
    if (features && features.length > 0) return;
    setTooltip(null);
  }, []);

  const handleCloseTooltip = useCallback(() => setTooltip(null), []);

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
          <Camera
            ref={cameraRef}
            initialViewState={{
              center: INITIAL_COORDINATES as [number, number],
              zoom: 12,
              pitch: 0,
              bearing: 0,
            }}
          />

          {/* Evacuation Centers (rendered after overlay = higher z) */}
          <GeoJSONSource
            id="evacuationSource"
            data={evacuationGeoJSON as any}
            onPress={handleFeaturePress}
          >
            {/* Outer glow ring */}
            <Layer
              id="evacuationGlow"
              type="circle"
              paint={{
                'circle-color': COLORS.primaryGreen,
                'circle-radius': 14,
                'circle-opacity': 0.15,
                'circle-blur': 0.8,
              }}
            />
            {/* Main badge body */}
            <Layer
              id="evacuationCircles"
              type="circle"
              paint={{
                'circle-color': COLORS.primaryGreen,
                'circle-radius': 8,
                'circle-stroke-width': 2.5,
                'circle-stroke-color': COLORS.white,
              }}
            />
            {/* Icon label */}
            <Layer
              id="evacuationLabel"
              type="symbol"
              layout={{
                'text-field': '🛡️',
                'text-font': OFFLINE_GLYPH_FONT_STACK,
                'text-size': 10,
                'text-anchor': 'center',
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              }}
              paint={{
                'text-color': '#ffffff',
              }}
            />
            {/* Always-visible Name Tooltip */}
            <Layer
              id="evacuationNameTooltip"
              type="symbol"
              minzoom={13.5}
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

          {/* Hospitals (rendered last = highest z) */}
          <GeoJSONSource
            id="hospitalSource"
            data={hospitalGeoJSON as any}
            onPress={handleFeaturePress}
          >
            {/* Outer glow ring */}
            <Layer
              id="hospitalGlow"
              type="circle"
              paint={{
                'circle-color': COLORS.error,
                'circle-radius': 14,
                'circle-opacity': 0.15,
                'circle-blur': 0.8,
              }}
            />
            {/* Main badge body */}
            <Layer
              id="hospitalCircles"
              type="circle"
              paint={{
                'circle-color': COLORS.error,
                'circle-radius': 8,
                'circle-stroke-width': 2.5,
                'circle-stroke-color': COLORS.white,
              }}
            />
            {/* Icon label */}
            <Layer
              id="hospitalLabel"
              type="symbol"
              layout={{
                'text-field': '🏥',
                'text-font': OFFLINE_GLYPH_FONT_STACK,
                'text-size': 10,
                'text-anchor': 'center',
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              }}
              paint={{
                'text-color': '#ffffff',
              }}
            />
            {/* Always-visible Name Tooltip */}
            <Layer
              id="hospitalNameTooltip"
              type="symbol"
              minzoom={13.5}
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

          {/* Gymnasiums (rendered after hospitals) */}
          <GeoJSONSource
            id="gymnasiumSource"
            data={gymnasiumGeoJSON as any}
            onPress={handleFeaturePress}
          >
            {/* Outer glow ring */}
            <Layer
              id="gymnasiumGlow"
              type="circle"
              paint={{
                'circle-color': '#FF9800',
                'circle-radius': 14,
                'circle-opacity': 0.15,
                'circle-blur': 0.8,
              }}
            />
            {/* Main badge body */}
            <Layer
              id="gymnasiumCircles"
              type="circle"
              paint={{
                'circle-color': '#FF9800',
                'circle-radius': 8,
                'circle-stroke-width': 2.5,
                'circle-stroke-color': COLORS.white,
              }}
            />
            {/* Icon label */}
            <Layer
              id="gymnasiumLabel"
              type="symbol"
              layout={{
                'text-field': '🏀',
                'text-font': OFFLINE_GLYPH_FONT_STACK,
                'text-size': 10,
                'text-anchor': 'center',
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              }}
              paint={{
                'text-color': '#ffffff',
              }}
            />
            {/* Always-visible Name Tooltip */}
            <Layer
              id="gymnasiumNameTooltip"
              type="symbol"
              minzoom={13.5}
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

          {/* Schools (rendered after gymnasiums) */}
          <GeoJSONSource
            id="schoolSource"
            data={schoolGeoJSON as any}
            onPress={handleFeaturePress}
          >
            {/* Outer glow ring */}
            <Layer
              id="schoolGlow"
              type="circle"
              paint={{
                'circle-color': '#2196F3',
                'circle-radius': 14,
                'circle-opacity': 0.15,
                'circle-blur': 0.8,
              }}
            />
            {/* Main badge body */}
            <Layer
              id="schoolCircles"
              type="circle"
              paint={{
                'circle-color': '#2196F3',
                'circle-radius': 8,
                'circle-stroke-width': 2.5,
                'circle-stroke-color': COLORS.white,
              }}
            />
            {/* Icon label */}
            <Layer
              id="schoolLabel"
              type="symbol"
              layout={{
                'text-field': '🏫',
                'text-font': OFFLINE_GLYPH_FONT_STACK,
                'text-size': 10,
                'text-anchor': 'center',
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              }}
              paint={{
                'text-color': '#ffffff',
              }}
            />
            {/* Always-visible Name Tooltip */}
            <Layer
              id="schoolNameTooltip"
              type="symbol"
              minzoom={13.5}
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

          {/* Multi-Purpose Halls (rendered last = highest z) */}
          <GeoJSONSource
            id="multipurposeSource"
            data={multiPurposeGeoJSON as any}
            onPress={handleFeaturePress}
          >
            {/* Outer glow ring */}
            <Layer
              id="multipurposeGlow"
              type="circle"
              paint={{
                'circle-color': '#9C27B0',
                'circle-radius': 14,
                'circle-opacity': 0.15,
                'circle-blur': 0.8,
              }}
            />
            {/* Main badge body */}
            <Layer
              id="multipurposeCircles"
              type="circle"
              paint={{
                'circle-color': '#9C27B0',
                'circle-radius': 8,
                'circle-stroke-width': 2.5,
                'circle-stroke-color': COLORS.white,
              }}
            />
            {/* Icon label */}
            <Layer
              id="multipurposeLabel"
              type="symbol"
              layout={{
                'text-field': '🏢',
                'text-font': OFFLINE_GLYPH_FONT_STACK,
                'text-size': 10,
                'text-anchor': 'center',
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              }}
              paint={{
                'text-color': '#ffffff',
              }}
            />
            {/* Always-visible Name Tooltip */}
            <Layer
              id="multipurposeNameTooltip"
              type="symbol"
              minzoom={13.5}
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
