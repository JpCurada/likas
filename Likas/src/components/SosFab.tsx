import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';

import {COLORS, FONTS} from '../theme';
import {Icon} from './Icon';
import {useAppStore} from '../stores/appStore';
import {emergencyService} from '../services/emergencyService';
import type {DisasterContext, LatLng} from '../types';

/** Placement matches MapScreen `fabAi` (absolute `bottom` / horizontal inset `24`). */
const FAB_EDGE_INSET = 24;

const disasterContextForSos = (
  ctx: DisasterContext,
): DisasterContext | undefined => (ctx === 'prep' ? undefined : ctx);

export type SosFabProps = {
  /**
   * Extra `bottom` offset so the FAB clears the AI bottom sheet (same parent height
   * the sheet uses for `%` snap points). Base inset still matches `fabAi` (`24`).
   */
  liftForSheetPx?: number;
};

/**
 * Map-only SOS — opens the system SMS composer with a pre-filled distress message
 * (same draft pattern as onboarding Step 5).
 */
export const SosFab: React.FC<SosFabProps> = ({liftForSheetPx = 0}) => {
  const profile = useAppStore(s => s.profile);
  const activeContext = useAppStore(s => s.activeContext);
  const liveLocation = useAppStore(s => s.liveLocation);
  const [busy, setBusy] = useState(false);

  const runSos = useCallback(async () => {
    const phones = profile.emergencyContacts
      .map(c => c.phone.replace(/\s/g, ''))
      .filter(p => p.length >= 7);
    if (phones.length === 0) {
      Alert.alert(
        'Add a contact first',
        'Open Profile and add at least one emergency contact with a phone number.',
      );
      return;
    }

    let location: LatLng | null = liveLocation ?? profile.location.coordinates;

    setBusy(true);
    try {
      try {
        location = await new Promise<LatLng>((resolve, reject) => {
          Geolocation.getCurrentPosition(
            p =>
              resolve({
                latitude: p.coords.latitude,
                longitude: p.coords.longitude,
              }),
            reject,
            {
              enableHighAccuracy: false,
              timeout: 12000,
              maximumAge: 60000,
            },
          );
        });
      } catch {
        /* keep liveLocation / home */
      }

      if (!location) {
        Alert.alert(
          'Location needed',
          'Turn on Location in settings so we can include coordinates in your SOS message, or finish Profile location first.',
        );
        return;
      }

      await emergencyService.triggerSOS({
        location,
        profile,
        disasterContext: disasterContextForSos(activeContext),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not open SMS.';
      Alert.alert('SOS could not open', msg);
    } finally {
      setBusy(false);
    }
  }, [profile, activeContext, liveLocation]);

  const onPress = useCallback(() => {
    if (busy) return;
    Alert.alert(
      'Send SOS SMS?',
      'Opens your SMS app with a distress message to your emergency contacts. Nothing is sent until you hit Send there.',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Continue', style: 'destructive', onPress: () => void runSos()},
      ],
    );
  }, [busy, runSos]);

  return (
    <TouchableOpacity
      style={[
        styles.fab,
        busy && styles.fabBusy,
        {bottom: FAB_EDGE_INSET + liftForSheetPx},
      ]}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.92}
      accessibilityRole="button"
      accessibilityLabel="SOS. Draft emergency SMS to your contacts"
      accessibilityHint="Double tap to open SMS with a pre-filled distress message">
      {busy ? (
        <ActivityIndicator color={COLORS.white} size="small" />
      ) : (
        <>
          <Icon name="alert-octagon" size={22} color={COLORS.white} />
          <Text style={styles.fabLabel}>SOS</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    left: 24, // Change this value to adjust the horizontal position (e.g., 30 for more right, 20 for more left)
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabBusy: {opacity: 0.85},
  fabLabel: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: 11,
    color: COLORS.white,
    letterSpacing: 0.6,
  },
});
