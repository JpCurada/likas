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
import { UserProfile, MedicalCondition } from '../../database/storage';

interface Props {
  profile: UserProfile;
  onChange: (updates: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack: () => void;
}

interface ConditionItem {
  key: keyof Omit<MedicalCondition, 'other'>;
  emoji: string;
  label: string;
  note?: string;
}

const CONDITIONS: ConditionItem[] = [
  {
    key: 'asthma',
    emoji: '🫁',
    label: 'Asthma',
    note: 'Needs inhaler in go-bag',
  },
  {
    key: 'diabetes',
    emoji: '💉',
    label: 'Diabetes',
    note: 'Insulin / glucose monitoring',
  },
  {
    key: 'heartCondition',
    emoji: '❤️',
    label: 'Heart Condition',
    note: 'Nitroglycerin or heart meds',
  },
  {
    key: 'hypertension',
    emoji: '🩺',
    label: 'Hypertension',
    note: 'Blood pressure medication',
  },
  {
    key: 'none',
    emoji: '✅',
    label: 'None / No Conditions',
    note: 'All healthy!',
  },
];

export const Step3Health: React.FC<Props> = ({
  profile,
  onChange,
  onNext,
  onBack,
}) => {
  const toggleCondition = (key: keyof Omit<MedicalCondition, 'other'>) => {
    const current = profile.medicalConditions;

    // If selecting "none", clear everything else
    if (key === 'none') {
      onChange({
        medicalConditions: {
          asthma: false,
          diabetes: false,
          heartCondition: false,
          hypertension: false,
          none: !current.none,
          other: '',
        },
      });
      return;
    }

    // If selecting any condition, uncheck "none"
    onChange({
      medicalConditions: {
        ...current,
        [key]: !current[key],
        none: false,
      },
    });
  };

  const hasSelection =
    profile.medicalConditions.none ||
    profile.medicalConditions.asthma ||
    profile.medicalConditions.diabetes ||
    profile.medicalConditions.heartCondition ||
    profile.medicalConditions.hypertension;

  return (
    <StepWrapper
      emoji="🏥"
      title="Health & Medical Needs"
      subtitle="Are there critical medical conditions in your group? This shapes your emergency supply checklist."
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!hasSelection}
    >
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          💡 Select all that apply. You can select multiple conditions.
        </Text>
      </View>

      {CONDITIONS.map(item => {
        const isSelected =
          item.key === 'none'
            ? profile.medicalConditions.none
            : profile.medicalConditions[item.key];

        return (
          <TouchableOpacity
            key={item.key}
            style={[styles.card, isSelected && styles.cardSelected]}
            onPress={() => toggleCondition(item.key)}
            activeOpacity={0.7}
          >
            <View style={styles.cardLeft}>
              <Text style={styles.cardEmoji}>{item.emoji}</Text>
              <View>
                <Text
                  style={[
                    styles.cardLabel,
                    isSelected && styles.cardLabelSelected,
                  ]}
                >
                  {item.label}
                </Text>
                {item.note && <Text style={styles.cardNote}>{item.note}</Text>}
              </View>
            </View>

            <View
              style={[styles.checkbox, isSelected && styles.checkboxSelected]}
            >
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </TouchableOpacity>
        );
      })}

      {/* Other condition */}
      {!profile.medicalConditions.none && (
        <View style={styles.otherField}>
          <Text style={styles.otherLabel}>Other condition (optional)</Text>
          <TextInput
            style={styles.otherInput}
            placeholder="e.g., Epilepsy, Kidney disease..."
            placeholderTextColor={COLORS.gray}
            value={profile.medicalConditions.other}
            onChangeText={text =>
              onChange({
                medicalConditions: {
                  ...profile.medicalConditions,
                  other: text,
                },
              })
            }
          />
        </View>
      )}

      {!hasSelection && (
        <View style={styles.reminderBox}>
          <Text style={styles.reminderText}>
            ⚠️ Please select at least one option, even if it's "None."
          </Text>
        </View>
      )}
    </StepWrapper>
  );
};

const styles = StyleSheet.create({
  infoBox: {
    backgroundColor: '#e0f2fe',
    borderRadius: SIZES.radius,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.cyan,
  },
  infoText: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: '#0c4a6e',
    lineHeight: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    padding: 14,
    borderWidth: 1.5,
    borderColor: COLORS.lightGreen,
  },
  cardSelected: {
    backgroundColor: COLORS.lightGreen,
    borderColor: COLORS.primaryGreen,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  cardEmoji: {
    fontSize: 24,
  },
  cardLabel: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  cardLabelSelected: {
    color: COLORS.darkGreen,
  },
  cardNote: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: COLORS.primaryGreen,
    borderColor: COLORS.primaryGreen,
  },
  checkmark: {
    color: COLORS.white,
    fontSize: 13,
    fontFamily: FONTS.primaryBold,
  },
  otherField: {
    gap: 6,
  },
  otherLabel: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  otherInput: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    borderWidth: 1.5,
    borderColor: COLORS.lightGreen,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
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
  },
});

export default Step3Health;
