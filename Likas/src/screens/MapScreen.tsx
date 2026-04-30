// MapScreen.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONTS, SIZES } from '../theme';

export const MapScreen: React.FC = () => (
  <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.container}>
      <Text style={styles.emoji}>🗺️</Text>
      <Text style={styles.title}>Lifeline Map</Text>
      <Text style={styles.subtitle}>
        Offline maps with evacuation centers, hospitals, and your custom meeting
        points. Coming soon!
      </Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Coming Soon</Text>
      </View>
    </View>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f0fdf4' },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SIZES.padding,
    gap: 12,
  },
  emoji: { fontSize: 56 },
  title: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: SIZES.h2,
    color: COLORS.darkGreen,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  badge: {
    backgroundColor: COLORS.cyan,
    borderRadius: 100,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  badgeText: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.small,
    color: COLORS.white,
  },
});

export default MapScreen;
