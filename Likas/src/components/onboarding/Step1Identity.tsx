import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { StepWrapper } from './StepWrapper';
import { COLORS, FONTS, SIZES } from '../../theme';
import { UserProfile } from '../../database/storage';

interface Props {
  profile: UserProfile;
  onChange: (updates: Partial<UserProfile>) => void;
  onNext: () => void;
}

const AGE_GROUPS: UserProfile['ageGroup'][] = [
  'Under 18',
  '18-35',
  '36-55',
  '56+',
];

export const Step1Identity: React.FC<Props> = ({
  profile,
  onChange,
  onNext,
}) => {
  const isValid = profile.name.trim().length >= 2 && profile.ageGroup !== '';

  return (
    <StepWrapper
      emoji="🌿"
      title={`Mabuhay! I'm Likas.`}
      subtitle="Your offline disaster readiness companion. Let's get to know each other."
      onNext={onNext}
      nextDisabled={!isValid}
    >
      {/* Name Input */}
      <View style={styles.field}>
        <Text style={styles.label}>What should I call you?</Text>
        <TextInput
          style={styles.input}
          placeholder="Your name or nickname"
          placeholderTextColor={COLORS.gray}
          value={profile.name}
          onChangeText={text => onChange({ name: text })}
          maxLength={30}
          autoFocus
          returnKeyType="done"
        />
        {profile.name.trim().length > 0 && profile.name.trim().length < 2 && (
          <Text style={styles.errorText}>
            Name must be at least 2 characters.
          </Text>
        )}
      </View>

      {/* Age Group */}
      <View style={styles.field}>
        <Text style={styles.label}>What is your age group?</Text>
        <Text style={styles.hint}>This helps us give you the best advice.</Text>

        <View style={styles.ageGrid}>
          {AGE_GROUPS.map(group => {
            const isSelected = profile.ageGroup === group;
            return (
              <TouchableOpacity
                key={group}
                style={[styles.ageChip, isSelected && styles.ageChipSelected]}
                onPress={() => onChange({ ageGroup: group })}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.ageChipText,
                    isSelected && styles.ageChipTextSelected,
                  ]}
                >
                  {group}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Validation reminder */}
      {!isValid && (
        <View style={styles.reminderBox}>
          <Text style={styles.reminderText}>
            ⚠️ Please fill in both fields to continue. This helps Likas
            personalize emergency advice for you.
          </Text>
        </View>
      )}
    </StepWrapper>
  );
};

const styles = StyleSheet.create({
  field: {
    gap: 8,
  },
  label: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.body,
    color: COLORS.darkGreen,
  },
  hint: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.gray,
    marginTop: -4,
  },
  input: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    borderWidth: 1.5,
    borderColor: COLORS.lightGreen,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.body,
    color: COLORS.darkGreen,
  },
  errorText: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.error,
  },
  ageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  ageChip: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 100,
    backgroundColor: COLORS.lightGreen,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  ageChipSelected: {
    backgroundColor: COLORS.primaryGreen,
    borderColor: COLORS.darkGreen,
  },
  ageChipText: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.primaryGreen,
  },
  ageChipTextSelected: {
    color: COLORS.white,
  },
  reminderBox: {
    backgroundColor: '#fff8e1',
    borderRadius: SIZES.radius,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  reminderText: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: '#92400e',
    lineHeight: 20,
  },
});

export default Step1Identity;
