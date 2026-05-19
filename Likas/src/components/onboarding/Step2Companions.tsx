import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { StepWrapper } from './StepWrapper';
import { COLORS, FONTS, SIZES } from '../../theme';
import { Icon } from '../Icon';
import {
  UserProfile,
  Companion,
  Pet,
  PetEntry,
  PetSize,
} from '../../database/storage';

interface Props {
  profile: UserProfile;
  onChange: (updates: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack?: () => void;
}

interface CompanionRow {
  key: keyof Companion;
  iconName: string;
  label: string;
  sublabel: string;
}
const COMPANION_ROWS: CompanionRow[] = [
  {
    key: 'infants',
    iconName: 'baby-carriage',
    label: 'Infants / Toddlers',
    sublabel: '0–3 years',
  },
  { key: 'children', iconName: 'human-child', label: 'Children', sublabel: '4–12 years' },
  { key: 'elderly', iconName: 'human-cane', label: 'Elderly', sublabel: '60+ years' },
  {
    key: 'pwd',
    iconName: 'wheelchair-accessibility',
    label: 'PWD / Mobility Issues',
    sublabel: 'Persons with Disabilities',
  },
];

type PetKey = keyof Omit<Pet, 'hasPets'>;
interface PetRow {
  key: PetKey;
  iconName: string;
  label: string;
}
const PET_ROWS: PetRow[] = [
  { key: 'dogs', iconName: 'dog', label: 'Dogs' },
  { key: 'cats', iconName: 'cat', label: 'Cats' },
  { key: 'birds', iconName: 'bird', label: 'Birds' },
  { key: 'rabbits', iconName: 'rabbit', label: 'Rabbits' },
  { key: 'reptiles', iconName: 'snake', label: 'Reptiles' },
  { key: 'others', iconName: 'paw', label: 'Others' },
];

const PET_SIZES: PetSize[] = ['Small', 'Medium', 'Large'];
const SIZE_NOTES: Record<PetSize, string> = {
  Small: '< 10 kg',
  Medium: '10–25 kg',
  Large: '> 25 kg',
};

const Counter = ({
  value,
  onInc,
  onDec,
}: {
  value: number;
  onInc: () => void;
  onDec: () => void;
}) => (
  <View style={s.counter}>
    <TouchableOpacity
      style={[s.cBtn, value === 0 && s.cBtnOff]}
      onPress={onDec}
      disabled={value === 0}
    >
      <Text style={s.cBtnTxt}>−</Text>
    </TouchableOpacity>
    <Text style={s.cVal}>{value}</Text>
    <TouchableOpacity style={s.cBtn} onPress={onInc}>
      <Text style={s.cBtnTxt}>+</Text>
    </TouchableOpacity>
  </View>
);

export const Step2Companions: React.FC<Props> = ({
  profile,
  onChange,
  onNext,
  onBack,
}) => {
  const updComp = (key: keyof Companion, d: number) =>
    onChange({
      companions: {
        ...profile.companions,
        [key]: Math.max(0, profile.companions[key] + d),
      },
    });

  const updPetCount = (key: PetKey, d: number) => {
    const entry = profile.pets[key] as PetEntry;
    onChange({
      pets: {
        ...profile.pets,
        [key]: { ...entry, count: Math.max(0, entry.count + d) },
      },
    });
  };

  const updPetSize = (key: PetKey, size: PetSize) => {
    const entry = profile.pets[key] as PetEntry;
    onChange({ pets: { ...profile.pets, [key]: { ...entry, size } } });
  };

  const toggleHasPets = (v: boolean) =>
    onChange({ pets: { ...profile.pets, hasPets: v } });

  const anyPet = PET_ROWS.some(
    r => (profile.pets[r.key] as PetEntry).count > 0,
  );

  return (
    <StepWrapper
      iconName="account-group"
      title="Who's with you?"
      subtitle="Helps Likas prioritize advice for vulnerable members in your group."
      onNext={onNext}
      onBack={onBack}
    >
      {/* Companions */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Household Members</Text>
        <Text style={s.cardHint}>Set to 0 if not applicable.</Text>
        {COMPANION_ROWS.map(row => (
          <View key={row.key} style={s.row}>
            <View style={s.rowL}>
              <Icon name={row.iconName} size={24} color={COLORS.primaryGreen} style={s.icon} />
              <View>
                <Text style={s.rowLabel}>{row.label}</Text>
                <Text style={s.rowSub}>{row.sublabel}</Text>
              </View>
            </View>
            <Counter
              value={profile.companions[row.key]}
              onInc={() => updComp(row.key, 1)}
              onDec={() => updComp(row.key, -1)}
            />
          </View>
        ))}
      </View>

      {/* Pets toggle */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Do you have pets?</Text>
        <View style={s.toggleRow}>
          <TouchableOpacity
            style={[s.tBtn, !profile.pets.hasPets && s.tBtnActive]}
            onPress={() => toggleHasPets(false)}
          >
            <Text style={[s.tTxt, !profile.pets.hasPets && s.tTxtActive]}>
              No Pets
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tBtn, profile.pets.hasPets && s.tBtnYes]}
            onPress={() => toggleHasPets(true)}
          >
            <View style={s.yesBtnContent}>
              <Text style={[s.tTxt, profile.pets.hasPets && s.tTxtActive]}>
                Yes
              </Text>
              <Icon name="paw" size={16} color={profile.pets.hasPets ? COLORS.darkGreen : COLORS.primaryGreen} style={{ marginLeft: 6 }} />
            </View>
          </TouchableOpacity>
        </View>

        {profile.pets.hasPets && (
          <View style={s.petGrid}>
            {PET_ROWS.map(row => {
              const entry = profile.pets[row.key] as PetEntry;
              const hasCount = entry.count > 0;
              return (
                <View key={row.key} style={s.petBlock}>
                  <View style={s.row}>
                    <View style={s.rowL}>
                      <Icon name={row.iconName} size={24} color={COLORS.primaryGreen} style={s.icon} />
                      <Text style={s.rowLabel}>{row.label}</Text>
                    </View>
                    <Counter
                      value={entry.count}
                      onInc={() => updPetCount(row.key, 1)}
                      onDec={() => updPetCount(row.key, -1)}
                    />
                  </View>

                  {/* Size selector — only show if count > 0 and relevant */}
                  {hasCount &&
                    (row.key === 'dogs' ||
                      row.key === 'cats' ||
                      row.key === 'rabbits' ||
                      row.key === 'others') && (
                      <View style={s.sizeRow}>
                        <Text style={s.sizeLabel}>Size:</Text>
                        {PET_SIZES.map(sz => (
                          <TouchableOpacity
                            key={sz}
                            style={[
                              s.sizeChip,
                              entry.size === sz && s.sizeChipOn,
                            ]}
                            onPress={() => updPetSize(row.key, sz)}
                          >
                            <Text
                              style={[
                                s.sizeTxt,
                                entry.size === sz && s.sizeTxtOn,
                              ]}
                            >
                              {sz}
                            </Text>
                            <Text style={s.sizeNote}>{SIZE_NOTES[sz]}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                </View>
              );
            })}

            {profile.pets.hasPets && !anyPet && (
              <Text style={s.petHint}>Add at least one pet above.</Text>
            )}
          </View>
        )}
      </View>
    </StepWrapper>
  );
};

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.lightGreen,
  },
  cardTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.body,
    color: COLORS.darkGreen,
  },
  cardHint: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
    marginTop: -8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  rowL: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  icon: { width: 28, textAlign: 'center' },
  rowLabel: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  rowSub: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
  },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.lightGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cBtnOff: { opacity: 0.3 },
  cBtnTxt: {
    fontFamily: FONTS.primaryBold,
    fontSize: 18,
    color: COLORS.primaryGreen,
    lineHeight: 22,
  },
  cVal: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.body,
    color: COLORS.darkGreen,
    minWidth: 22,
    textAlign: 'center',
  },
  toggleRow: { flexDirection: 'row', gap: 10 },
  tBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: SIZES.radius,
    backgroundColor: COLORS.lightGreen,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  yesBtnContent: { flexDirection: 'row', alignItems: 'center' },
  tBtnActive: { borderColor: COLORS.primaryGreen },
  tBtnYes: { backgroundColor: COLORS.primaryGreen },
  tTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.primaryGreen,
  },
  tTxtActive: { color: COLORS.darkGreen },
  petGrid: {
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGreen,
    paddingTop: 12,
  },
  petBlock: {
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGreen,
  },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 38,
  },
  sizeLabel: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
    marginRight: 2,
  },
  sizeChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 100,
    backgroundColor: COLORS.lightGreen,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  sizeChipOn: {
    backgroundColor: COLORS.accentGreen,
    borderColor: COLORS.primaryGreen,
  },
  sizeTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 12,
    color: COLORS.primaryGreen,
  },
  sizeTxtOn: { color: COLORS.darkGreen },
  sizeNote: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 10,
    color: COLORS.gray,
  },
  petHint: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default Step2Companions;
