import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { StepWrapper } from './StepWrapper';
import { COLORS, FONTS, SIZES } from '../../theme';
import { UserProfile, Companion, Pet } from '../../database/storage';

interface Props {
  profile: UserProfile;
  onChange: (updates: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack: () => void;
}

interface CompanionRow {
  key: keyof Companion;
  emoji: string;
  label: string;
  sublabel: string;
}

const COMPANION_ROWS: CompanionRow[] = [
  {
    key: 'infants',
    emoji: '👶',
    label: 'Infants / Toddlers',
    sublabel: '0–3 years',
  },
  { key: 'children', emoji: '🧒', label: 'Children', sublabel: '4–12 years' },
  { key: 'elderly', emoji: '👴', label: 'Elderly', sublabel: '60+ years' },
  {
    key: 'pwd',
    emoji: '♿',
    label: 'PWD / Mobility Issues',
    sublabel: 'Persons with Disabilities',
  },
];

interface PetRow {
  key: keyof Omit<Pet, 'hasPets'>;
  emoji: string;
  label: string;
}

const PET_ROWS: PetRow[] = [
  { key: 'dogs', emoji: '🐕', label: 'Dogs' },
  { key: 'cats', emoji: '🐈', label: 'Cats' },
  { key: 'birds', emoji: '🐦', label: 'Birds' },
  { key: 'others', emoji: '🐾', label: 'Others' },
];

// Counter component
const Counter: React.FC<{
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
}> = ({ value, onIncrement, onDecrement }) => (
  <View style={styles.counter}>
    <TouchableOpacity
      style={[styles.counterBtn, value === 0 && styles.counterBtnDisabled]}
      onPress={onDecrement}
      disabled={value === 0}
    >
      <Text style={styles.counterBtnText}>−</Text>
    </TouchableOpacity>
    <Text style={styles.counterValue}>{value}</Text>
    <TouchableOpacity style={styles.counterBtn} onPress={onIncrement}>
      <Text style={styles.counterBtnText}>+</Text>
    </TouchableOpacity>
  </View>
);

export const Step2Companions: React.FC<Props> = ({
  profile,
  onChange,
  onNext,
  onBack,
}) => {
  const updateCompanion = (key: keyof Companion, delta: number) => {
    const current = profile.companions[key];
    const next = Math.max(0, current + delta);
    onChange({ companions: { ...profile.companions, [key]: next } });
  };

  const updatePet = (key: keyof Omit<Pet, 'hasPets'>, delta: number) => {
    const current = profile.pets[key] as number;
    const next = Math.max(0, current + delta);
    onChange({ pets: { ...profile.pets, [key]: next } });
  };

  const togglePets = (hasPets: boolean) => {
    onChange({
      pets: {
        ...profile.pets,
        hasPets,
        // Reset counts if turning off
        ...(hasPets ? {} : { dogs: 0, cats: 0, birds: 0, others: 0 }),
      },
    });
  };

  return (
    <StepWrapper
      emoji="👨‍👩‍👧‍👦"
      title="Who's with you?"
      subtitle="This helps Likas prioritize advice for vulnerable members in your group."
      onNext={onNext}
      onBack={onBack}
    >
      {/* Companions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Household Members</Text>
        <Text style={styles.sectionHint}>Set to 0 if not applicable.</Text>

        {COMPANION_ROWS.map(row => (
          <View key={row.key} style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowEmoji}>{row.emoji}</Text>
              <View>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowSublabel}>{row.sublabel}</Text>
              </View>
            </View>
            <Counter
              value={profile.companions[row.key]}
              onIncrement={() => updateCompanion(row.key, 1)}
              onDecrement={() => updateCompanion(row.key, -1)}
            />
          </View>
        ))}
      </View>

      {/* Pets */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Do you have pets?</Text>

        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              !profile.pets.hasPets && styles.toggleBtnActive,
            ]}
            onPress={() => togglePets(false)}
          >
            <Text
              style={[
                styles.toggleText,
                !profile.pets.hasPets && styles.toggleTextActive,
              ]}
            >
              No Pets
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              profile.pets.hasPets && styles.toggleBtnActiveYes,
            ]}
            onPress={() => togglePets(true)}
          >
            <Text
              style={[
                styles.toggleText,
                profile.pets.hasPets && styles.toggleTextActive,
              ]}
            >
              Yes, I Have Pets 🐾
            </Text>
          </TouchableOpacity>
        </View>

        {profile.pets.hasPets && (
          <View style={styles.petGrid}>
            {PET_ROWS.map(row => (
              <View key={row.key} style={styles.petRow}>
                <View style={styles.rowLeft}>
                  <Text style={styles.rowEmoji}>{row.emoji}</Text>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                </View>
                <Counter
                  value={profile.pets[row.key] as number}
                  onIncrement={() => updatePet(row.key, 1)}
                  onDecrement={() => updatePet(row.key, -1)}
                />
              </View>
            ))}
          </View>
        )}
      </View>
    </StepWrapper>
  );
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.lightGreen,
  },
  sectionTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.body,
    color: COLORS.darkGreen,
  },
  sectionHint: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
    marginTop: -8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rowEmoji: {
    fontSize: 22,
  },
  rowLabel: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  rowSublabel: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  counterBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.lightGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBtnDisabled: {
    opacity: 0.4,
  },
  counterBtnText: {
    fontFamily: FONTS.primaryBold,
    fontSize: 18,
    color: COLORS.primaryGreen,
    lineHeight: 22,
  },
  counterValue: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.body,
    color: COLORS.darkGreen,
    minWidth: 20,
    textAlign: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: SIZES.radius,
    backgroundColor: COLORS.lightGreen,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  toggleBtnActive: {
    backgroundColor: COLORS.lightGreen,
    borderColor: COLORS.primaryGreen,
  },
  toggleBtnActiveYes: {
    backgroundColor: COLORS.primaryGreen,
    borderColor: COLORS.darkGreen,
  },
  toggleText: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.primaryGreen,
  },
  toggleTextActive: {
    color: COLORS.darkGreen,
  },
  petGrid: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGreen,
    paddingTop: 12,
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

export default Step2Companions;
