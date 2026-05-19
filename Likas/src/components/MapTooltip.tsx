import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Animated,
  TouchableWithoutFeedback,
  Platform,
  Linking,
} from 'react-native';
import { COLORS, FONTS, SIZES } from '../theme';
import { Icon } from './Icon';

export type TooltipData = {
  id?: string;
  name: string;
  type: string;
  category: string;
  address?: string;
  city?: string;
  capacity?: string;
  hazard?: string;
  operator?: string;
  emergency?: string;
  pointType: 'evacuation' | 'hospital' | 'gymnasium' | 'school' | 'multi_purpose';
  /** Decimal degrees — passed through from GeoJSON coordinates */
  latitude?: number;
  longitude?: number;
};

type Props = {
  data: TooltipData | null;
  onClose: () => void;
  onGetDirections?: (data: TooltipData) => void;
  /** Nearby list navigation — provided by MapScreen when browsing sorted POIs */
  onPrev?: () => void;
  onNext?: () => void;
  listIndex?: number;
  listTotal?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatType = (raw?: string): string => {
  if (!raw || raw === 'undefined') return '';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const formatHazard = (hazard: string): string =>
  hazard
    .split(';')
    .map(h => h.trim().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
    .join('  ·  ');

const openMaps = (lat: number, lon: number, label: string) => {
  const encodedLabel = encodeURIComponent(label);
  const url =
    Platform.OS === 'ios'
      ? `maps://?q=${encodedLabel}&ll=${lat},${lon}`
      : `geo:${lat},${lon}?q=${lat},${lon}(${encodedLabel})`;
  Linking.openURL(url).catch(() => {
    // Fallback to Google Maps web
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
    );
  });
};

// ─── Component ────────────────────────────────────────────────────────────────

export const MapTooltip: React.FC<Props> = ({
  data,
  onClose,
  onGetDirections,
  onPrev,
  onNext,
  listIndex,
  listTotal,
}) => {
  // Keep a "last seen" snapshot so we can animate OUT with real content still rendered
  const [snapshot, setSnapshot] = useState<TooltipData | null>(null);

  const slideAnim = useRef(new Animated.Value(400)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const visible = !!data;

  // Update snapshot as soon as data arrives (so exit still has content)
  useEffect(() => {
    if (data) setSnapshot(data);
  }, [data]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 60,
          friction: 12,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 240,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 400,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Clear snapshot only after the exit animation finishes
        setSnapshot(null);
      });
    }
  }, [visible, slideAnim, backdropAnim]);

  // Nothing to show and no exit animation pending
  if (!snapshot) return null;

  let accentColor = COLORS.primaryGreen;
  let iconName = 'map-marker';
  let typeLabel = '';
  let badgeIcon = 'tag-outline';

  switch (snapshot.pointType) {
    case 'evacuation':
      accentColor = COLORS.primaryGreen;
      iconName = 'shield-home';
      typeLabel = 'Evacuation Center';
      badgeIcon = 'tag-outline';
      break;
    case 'hospital':
      accentColor = COLORS.error;
      iconName = 'hospital-building';
      typeLabel = 'Hospital / Medical';
      badgeIcon = 'medical-bag';
      break;
    case 'gymnasium':
      accentColor = '#FF9800';
      iconName = 'basketball';
      typeLabel = 'Gymnasium / Court';
      badgeIcon = 'basketball-hoop-outline';
      break;
    case 'school':
      accentColor = '#2196F3';
      iconName = 'school';
      typeLabel = 'School / Campus';
      badgeIcon = 'book-open-variant';
      break;
    case 'multi_purpose':
      accentColor = '#9C27B0';
      iconName = 'office-building';
      typeLabel = 'Multi-Purpose Hall';
      badgeIcon = 'domain';
      break;
  }

  const typeText =
    formatType(snapshot.type) || formatType(snapshot.category) || typeLabel;

  const hasCoords =
    snapshot.latitude != null && snapshot.longitude != null;

  return (
    <Modal
      visible={!!snapshot}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Dimmed backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: backdropAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.4],
              }),
            },
          ]}
        />
      </TouchableWithoutFeedback>

      {/* Bottom sheet */}
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Nearby navigation strip — visible when browsing a sorted POI list */}
        {onPrev !== undefined && onNext !== undefined &&
          listTotal !== undefined && listTotal > 1 && (
          <View style={styles.navStrip}>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={onPrev}
              hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
              activeOpacity={0.7}
            >
              <Icon name="chevron-left" size={22} color={accentColor} />
            </TouchableOpacity>
            <Text style={[styles.navCounter, { color: accentColor }]}>
              {(listIndex ?? 0) + 1} / {listTotal}
            </Text>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={onNext}
              hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
              activeOpacity={0.7}
            >
              <Icon name="chevron-right" size={22} color={accentColor} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={[styles.iconBadge, { backgroundColor: accentColor + '1A' }]}>
            <Icon name={iconName} size={28} color={accentColor} />
          </View>

          <View style={styles.headerText}>
            <Text style={[styles.typeLabel, { color: accentColor }]}>
              {typeLabel.toUpperCase()}
            </Text>
            <Text style={styles.name} numberOfLines={2}>
              {snapshot.name}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            activeOpacity={0.7}
          >
            <Icon name="close" size={15} color="#666" />
          </TouchableOpacity>
        </View>

        {/* ── Accent strip ── */}
        <View style={styles.accentStrip}>
          <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
          <View
            style={[
              styles.accentBarFade,
              { backgroundColor: accentColor + '30' },
            ]}
          />
        </View>

        {/* ── Scrollable body ── */}
        <ScrollView
          style={styles.body}
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={styles.bodyContent}
        >
          {/* Type badge */}
          {!!typeText && (
            <View style={styles.badgeRow}>
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: accentColor + '18',
                    borderColor: accentColor + '50',
                  },
                ]}
              >
                <Icon
                  name={badgeIcon}
                  size={12}
                  color={accentColor}
                  style={styles.badgeIcon}
                />
                <Text style={[styles.badgeText, { color: accentColor }]}>
                  {typeText}
                </Text>
              </View>
            </View>
          )}

          {/* Info rows */}
          {!!snapshot.address && (
            <InfoRow iconName="map-marker-outline" label="Address" value={snapshot.address} />
          )}
          {!!snapshot.city && (
            <InfoRow iconName="city-variant-outline" label="City / Area" value={snapshot.city} />
          )}
          {!!snapshot.operator && (
            <InfoRow iconName="office-building-outline" label="Operator" value={snapshot.operator} />
          )}
          {!!snapshot.capacity && (
            <InfoRow
              iconName="account-group-outline"
              label="Capacity"
              value={`${snapshot.capacity} persons`}
            />
          )}
          {!!snapshot.hazard && (
            <InfoRow
              iconName="alert-circle-outline"
              label="Hazard Types Covered"
              value={formatHazard(snapshot.hazard)}
              accent={COLORS.error}
            />
          )}
          {!!snapshot.emergency && (
            <InfoRow
              iconName="alarm-light-outline"
              label="Emergency Services"
              value={formatType(snapshot.emergency)}
            />
          )}
        </ScrollView>

        {/* ── Action buttons ── */}
        <View style={styles.actions}>
          {hasCoords && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: accentColor }]}
              activeOpacity={0.82}
              onPress={() => {
                if (onGetDirections) {
                  onGetDirections(snapshot);
                  onClose();
                } else {
                  openMaps(snapshot.latitude!, snapshot.longitude!, snapshot.name);
                }
              }}
            >
              <Icon name="directions" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Get Directions</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Safe-area bottom padding */}
        <View style={{ height: Platform.OS === 'android' ? 12 : 24 }} />
      </Animated.View>
    </Modal>
  );
};

