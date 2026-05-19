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
import { Icon } from '../Icon';

interface Props {
  profile: UserProfile;
  onChange: (u: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack: () => void;
}

const CONDITIONS: {
  key: keyof Omit<MedicalCondition, 'other'>;
  iconName: string;
  label: string;
  note?: string;
}[] = [
  { key: 'asthma', iconName: 'lungs', label: 'Asthma', note: 'Inhaler in go-bag' },
  {
    key: 'diabetes',
    iconName: 'needle',
    label: 'Diabetes',
    note: 'Insulin / glucose meds',
  },
  {
    key: 'heartCondition',
    iconName: 'heart-pulse',
    label: 'Heart Condition',
    note: 'Heart medications',
  },
  {
    key: 'hypertension',
    iconName: 'stethoscope',
    label: 'Hypertension',
    note: 'Blood pressure meds',
  },
  {
    key: 'epilepsy',
    iconName: 'lightning-bolt',
    label: 'Epilepsy',
    note: 'Anti-seizure medication',
  },
  {
    key: 'kidneydisease',
    iconName: 'kidney',
    label: 'Kidney Disease',
    note: 'Dialysis schedule',
  },
  { key: 'none', iconName: 'check-circle-outline', label: 'None / All Healthy' },
];

export const Step3Health: React.FC<Props> = ({
  profile,
  onChange,
  onNext,
  onBack,
}) => {
  const mc = profile.medicalConditions;
  const toggle = (key: keyof Omit<MedicalCondition, 'other'>) => {
    if (key === 'none') {
      onChange({
        medicalConditions: {
          asthma: false,
          diabetes: false,
          heartCondition: false,
          hypertension: false,
          epilepsy: false,
          kidneydisease: false,
          none: !mc.none,
          other: '',
        },
      });
      return;
    }
    onChange({ medicalConditions: { ...mc, [key]: !mc[key], none: false } });
  };
  const hasSelection =
    mc.none ||
    mc.asthma ||
    mc.diabetes ||
    mc.heartCondition ||
    mc.hypertension ||
    mc.epilepsy ||
    mc.kidneydisease;
  return (
    <StepWrapper
      iconName="hospital-box"
      title="Health & Medical Needs"
      subtitle="Critical conditions shape your emergency supply checklist."
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!hasSelection}
    >
      <View style={s.info}>
        <Icon name="lightbulb-on" size={18} color="#0c4a6e" style={{ marginRight: 6 }} />
        <Text style={s.infoTxt}>
          Select all that apply. You must pick at least one.
        </Text>
      </View>
      {CONDITIONS.map(c => {
        const on = c.key === 'none' ? mc.none : mc[c.key];
        return (
          <TouchableOpacity
            key={c.key}
            style={[s.card, on && s.cardOn]}
            onPress={() => toggle(c.key)}
            activeOpacity={0.7}
          >
            <View style={s.cardL}>
              <Icon name={c.iconName} size={26} color={on ? COLORS.primaryGreen : COLORS.darkGreen} style={s.cIcon} />
              <View>
                <Text style={[s.cLabel, on && s.cLabelOn]}>{c.label}</Text>
                {c.note && <Text style={s.cNote}>{c.note}</Text>}
              </View>
            </View>
            <View style={[s.check, on && s.checkOn]}>
              {on && <Icon name="check" size={16} color={COLORS.white} />}
            </View>
          </TouchableOpacity>
        );
      })}
      {!mc.none && (
        <View style={s.field}>
          <Text style={s.label}>Other condition (optional)</Text>
          <TextInput
            style={s.input}
            placeholder="e.g., Epilepsy, Kidney disease..."
            placeholderTextColor={COLORS.gray}
            value={mc.other}
            onChangeText={t =>
              onChange({ medicalConditions: { ...mc, other: t } })
            }
          />
        </View>
      )}
      {!hasSelection && (
        <View style={s.reminder}>
          <Icon name="alert-circle" size={16} color="#92400e" style={{ marginRight: 6 }} />
          <Text style={s.reminderTxt}>
            Please select at least one option.
          </Text>
        </View>
      )}
    </StepWrapper>
  );
};

const s = StyleSheet.create({
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    borderRadius: SIZES.radius,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.cyan,
  },
  infoTxt: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: '#0c4a6e',
    lineHeight: 20,
    flex: 1,
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
  cardOn: {
    backgroundColor: COLORS.lightGreen,
    borderColor: COLORS.primaryGreen,
  },
  cardL: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cIcon: { width: 30, textAlign: 'center' },
  cLabel: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  cLabelOn: { color: COLORS.darkGreen },
  cNote: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: COLORS.primaryGreen,
    borderColor: COLORS.primaryGreen,
  },
  field: { gap: 6 },
  label: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  input: {
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

export default Step3Health;
