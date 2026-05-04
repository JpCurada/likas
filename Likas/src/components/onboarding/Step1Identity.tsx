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
import { Icon } from '../Icon';

interface Props {
  profile: UserProfile;
  onChange: (u: Partial<UserProfile>) => void;
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
      iconName="leaf"
      title="Mabuhay! I'm Likas."
      subtitle="Your offline disaster readiness companion. Let's get to know each other."
      onNext={onNext}
      nextDisabled={!isValid}
    >
      <View style={s.field}>
        <Text style={s.label}>What should I call you?</Text>
        <TextInput
          style={s.input}
          placeholder="Your name or nickname"
          placeholderTextColor={COLORS.gray}
          value={profile.name}
          onChangeText={t => onChange({ name: t })}
          maxLength={30}
          autoFocus
        />
        {profile.name.trim().length > 0 && profile.name.trim().length < 2 && (
          <Text style={s.error}>At least 2 characters required.</Text>
        )}
      </View>
      <View style={s.field}>
        <Text style={s.label}>What is your age group?</Text>
        <Text style={s.hint}>This helps us give the best advice.</Text>
        <View style={s.grid}>
          {AGE_GROUPS.map(ag => (
            <TouchableOpacity
              key={ag}
              style={[s.chip, profile.ageGroup === ag && s.chipOn]}
              onPress={() => onChange({ ageGroup: ag })}
              activeOpacity={0.7}
            >
              <Text style={[s.chipTxt, profile.ageGroup === ag && s.chipTxtOn]}>
                {ag}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {!isValid && (
        <View style={s.reminder}>
          <Icon name="alert-circle" size={16} color="#92400e" style={{ marginRight: 6 }} />
          <Text style={s.reminderTxt}>
            Both fields required to continue.
          </Text>
        </View>
      )}
    </StepWrapper>
  );
};

const s = StyleSheet.create({
  field: { gap: 8 },
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
  error: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.error,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 100,
    backgroundColor: COLORS.lightGreen,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipOn: {
    backgroundColor: COLORS.primaryGreen,
    borderColor: COLORS.darkGreen,
  },
  chipTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.primaryGreen,
  },
  chipTxtOn: { color: COLORS.white },
  reminder: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff8e1',
    borderRadius: SIZES.radius,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  reminderTxt: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: '#92400e',
  },
});

export default Step1Identity;
