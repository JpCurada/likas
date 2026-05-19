import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Map, Camera } from '@maplibre/maplibre-react-native';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import Geolocation from '@react-native-community/geolocation';
import { COLORS, FONTS, SIZES } from '../theme';
import { Icon } from './Icon';
import { LatLng } from '../types';
import { useAppStore } from '../stores/appStore';
import {
  MapAssetMissingError,
  prepareGlyphs,
  prepareOfflineMap,
} from '../utils/mapAssetManager';
import {
  ANDROID_LOCATION_PERMISSION_MESSAGE,
  geolocationIssueFromError,
  type GeolocationUserIssue,
} from '../utils/geolocationUserMessages';

// Bundled style.json — same source MapScreen uses. We only ever swap the
// mbtiles URL and glyphs path before publishing, so the modal renders the
// identical map the user will see in the main Map tab.
const baseOfflineStyle = require('../../assets/maps/style.json');
const OFFLINE_GLYPH_FONT_STACK = ['Noto Sans Regular'];

// Match MapScreen's 3D camera defaults so the picker looks visually
// identical to the main map (parity matters — users have already learned
// what "their" map looks like during the rest of onboarding).
const CAMERA_PITCH = 58;
const CAMERA_BEARING = 20;
const CAMERA_ZOOM = 17;

const buildMinimalStyle = (mbtilesUrl: string, glyphsPath: string): any => {
  const clone = JSON.parse(JSON.stringify(baseOfflineStyle));
  clone.sources.openmaptiles.url = mbtilesUrl;
  clone.glyphs = glyphsPath;
  // (a) Force the offline font stack on every symbol layer — these are
  // the only glyphs we ship.
  // (b) Toggle the building layers so 3D extrusions render and the flat
  // 2D footprint is hidden, mirroring MapScreen's hardcoded 3D mode.
  clone.layers = clone.layers.map((layer: any) => {
    if (layer.type === 'symbol') {
      return {
        ...layer,
        layout: { ...layer.layout, 'text-font': OFFLINE_GLYPH_FONT_STACK },
      };
    }
    if (layer.id === 'building-2d') {
      return {
        ...layer,
        layout: { ...layer.layout, visibility: 'none' },
      };
    }
    if (layer.id === 'building-3d') {
      return {
        ...layer,
        layout: { ...layer.layout, visibility: 'visible' },
      };
    }
    return layer;
  });
  return clone;
};

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  title: string;
  initial?: LatLng | null;
  onConfirm: (coords: LatLng) => void;
  onCancel: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toFixed(5);

// Manila center — used when no prior pin exists
const MANILA: LatLng = { latitude: 14.5995, longitude: 120.9842 };

// ─── Component ────────────────────────────────────────────────────────────────

