import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { StepWrapper } from './StepWrapper';
import { COLORS, FONTS, SIZES } from '../../theme';
import { UserProfile, EmergencyContact } from '../../database/storage';

interface Props {
  profile: UserProfile;
  onChange: (updates: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack: () => void;
}

const CONTACT_LABELS = [
  { num: 1, emoji: '⭐', label: 'Primary Contact', required: true },
  { num: 2, emoji: '👤', label: 'Secondary Contact', required: false },
  { num: 3, emoji: '👤', label: 'Third Contact', required: false },
];

export const Step5Contacts: React.FC<Props> = ({
  profile,
  onChange,
  onNext,
  onBack,
}) => {
  const updateContact = (index: number, updates: Partial<EmergencyContact>) => {
    const updated = profile.emergencyContacts.map((c, i) =>
      i === index ? { ...c, ...updates } : c,
    );
    onChange({ emergencyContacts: updated });
  };

  const primaryContact = profile.emergencyContacts[0];
  const isValid =
    primaryContact.name.trim().length >= 2 &&
    primaryContact.phone.trim().length >= 7;

  const isPhoneValid = (phone: string) => {
    if (!phone) return true; // Optional contacts don't need to be validated if empty
    // PH mobile: 09XXXXXXXXX or +639XXXXXXXXX
    return /^(09|\+639)\d{9}$/.test(phone.replace(/\s/g, ''));
  };

  return (
    <StepWrapper
      emoji="📞"
      title="Emergency Contacts"
      subtitle="We'll use these to draft an emergency SMS if there's no internet. At least one contact is required."
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!isValid}
      isLastStep
    >
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          📱 In an emergency, Likas will pre-format a text message like:{'\n'}
          <Text style={styles.infoSample}>
            "Hi, I'm safe. My location is [Barangay]. Going to [Meeting Point].
            — [Your Name]"
          </Text>
        </Text>
      </View>

      {CONTACT_LABELS.map(({ num, emoji, label, required }, index) => {
        const contact = profile.emergencyContacts[index];
        const phoneInvalid =
          contact.phone.length > 0 && !isPhoneValid(contact.phone);

        return (
          <View key={index} style={styles.contactCard}>
            <View style={styles.contactHeader}>
              <Text style={styles.contactEmoji}>{emoji}</Text>
              <View>
                <Text style={styles.contactLabel}>
                  {label}
                  {required && <Text style={styles.required}> *</Text>}
                </Text>
                {!required && (
                  <Text style={styles.contactOptional}>Optional</Text>
                )}
              </View>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor={COLORS.gray}
              value={contact.name}
              onChangeText={text => updateContact(index, { name: text })}
            />

            <TextInput
              style={[styles.input, phoneInvalid && styles.inputError]}
              placeholder="Phone number (e.g., 09XX-XXX-XXXX)"
              placeholderTextColor={COLORS.gray}
              value={contact.phone}
              onChangeText={text => updateContact(index, { phone: text })}
              keyboardType="phone-pad"
              maxLength={13}
            />

            {phoneInvalid && (
              <Text style={styles.errorText}>
                Please enter a valid Philippine mobile number.
              </Text>
            )}
          </View>
        );
      })}

      {!isValid && (
        <View style={styles.reminderBox}>
          <Text style={styles.reminderText}>
            ⚠️ At least one contact with name and phone number is required.
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
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.cyan,
  },
  infoText: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: '#0c4a6e',
    lineHeight: 20,
  },
  infoSample: {
    fontFamily: FONTS.primaryMedium,
    fontStyle: 'italic',
    color: '#0369a1',
  },
  contactCard: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    padding: 14,
    gap: 10,
    borderWidth: 1.5,
    borderColor: COLORS.lightGreen,
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  contactEmoji: {
    fontSize: 20,
  },
  contactLabel: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  contactOptional: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
  },
  required: {
    color: COLORS.error,
  },
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
  inputError: {
    borderColor: COLORS.error,
    backgroundColor: '#fff1f2',
  },
  errorText: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.error,
    marginTop: -4,
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

export default Step5Contacts;
