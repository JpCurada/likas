import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Map, Camera } from '@maplibre/maplibre-react-native';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { COLORS, FONTS, SIZES } from '../theme';
import { Icon } from './Icon';
import { LatLng } from '../types';
import { useAppStore } from '../stores/appStore';

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
  // ── Read the pre-built style from the global store (set by MapScreen on init)
  const offlineMapStyle = useAppStore(s => s.offlineMapStyle);

  const cameraRef = useRef<CameraRef>(null);
  const [center, setCenter] = useState<LatLng>(initial ?? MANILA);

  // Reset pin to initial position every time the modal reopens
  useEffect(() => {
    if (visible) {
      setCenter(initial ?? MANILA);
    }
  }, [visible, initial]);

  // Fly to the initial position 120 ms after the map mounts
  // (gives MapLibre time to finish rendering before animating)
  useEffect(() => {
    if (!visible || !offlineMapStyle) return;
    const t = setTimeout(() => {
      cameraRef.current?.flyTo({
        center: [center.longitude, center.latitude],
        zoom: 16,
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
          {/* Map not ready yet — MapScreen hasn't opened the map tab */}
          {!offlineMapStyle && (
            <View style={s.placeholder}>
              <ActivityIndicator size="large" color={COLORS.primaryGreen} />
              <Text style={s.placeholderTitle}>Map initialising…</Text>
              <Text style={s.placeholderHint}>
                Open the Map tab once, then come back here.
              </Text>
            </View>
          )}

          {/* Map ready — reuse the style built by MapScreen (correct glyphs, no re-init) */}
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
                zoom={16}
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
