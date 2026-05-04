import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
} from 'react-native';
import { StepWrapper } from './StepWrapper';
import { COLORS, FONTS, SIZES } from '../../theme';
import { UserProfile } from '../../database/storage';

interface Props {
  profile: UserProfile;
  onChange: (updates: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack: () => void;
}

import MetroManilaData from '../../data/metro_manila.json';

const METRO_MANILA: Record<string, string[]> = MetroManilaData;

const CITIES = Object.keys(METRO_MANILA).sort();

type ModalType = 'city' | 'barangay' | null;

export const Step4Location: React.FC<Props> = ({
  profile,
  onChange,
  onNext,
  onBack,
}) => {
  const [openModal, setOpenModal] = useState<ModalType>(null);
  const [searchText, setSearchText] = useState('');

  const isValid =
    profile.location.city !== '' &&
    profile.location.barangay !== '' &&
    profile.location.primaryMeetingPoint.trim().length >= 3;

  const barangays = profile.location.city
    ? METRO_MANILA[profile.location.city] || []
    : [];

  const filteredCities = CITIES.filter(c =>
    c.toLowerCase().includes(searchText.toLowerCase()),
  );
  const filteredBarangays = barangays.filter(b =>
    b.toLowerCase().includes(searchText.toLowerCase()),
  );

  const selectCity = (city: string) => {
    onChange({ location: { ...profile.location, city, barangay: '' } });
    setOpenModal(null);
    setSearchText('');
  };

  const selectBarangay = (brgy: string) => {
    onChange({ location: { ...profile.location, barangay: brgy } });
    setOpenModal(null);
    setSearchText('');
  };

  return (
    <StepWrapper
      emoji="📍"
      title="Your Location"
      subtitle="This helps pre-load the right offline maps and find nearby evacuation centers."
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!isValid}
    >
      {/* City Selector */}
      <View style={styles.field}>
        <Text style={styles.label}>City / Municipality *</Text>
        <TouchableOpacity
          style={[
            styles.selector,
            profile.location.city && styles.selectorFilled,
          ]}
          onPress={() => {
            setSearchText('');
            setOpenModal('city');
          }}
        >
          <Text
            style={[
              styles.selectorText,
              !profile.location.city && styles.selectorPlaceholder,
            ]}
          >
            {profile.location.city || 'Select your city...'}
          </Text>
          <Text style={styles.chevron}>▼</Text>
        </TouchableOpacity>
      </View>

      {/* Barangay Selector */}
      <View style={styles.field}>
        <Text style={styles.label}>Barangay *</Text>
        <TouchableOpacity
          style={[
            styles.selector,
            !profile.location.city && styles.selectorDisabled,
            profile.location.barangay && styles.selectorFilled,
          ]}
          onPress={() => {
            if (!profile.location.city) return;
            setSearchText('');
            setOpenModal('barangay');
          }}
          disabled={!profile.location.city}
        >
          <Text
            style={[
              styles.selectorText,
              !profile.location.barangay && styles.selectorPlaceholder,
            ]}
          >
            {profile.location.barangay ||
              (profile.location.city
                ? 'Select barangay...'
                : 'Select city first')}
          </Text>
          <Text style={styles.chevron}>▼</Text>
        </TouchableOpacity>
      </View>

      {/* Meeting Points */}
      <View style={styles.meetingSection}>
        <Text style={styles.meetingSectionTitle}>📌 Family Meeting Points</Text>
        <Text style={styles.meetingSectionHint}>
          Set these now so your family knows where to go if you're separated
          during a disaster.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Primary Meeting Place *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Basketball Court on Rizal St."
            placeholderTextColor={COLORS.gray}
            value={profile.location.primaryMeetingPoint}
            onChangeText={text =>
              onChange({
                location: { ...profile.location, primaryMeetingPoint: text },
              })
            }
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Secondary Meeting Place (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Grandma's house in Marikina"
            placeholderTextColor={COLORS.gray}
            value={profile.location.secondaryMeetingPoint}
            onChangeText={text =>
              onChange({
                location: { ...profile.location, secondaryMeetingPoint: text },
              })
            }
          />
        </View>
      </View>

      {/* City Modal */}
      <Modal visible={openModal === 'city'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select City</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search cities..."
              placeholderTextColor={COLORS.gray}
              value={searchText}
              onChangeText={setSearchText}
              autoFocus
            />
            <FlatList
              data={filteredCities}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => selectCity(item)}
                >
                  <Text style={styles.modalItemText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setOpenModal(null)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Barangay Modal */}
      <Modal
        visible={openModal === 'barangay'}
        animationType="slide"
        transparent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select Barangay</Text>
            <Text style={styles.modalSubtitle}>{profile.location.city}</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search barangays..."
              placeholderTextColor={COLORS.gray}
              value={searchText}
              onChangeText={setSearchText}
              autoFocus
            />
            <FlatList
              data={filteredBarangays}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => selectBarangay(item)}
                >
                  <Text style={styles.modalItemText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setOpenModal(null)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </StepWrapper>
  );
};

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    borderWidth: 1.5,
    borderColor: COLORS.lightGreen,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  selectorFilled: { borderColor: COLORS.primaryGreen },
  selectorDisabled: { backgroundColor: '#f5f5f5', opacity: 0.6 },
  selectorText: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  selectorPlaceholder: { color: COLORS.gray },
  chevron: { color: COLORS.gray, fontSize: 12 },
  input: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    borderWidth: 1.5,
    borderColor: COLORS.lightGreen,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  meetingSection: {
    backgroundColor: '#f0fdf4',
    borderRadius: SIZES.radius,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.lightGreen,
  },
  meetingSectionTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  meetingSectionHint: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
    lineHeight: 18,
    marginTop: -6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '75%',
  },
  modalTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.h3,
    color: COLORS.darkGreen,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.gray,
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: COLORS.lightGreen,
    borderRadius: SIZES.radius,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
    marginBottom: 12,
  },
  modalItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGreen,
  },
  modalItemText: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.body,
    color: COLORS.darkGreen,
  },
  modalCancel: {
    marginTop: 12,
    paddingVertical: 14,
    backgroundColor: COLORS.lightGreen,
    borderRadius: SIZES.radius,
    alignItems: 'center',
  },
  modalCancelText: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.body,
    color: COLORS.primaryGreen,
  },
});

export default Step4Location;
