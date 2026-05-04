// ChatScreen.tsx - Boilerplate
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONTS, SIZES } from '../theme';
import { Icon } from '../components/Icon';

export const ChatScreen: React.FC = () => (
  <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.container}>
      <Icon name="robot-outline" size={56} color={COLORS.primaryGreen} style={{ marginBottom: 8 }} />
      <Text style={styles.title}>Disaster Guide</Text>
      <Text style={styles.subtitle}>
        Tap "Earthquake" or "Typhoon" on the Home screen to start an emergency
        chat.
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
    backgroundColor: COLORS.accentGreen,
    borderRadius: 100,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  badgeText: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
});

export default ChatScreen;
