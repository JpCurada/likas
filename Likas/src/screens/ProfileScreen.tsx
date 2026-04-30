import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS, FONTS, SIZES } from '../theme';
import {
  loadProfile,
  saveProfile,
  clearAllData,
  UserProfile,
  DEFAULT_PROFILE,
} from '../database/storage';
import { ProfileSection } from '../components/profile/ProfileSection';
import { EditableField } from '../components/profile/EditableField';

export const ProfileScreen: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile().then(p => {
      if (p) setProfile(p);
      setLoading(false);
    });
  }, []);

  const updateAndSave = useCallback(
    async (updates: Partial<UserProfile>) => {
      const updated = { ...profile, ...updates };
      setProfile(updated);
      setSaving(true);
      try {
        await saveProfile(updated);
      } catch {
        Alert.alert('Error', 'Could not save changes. Please try again.');
      } finally {
        setSaving(false);
      }
    },
    [profile],
  );

  const handleResetOnboarding = () => {
    Alert.alert(
      'Reset Profile?',
      'This will delete all your data and restart onboarding. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            // The AppNavigator will detect this and show onboarding
            Alert.alert('Done', 'App will restart onboarding on next launch.');
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.primaryGreen} size="large" />
        <Text style={styles.loadingText}>Loading your profile...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Profile</Text>
          <Text style={styles.headerSub}>Tap any field to edit</Text>
        </View>
        {saving && (
          <View style={styles.savingBadge}>
            <ActivityIndicator size="small" color={COLORS.primaryGreen} />
            <Text style={styles.savingText}>Saving...</Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity Card */}
        <View style={styles.identityCard}>
          <Text style={styles.identityEmoji}>🌿</Text>
          <View>
            <Text style={styles.identityName}>
              {profile.name || 'Your Name'}
            </Text>
            <Text style={styles.identityAge}>
              {profile.ageGroup || 'Age group not set'}
            </Text>
          </View>
        </View>

        {/* Section: Identity */}
        <ProfileSection emoji="👤" title="Identity" defaultOpen>
          <EditableField
            label="Name / Nickname"
            value={profile.name}
            onSave={val => updateAndSave({ name: val })}
            placeholder="Your name"
          />
          {/* Age group - simple display, user can tap to see note */}
          <View style={styles.readonlyField}>
            <Text style={styles.readonlyLabel}>Age Group</Text>
            <Text style={styles.readonlyValue}>
              {profile.ageGroup || 'Not set'}
            </Text>
            <Text style={styles.readonlyNote}>
              To change age group, please redo onboarding (Settings below).
            </Text>
          </View>
        </ProfileSection>

        {/* Section: Location */}
        <ProfileSection emoji="📍" title="Location & Meeting Points">
          <View style={styles.readonlyField}>
            <Text style={styles.readonlyLabel}>City</Text>
            <Text style={styles.readonlyValue}>
              {profile.location.city || 'Not set'}
            </Text>
          </View>
          <View style={styles.readonlyField}>
            <Text style={styles.readonlyLabel}>Barangay</Text>
            <Text style={styles.readonlyValue}>
              {profile.location.barangay || 'Not set'}
            </Text>
          </View>
          <EditableField
            label="Primary Meeting Point ⭐"
            value={profile.location.primaryMeetingPoint}
            onSave={val =>
              updateAndSave({
                location: { ...profile.location, primaryMeetingPoint: val },
              })
            }
            placeholder="e.g., Basketball court on Rizal St."
            multiline
          />
          <EditableField
            label="Secondary Meeting Point"
            value={profile.location.secondaryMeetingPoint}
            onSave={val =>
              updateAndSave({
                location: { ...profile.location, secondaryMeetingPoint: val },
              })
            }
            placeholder="e.g., Grandma's house in Marikina"
            multiline
          />
        </ProfileSection>

        {/* Section: Emergency Contacts */}
        <ProfileSection emoji="📞" title="Emergency Contacts">
          {profile.emergencyContacts.map((contact, index) => (
            <View key={index} style={styles.contactGroup}>
              <Text style={styles.contactGroupTitle}>
                {index === 0
                  ? '⭐ Primary'
                  : index === 1
                  ? '👤 Secondary'
                  : '👤 Third'}{' '}
                Contact
              </Text>
              <EditableField
                label="Name"
                value={contact.name}
                onSave={val => {
                  const updated = profile.emergencyContacts.map((c, i) =>
                    i === index ? { ...c, name: val } : c,
                  );
                  updateAndSave({ emergencyContacts: updated });
                }}
                placeholder="Contact name"
              />
              <EditableField
                label="Phone Number"
                value={contact.phone}
                onSave={val => {
                  const updated = profile.emergencyContacts.map((c, i) =>
                    i === index ? { ...c, phone: val } : c,
                  );
                  updateAndSave({ emergencyContacts: updated });
                }}
                placeholder="09XX-XXX-XXXX"
                keyboardType="phone-pad"
              />
            </View>
          ))}
        </ProfileSection>

        {/* Section: Companions (read-only summary, redirect to onboarding to re-do) */}
        <ProfileSection emoji="👨‍👩‍👧‍👦" title="Household & Health Summary">
          <View style={styles.summaryGrid}>
            {profile.companions.infants > 0 && (
              <View style={styles.summaryChip}>
                <Text style={styles.summaryChipText}>
                  👶 {profile.companions.infants} Infant(s)
                </Text>
              </View>
            )}
            {profile.companions.children > 0 && (
              <View style={styles.summaryChip}>
                <Text style={styles.summaryChipText}>
                  🧒 {profile.companions.children} Child(ren)
                </Text>
              </View>
            )}
            {profile.companions.elderly > 0 && (
              <View style={styles.summaryChip}>
                <Text style={styles.summaryChipText}>
                  👴 {profile.companions.elderly} Elderly
                </Text>
              </View>
            )}
            {profile.companions.pwd > 0 && (
              <View style={styles.summaryChip}>
                <Text style={styles.summaryChipText}>
                  ♿ {profile.companions.pwd} PWD
                </Text>
              </View>
            )}
            {profile.pets.hasPets && (
              <View style={[styles.summaryChip, styles.summaryChipPet]}>
                <Text style={styles.summaryChipText}>🐾 Has Pets</Text>
              </View>
            )}
            {profile.medicalConditions.asthma && (
              <View style={[styles.summaryChip, styles.summaryChipMed]}>
                <Text style={styles.summaryChipText}>🫁 Asthma</Text>
              </View>
            )}
            {profile.medicalConditions.diabetes && (
              <View style={[styles.summaryChip, styles.summaryChipMed]}>
                <Text style={styles.summaryChipText}>💉 Diabetes</Text>
              </View>
            )}
            {profile.medicalConditions.heartCondition && (
              <View style={[styles.summaryChip, styles.summaryChipMed]}>
                <Text style={styles.summaryChipText}>❤️ Heart Condition</Text>
              </View>
            )}
            {profile.medicalConditions.hypertension && (
              <View style={[styles.summaryChip, styles.summaryChipMed]}>
                <Text style={styles.summaryChipText}>🩺 Hypertension</Text>
              </View>
            )}
          </View>
          <Text style={styles.summaryNote}>
            To update household or health details in depth, use the "Redo
            Onboarding" option below.
          </Text>
        </ProfileSection>

        {/* Danger Zone */}
        <View style={styles.dangerSection}>
          <Text style={styles.dangerTitle}>⚙️ Settings</Text>
          <TouchableOpacity
            style={styles.dangerButton}
            onPress={handleResetOnboarding}
            activeOpacity={0.8}
          >
            <Text style={styles.dangerButtonText}>🔄 Redo Full Onboarding</Text>
            <Text style={styles.dangerButtonSub}>
              Update all details from scratch
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f0fdf4',
  },
  loadingText: {
    fontFamily: FONTS.primaryRegular,
    color: COLORS.gray,
    fontSize: SIZES.small,
  },
  header: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SIZES.padding,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGreen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: SIZES.h2,
    color: COLORS.darkGreen,
  },
  headerSub: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  savingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.lightGreen,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  savingText: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.primaryGreen,
  },
  scroll: {
    padding: SIZES.padding,
    gap: 12,
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.darkGreen,
    borderRadius: SIZES.radius + 4,
    padding: 20,
  },
  identityEmoji: {
    fontSize: 36,
  },
  identityName: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: SIZES.h2,
    color: COLORS.white,
  },
  identityAge: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.accentGreen,
    marginTop: 2,
  },
  readonlyField: {
    gap: 2,
  },
  readonlyLabel: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 12,
    color: COLORS.gray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  readonlyValue: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
    backgroundColor: COLORS.lightGreen,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  readonlyNote: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 11,
    color: COLORS.gray,
    fontStyle: 'italic',
  },
  contactGroup: {
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGreen,
  },
  contactGroupTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryChip: {
    backgroundColor: COLORS.lightGreen,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  summaryChipPet: {
    backgroundColor: '#fef3c7',
  },
  summaryChipMed: {
    backgroundColor: '#fee2e2',
  },
  summaryChipText: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 12,
    color: COLORS.darkGreen,
  },
  summaryNote: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  dangerSection: {
    gap: 8,
    marginTop: 8,
  },
  dangerTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.small,
    color: COLORS.gray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dangerButton: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#fecaca',
  },
  dangerButtonText: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.body,
    color: COLORS.error,
  },
  dangerButtonSub: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
});

export default ProfileScreen;
