import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONTS, SIZES } from '../theme';
import { loadProfile, UserProfile } from '../database/storage';

export const HomeScreen: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  const handleDisasterPress = (type: 'EARTHQUAKE' | 'TYPHOON') => {
    Alert.alert(
      `${type === 'EARTHQUAKE' ? '🌏' : '🌀'} ${type}`,
      'Disaster guide coming soon! This will open the AI chat with contextual first steps.',
      [{ text: 'OK' }],
    );
  };

  const handleSOS = () => {
    Alert.alert(
      '🆘 Send Emergency SOS',
      `This will send an SMS to your emergency contacts:\n\n"Hi, I'm safe. My location is ${
        profile?.location.barangay || 'unknown'
      }. Going to ${
        profile?.location.primaryMeetingPoint || 'our meeting point'
      }. — ${profile?.name || 'Me'}"`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send SMS', style: 'destructive', onPress: () => {} },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Status Bar */}
      <View style={styles.statusBar}>
        <View>
          <Text style={styles.greeting}>
            Mabuhay, {profile?.name || 'Friend'} 👋
          </Text>
          <Text style={styles.location}>
            📍{' '}
            {profile?.location.barangay
              ? `${profile.location.barangay}, ${profile.location.city}`
              : 'Location not set'}
          </Text>
        </View>
        <View style={styles.batteryBadge}>
          <Text style={styles.batteryText}>🔋 Ready</Text>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionLabel}>What's happening?</Text>
        <Text style={styles.sectionHint}>
          Tap the disaster type to get instant guidance.
        </Text>

        {/* Big Buttons */}
        <TouchableOpacity
          style={[styles.bigButton, styles.earthquakeButton]}
          onPress={() => handleDisasterPress('EARTHQUAKE')}
          activeOpacity={0.85}
        >
          <Text style={styles.bigButtonEmoji}>🌏</Text>
          <Text style={styles.bigButtonText}>EARTHQUAKE</Text>
          <Text style={styles.bigButtonSub}>Lindol · Ground shaking</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bigButton, styles.typhoonButton]}
          onPress={() => handleDisasterPress('TYPHOON')}
          activeOpacity={0.85}
        >
          <Text style={styles.bigButtonEmoji}>🌀</Text>
          <Text style={styles.bigButtonText}>TYPHOON</Text>
          <Text style={styles.bigButtonSub}>Bagyo · Storm / Flood</Text>
        </TouchableOpacity>

        {/* Coming Soon Tabs */}
        <View style={styles.comingSoonRow}>
          <View style={styles.comingSoonCard}>
            <Text style={styles.comingSoonEmoji}>🗺️</Text>
            <Text style={styles.comingSoonLabel}>Evacuation Map</Text>
          </View>
          <View style={styles.comingSoonCard}>
            <Text style={styles.comingSoonEmoji}>🎒</Text>
            <Text style={styles.comingSoonLabel}>Prep Zone</Text>
          </View>
        </View>
      </View>

      {/* SOS FAB */}
      <TouchableOpacity
        style={styles.sosFab}
        onPress={handleSOS}
        activeOpacity={0.8}
      >
        <Text style={styles.sosFabText}>🆘</Text>
        <Text style={styles.sosFabLabel}>SOS</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f0fdf4' },
  statusBar: {
    backgroundColor: COLORS.darkGreen,
    paddingHorizontal: SIZES.padding,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.h3,
    color: COLORS.white,
  },
  location: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.accentGreen,
    marginTop: 2,
  },
  batteryBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  batteryText: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 12,
    color: COLORS.white,
  },
  content: {
    flex: 1,
    padding: SIZES.padding,
    gap: 12,
  },
  sectionLabel: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: SIZES.h2,
    color: COLORS.darkGreen,
  },
  sectionHint: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.gray,
    marginTop: -6,
  },
  bigButton: {
    borderRadius: SIZES.radius + 4,
    padding: 28,
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  earthquakeButton: {
    backgroundColor: COLORS.darkGreen,
  },
  typhoonButton: {
    backgroundColor: COLORS.blue,
  },
  bigButtonEmoji: { fontSize: 48, marginBottom: 4 },
  bigButtonText: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: 26,
    color: COLORS.white,
    letterSpacing: 2,
  },
  bigButtonSub: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: 'rgba(255,255,255,0.7)',
  },
  comingSoonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  comingSoonCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.lightGreen,
    gap: 4,
    opacity: 0.7,
  },
  comingSoonEmoji: { fontSize: 28 },
  comingSoonLabel: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 12,
    color: COLORS.darkGreen,
    textAlign: 'center',
  },
  sosFab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.error,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
    gap: 2,
  },
  sosFabText: { fontSize: 22 },
  sosFabLabel: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: 11,
    color: COLORS.white,
    letterSpacing: 1,
  },
});

export default HomeScreen;
