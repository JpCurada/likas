import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { StepWrapper } from './StepWrapper';
import { COLORS, FONTS, SIZES } from '../../theme';
import { UserProfile, EmergencyContact } from '../../database/storage';
import { Icon } from '../Icon';

interface Props {
  profile: UserProfile;
  onChange: (u: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack: () => void;
}

const RELATIONSHIPS = [
  'Spouse/Partner',
  'Parent',
  'Sibling',
  'Child',
  'Relative',
  'Friend',
  'Neighbor',
];

export const Step5Contacts: React.FC<Props> = ({
  profile,
  onChange,
  onNext,
  onBack,
}) => {
  const upd = (i: number, patch: Partial<EmergencyContact>) => {
    const updated = profile.emergencyContacts.map((c, idx) =>
      idx === i ? { ...c, ...patch } : c,
    );
    onChange({ emergencyContacts: updated });
  };
  const primary = profile.emergencyContacts[0];
  const isValid =
    primary.name.trim().length >= 2 && primary.phone.trim().length >= 7;
  const phoneInvalid = (p: string) =>
    p.length > 0 && !/^(09|\+639)\d{9}$/.test(p.replace(/\s/g, ''));

  return (
    <StepWrapper
      iconName="phone-in-talk"
      title="Emergency Contacts"
      subtitle="We'll draft emergency SMS messages for you when there's no internet. One contact is required."
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!isValid}
      isLastStep
    >
      <View style={s.info}>
        <View style={s.infoHeader}>
          <Icon name="cellphone-message" size={18} color="#0c4a6e" style={{ marginRight: 6 }} />
          <Text style={s.infoTxt}>Likas will pre-fill:</Text>
        </View>
        <Text style={s.infoSample}>
          Example: Multi-line SOS with your area, GPS, a map link, meeting point,
          household / medical notes from your profile, and disaster context — you
          still tap Send in your SMS app.
        </Text>
      </View>
      {[0, 1, 2].map(i => {
        const c = profile.emergencyContacts[i];
        const required = i === 0;
        return (
          <View key={i} style={s.card}>
            <View style={s.cardTitleRow}>
              <Icon name={i === 0 ? "star" : "account"} size={16} color={COLORS.primaryGreen} style={{ marginRight: 6 }} />
              <Text style={s.cardTitle}>
                {i === 0 ? 'Primary' : i === 1 ? 'Second' : 'Third'}{' '}
                Contact{required && <Text style={s.req}> *</Text>}
              </Text>
            </View>
            <TextInput
              style={s.input}
              placeholder="Full name"
              placeholderTextColor={COLORS.gray}
              value={c.name}
              onChangeText={t => upd(i, { name: t })}
            />
            <TextInput
              style={[s.input, phoneInvalid(c.phone) && s.inputErr]}
              placeholder="Phone (09XX-XXX-XXXX)"
              placeholderTextColor={COLORS.gray}
              value={c.phone}
              onChangeText={t => upd(i, { phone: t })}
              keyboardType="phone-pad"
              maxLength={13}
            />
            {phoneInvalid(c.phone) && (
              <Text style={s.errTxt}>
                Enter a valid Philippine mobile number.
              </Text>
            )}
            {/* Relationship */}
            <Text style={s.relLabel}>Relationship</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.relRow}
            >
              {RELATIONSHIPS.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[s.relChip, c.relationship === r && s.relChipOn]}
                  onPress={() => upd(i, { relationship: r })}
                >
                  <Text style={[s.relTxt, c.relationship === r && s.relTxtOn]}>
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        );
      })}
      {!isValid && (
        <View style={s.reminder}>
          <Icon name="alert-circle" size={16} color="#92400e" style={{ marginRight: 6 }} />
          <Text style={s.reminderTxt}>
            Primary contact name + phone required.
          </Text>
        </View>
      )}
    </StepWrapper>
  );
};

const s = StyleSheet.create({
  info: {
    backgroundColor: '#e0f2fe',
    borderRadius: SIZES.radius,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.cyan,
    gap: 4,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: '#0c4a6e',
  },
  infoSample: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: '#0369a1',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    padding: 14,
    gap: 10,
    borderWidth: 1.5,
    borderColor: COLORS.lightGreen,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  req: { color: COLORS.error },
  input: {
    backgroundColor: COLORS.lightGreen,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputErr: { borderColor: COLORS.error, backgroundColor: '#fff1f2' },
  errTxt: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.error,
    marginTop: -6,
  },
  relLabel: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 12,
    color: COLORS.gray,
  },
  relRow: { gap: 8, paddingVertical: 2 },
  relChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 100,
    backgroundColor: COLORS.lightGreen,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  relChipOn: {
    backgroundColor: COLORS.primaryGreen,
    borderColor: COLORS.darkGreen,
  },
  relTxt: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.primaryGreen,
  },
  relTxtOn: { color: COLORS.white },
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

export default Step5Contacts;