export const MeetingPointPickerModal: React.FC<Props> = ({
  visible,
  title,
  initial,
  onConfirm,
  onCancel,
}) => {
  // ── Read the pre-built style from the global store (set by MapScreen on
  //    init OR by this picker on first open during onboarding).
  const offlineMapStyle = useAppStore(s => s.offlineMapStyle);
  const setOfflineMapStyle = useAppStore(s => s.setOfflineMapStyle);

  const cameraRef = useRef<CameraRef>(null);
  const [center, setCenter] = useState<LatLng>(initial ?? MANILA);

  // ── Self-bootstrap state ────────────────────────────────────────────────
  // During onboarding the user has never opened the Map tab, so the global
  // style is null. We init it on first open here, then publish back to the
  // store so MapScreen's later mount reuses the same object.
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [geoHint, setGeoHint] = useState<GeolocationUserIssue | null>(null);

  // Reset pin to initial position every time the modal reopens
  useEffect(() => {
    if (visible) {
      setCenter(initial ?? MANILA);
      setGeoHint(null);
    }
  }, [visible, initial]);

  // One-shot: center on device GPS when there is no saved pin (onboarding).
  // Offline map tiles load separately; this only drives the initial camera target.
  useEffect(() => {
    if (!visible) return;
    const hasSavedPin =
      initial != null &&
      typeof initial.latitude === 'number' &&
      typeof initial.longitude === 'number';
    if (hasSavedPin) return;

    let cancelled = false;

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
          setGeoHint(geolocationIssueFromError(1));
          return;
        }
      }
      Geolocation.getCurrentPosition(
        p => {
          if (cancelled) return;
          setGeoHint(null);
          setCenter({
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
          });
        },
        e => {
          if (cancelled) return;
          setGeoHint(geolocationIssueFromError(e.code, e.message));
        },
        {
          enableHighAccuracy: false,
          timeout: 12000,
          maximumAge: 60000,
        },
      );
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [visible, initial]);

  // Build the offline style on demand if MapScreen hasn't done it yet.
  //
  // NB: do NOT list `isBootstrapping` in the dependency array. When we flip it
  // to true, React re-runs this effect, the previous effect's cleanup sets
  // `cancelled = true`, and the async work we just started aborts right before
  // `setOfflineMapStyle` — you only see "Cancelled before style commit" in logs.
  useEffect(() => {
    if (!visible || offlineMapStyle) return;
    let cancelled = false;
    setIsBootstrapping(true);
    setBootstrapError(null);

    // Wall-clock safety net: if any step in the chain hangs (e.g. a
    // fetch that doesn't honor its AbortSignal, or a stuck RNFS call),
    // surface a generic error after 10 s instead of spinning forever.
    const startedAt = Date.now();
    const watchdog = setTimeout(() => {
      if (cancelled) return;
      console.warn(
        `[MeetingPointPicker] ⏰ Bootstrap watchdog fired after ${Date.now() - startedAt} ms — forcing error state`,
      );
      cancelled = true;
      setBootstrapError(
        'Could not load the offline map within 10 seconds. Check that the Map Tiles download finished in Setup, then try again.',
      );
      setIsBootstrapping(false);
    }, 10000);

    const elapsed = () => `${Date.now() - startedAt} ms`;
    console.log('[MeetingPointPicker] 🚀 Bootstrap start');

    (async () => {
      try {
        console.log(`[MeetingPointPicker] ▶ prepareOfflineMap()  t=${elapsed()}`);
        const mbtilesUrl = await prepareOfflineMap();
        console.log(
          `[MeetingPointPicker] ✓ prepareOfflineMap → ${mbtilesUrl}  t=${elapsed()}`,
        );

        console.log(`[MeetingPointPicker] ▶ prepareGlyphs()  t=${elapsed()}`);
        let glyphsPath: string;
        try {
          glyphsPath = await prepareGlyphs();
        } catch (glyphErr) {
          console.warn(
            `[MeetingPointPicker] ⚠ prepareGlyphs failed, using fallback path:`,
            glyphErr,
          );
          glyphsPath =
            Platform.OS === 'android'
              ? 'asset://glyphs/{fontstack}/{range}.pbf'
              : 'glyphs/{fontstack}/{range}.pbf';
        }
        console.log(
          `[MeetingPointPicker] ✓ prepareGlyphs → ${glyphsPath}  t=${elapsed()}`,
        );

        if (cancelled) {
          console.log('[MeetingPointPicker] ⨯ Cancelled before style commit');
          return;
        }

        const style = buildMinimalStyle(mbtilesUrl, glyphsPath);
        setOfflineMapStyle(style);
        console.log(
          `[MeetingPointPicker] 🏁 Bootstrap complete (style committed)  t=${elapsed()}`,
        );
      } catch (err) {
        if (cancelled) return;
        console.error(
          `[MeetingPointPicker] ✗ Bootstrap failed at t=${elapsed()}:`,
          err,
        );
        if (err instanceof MapAssetMissingError) {
          setBootstrapError(
            'Offline maps are not installed yet. Finish downloading the Map Tiles asset in Setup, then pin your meeting point.',
          );
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          setBootstrapError(
            `Could not load the offline map.\n\nDetails: ${msg}`,
          );
        }
      } finally {
        clearTimeout(watchdog);
        if (!cancelled) setIsBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(watchdog);
    };
  }, [visible, offlineMapStyle, setOfflineMapStyle]);

  // Fly to the initial position 120 ms after the map mounts
  // (gives MapLibre time to finish rendering before animating).
  // Pitch + bearing match MapScreen so the picker preview is 3D-identical
  // to what the user sees on the main Map tab.
  useEffect(() => {
    if (!visible || !offlineMapStyle) return;
    const t = setTimeout(() => {
      cameraRef.current?.flyTo({
        center: [center.longitude, center.latitude],
        zoom: CAMERA_ZOOM,
        pitch: CAMERA_PITCH,
        bearing: CAMERA_BEARING,
        duration: 800,
      });
    }, 120);
    return () => clearTimeout(t);
    // Only on open — not on every drag
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, offlineMapStyle]);

  /** Track the map centre as the user drags. */
  const handleRegionChange = useCallback((e: any) => {
    const coords = e?.geometry?.coordinates ?? e?.properties?.center;
    if (Array.isArray(coords) && coords.length >= 2) {
      setCenter({ longitude: coords[0], latitude: coords[1] });
    }
  }, []);

  const handleConfirm = useCallback(() => onConfirm(center), [center, onConfirm]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity
            style={s.headerBtn}
            onPress={onCancel}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="close" size={20} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
          <TouchableOpacity
            style={[s.headerBtn, s.confirmHeaderBtn]}
            onPress={handleConfirm}
          >
            <Icon name="check" size={18} color={COLORS.darkGreen} />
          </TouchableOpacity>
        </View>

        {/* ── Map area ── */}
        <View style={s.mapWrapper}>
          {/* Map not ready yet — either bootstrapping, or the offline tiles
              asset hasn't been downloaded yet. */}
          {!offlineMapStyle && (
            <View style={s.placeholder}>
              {bootstrapError ? (
                <>
                  <Icon
                    name="map-marker-off-outline"
                    size={36}
                    color={COLORS.error}
                  />
                  <Text style={s.placeholderTitle}>Map not available</Text>
                  <Text style={s.placeholderHint}>{bootstrapError}</Text>
                </>
              ) : (
                <>
                  <ActivityIndicator size="large" color={COLORS.primaryGreen} />
                  <Text style={s.placeholderTitle}>Map initialising…</Text>
                  <Text style={s.placeholderHint}>
                    Loading offline tiles — this only happens the first time.
                  </Text>
                </>
              )}
            </View>
          )}

          {/* Map ready — reuse the style built by MapScreen (correct glyphs, no re-init).
              Tilt + bearing intentionally match MapScreen's 3D defaults. */}
          {!!offlineMapStyle && (
            <Map
              style={s.map}
              mapStyle={offlineMapStyle}
              logo={false}
              attribution={false}
              onRegionDidChange={handleRegionChange}
            >
              <Camera
                ref={cameraRef}
                zoom={CAMERA_ZOOM}
                pitch={CAMERA_PITCH}
                bearing={CAMERA_BEARING}
                duration={600}
              />
            </Map>
          )}

          {/* Crosshair — always on top, never intercepts touch */}
          <View style={s.crosshairContainer} pointerEvents="none">
            <View style={s.crosshairV} />
            <View style={s.crosshairH} />
            <View style={s.crosshairDot} />
            <View style={s.crosshairTail} />
          </View>
        </View>

        {/* ── Bottom panel ── */}
        <View style={s.bottom}>
          <View style={s.coordRow}>
            <Icon name="crosshairs-gps" size={16} color={COLORS.primaryGreen} />
            <Text style={s.coordText}>
              {fmt(center.latitude)}, {fmt(center.longitude)}
            </Text>
          </View>
          <Text style={s.hint}>
            Drag the map so the crosshair lands on your meeting point
          </Text>
          {geoHint ? (
            <View style={s.geoHintBox}>
              <Text style={s.geoHintText}>{geoHint.message}</Text>
              <View style={s.geoHintRow}>
                <TouchableOpacity
                  style={s.geoHintBtn}
                  onPress={() => {
                    setGeoHint(null);
                    Geolocation.getCurrentPosition(
                      p => {
                        setCenter({
                          latitude: p.coords.latitude,
                          longitude: p.coords.longitude,
                        });
                      },
                      e =>
                        setGeoHint(
                          geolocationIssueFromError(e.code, e.message),
                        ),
                      {
                        enableHighAccuracy: false,
                        timeout: 12000,
                        maximumAge: 60000,
                      },
                    );
                  }}>
                  <Text style={s.geoHintBtnTxt}>Try GPS again</Text>
                </TouchableOpacity>
                {geoHint.code === 'permission_denied' ? (
                  <TouchableOpacity
                    style={s.geoHintBtn}
                    onPress={() => {
                      void Linking.openSettings();
                    }}>
                    <Text style={s.geoHintBtnTxt}>Settings</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : null}
          <TouchableOpacity
            style={[s.confirmBtn, !offlineMapStyle && s.confirmBtnDisabled]}
            onPress={handleConfirm}
            activeOpacity={0.85}
            disabled={!offlineMapStyle}
          >
            <Icon name="map-marker-check" size={20} color={COLORS.white} />
            <Text style={s.confirmBtnText}>Set as Meeting Point</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const CROSSHAIR_SIZE = 32;
const DOT_SIZE = 10;

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.darkGreen,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.darkGreen,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmHeaderBtn: {
    backgroundColor: COLORS.accentGreen ?? '#4ade80',
  },
  headerTitle: {
    flex: 1,
    fontFamily: FONTS.primaryBold,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
  },

  // ── Map ──
  mapWrapper: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a1a10',
    gap: 12,
    paddingHorizontal: 32,
  },
  placeholderTitle: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 16,
    color: COLORS.white,
  },
  placeholderHint: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Crosshair ──
  crosshairContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -CROSSHAIR_SIZE / 2,
    marginTop: -(CROSSHAIR_SIZE / 2 + 6),
    width: CROSSHAIR_SIZE,
    height: CROSSHAIR_SIZE + 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairV: {
    position: 'absolute',
    width: 2,
    height: CROSSHAIR_SIZE,
    backgroundColor: COLORS.primaryGreen,
    borderRadius: 1,
  },
  crosshairH: {
    position: 'absolute',
    width: CROSSHAIR_SIZE,
    height: 2,
    backgroundColor: COLORS.primaryGreen,
    borderRadius: 1,
  },
  crosshairDot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: COLORS.primaryGreen,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  crosshairTail: {
    position: 'absolute',
    bottom: 0,
    width: 2,
    height: 8,
    backgroundColor: COLORS.primaryGreen,
    borderRadius: 1,
  },

  // ── Bottom panel ──
  bottom: {
    backgroundColor: COLORS.darkGreen,
    paddingHorizontal: SIZES.padding,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coordText: {
    fontFamily: FONTS.primaryMedium,
    fontSize: 12,
    color: COLORS.lightGreen ?? '#86efac',
    letterSpacing: 0.3,
  },
  hint: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  geoHintBox: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  geoHintText: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 17,
  },
  geoHintRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  geoHintBtn: {
    paddingVertical: 4,
  },
  geoHintBtnTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 12,
    color: COLORS.accentGreen,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryGreen,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  confirmBtnDisabled: {
    opacity: 0.4,
  },
  confirmBtnText: {
    fontFamily: FONTS.primaryBold,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
});