// ─── InfoRow ──────────────────────────────────────────────────────────────────

type InfoRowProps = {
  iconName: string;
  label: string;
  value: string;
  accent?: string;
};

const InfoRow: React.FC<InfoRowProps> = ({ iconName, label, value, accent }) => (
  <View style={styles.infoRow}>
    <View style={[styles.infoIconWrap, { backgroundColor: (accent || COLORS.gray) + '12' }]}>
      <Icon
        name={iconName}
        size={16}
        color={accent || COLORS.gray}
      />
    </View>
    <View style={styles.infoContent}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, accent ? { color: accent, fontWeight: '600' } : {}]}>
        {value}
      </Text>
    </View>
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Navigation strip ──
  navStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    gap: 12,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F2F4F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navCounter: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    minWidth: 64,
    textAlign: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FAFCFB',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: SIZES.padding,
    maxHeight: '65%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 28,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d0d0d0',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 18,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  iconBadge: {
    width: 54,
    height: 54,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
    paddingTop: 2,
  },
  typeLabel: {
    fontFamily: FONTS.primaryBold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  name: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    lineHeight: 22,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EBEBEB',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 2,
  },

  // ── Accent strip ──
  accentStrip: {
    flexDirection: 'row',
    height: 3,
    borderRadius: 3,
    marginBottom: 16,
    overflow: 'hidden',
  },
  accentBar: {
    width: 48,
    height: 3,
    borderRadius: 3,
  },
  accentBarFade: {
    flex: 1,
    height: 3,
    borderRadius: 3,
    marginLeft: 4,
  },

  // ── Body ──
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingBottom: 8,
  },

  // ── Badge ──
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  badgeIcon: {
    // just for spacing alignment
  },
  badgeText: {
    fontFamily: FONTS.primaryBold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Info rows ──
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  infoIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontFamily: FONTS.primaryMedium,
    fontSize: 10,
    color: '#aaa',
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  infoValue: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 13,
    color: '#222',
    fontWeight: '500',
    lineHeight: 19,
  },

  // ── Actions ──
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    marginBottom: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    gap: 7,
  },
  actionBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  actionBtnText: {
    fontFamily: FONTS.primaryBold,
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
});
