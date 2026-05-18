import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { StepWrapper } from './StepWrapper';
import { COLORS, FONTS, SIZES } from '../../theme';
import { UserProfile, MeetingPoint } from '../../database/storage';
import { LatLng } from '../../types';
import { Icon } from '../Icon';
import { MeetingPointPickerModal } from '../MeetingPointPickerModal';
import {
  CITIES,
  METRO_MANILA,
  LANDMARK_SUGGESTIONS,
} from '../../data/metroManila';

interface Props {
  profile: UserProfile;
  onChange: (updates: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack: () => void;
}

type ModalType = 'city' | 'barangay' | null;

const MeetingPointForm = ({
  label,
  iconName,
  required,
  value,
  onChange,
  onPickPin,
}: {
  label: string;
  iconName: string;
  required?: boolean;
  value: MeetingPoint;
  onChange: (v: MeetingPoint) => void;
  onPickPin: () => void;
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const pinned = value.coordinates;

  return (
    <View style={ms.container}>
      <View style={ms.headingRow}>
        <Icon name={iconName} size={16} color={COLORS.primaryGreen} style={{ marginRight: 6 }} />
        <Text style={ms.heading}>
          {label}
          {required && <Text style={ms.req}> *</Text>}
        </Text>
      </View>

      {/* Pin on map — opens the offline-map picker modal */}
      <TouchableOpacity
        style={ms.mapPinBtn}
        onPress={onPickPin}
        activeOpacity={0.85}
      >
        <View
          style={[ms.mapPinIconWrap, pinned ? ms.mapPinIconWrapSet : null]}
        >
          <Icon
            name={pinned ? 'map-marker-check' : 'map-marker-plus-outline'}
            size={22}
            color={pinned ? COLORS.primaryGreen : COLORS.gray}
          />
        </View>
        <View style={{ flex: 1 }}>
          {pinned ? (
            <>
              <Text style={ms.mapPinSetLabel}>Pin set ✓</Text>
              <Text style={ms.mapPinCoords}>
                {pinned.latitude.toFixed(5)}, {pinned.longitude.toFixed(5)}
              </Text>
            </>
          ) : (
            <>
              <Text style={ms.mapPinEmptyLabel}>Tap to pin on map</Text>
              <Text style={ms.mapPinHint}>
                Drop a pin at the exact meeting spot
              </Text>
            </>
          )}
        </View>
        <Icon name="chevron-right" size={18} color={COLORS.gray} />
      </TouchableOpacity>

      {/* Landmark */}
      <View style={ms.field}>
        <Text style={ms.label}>
          Landmark / Place Name
          {required && <Text style={ms.req}> *</Text>}
        </Text>
        <TextInput
          style={ms.input}
          placeholder="e.g., Basketball Court, Church, School"
          placeholderTextColor={COLORS.gray}
          value={value.landmark}
          onChangeText={t => onChange({ ...value, landmark: t })}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            timeoutRef.current = setTimeout(() => setShowSuggestions(false), 150);
          }}
        />
        {showSuggestions && (value.landmark || '').length === 0 && (
          <ScrollView
            style={ms.suggestions}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled={true}
          >
            {LANDMARK_SUGGESTIONS.map(s => (
              <TouchableOpacity
                key={s}
                style={ms.suggestion}
                onPress={() => onChange({ ...value, landmark: s })}
              >
                <Text style={ms.suggestionTxt}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Street Address */}
      <View style={ms.field}>
        <Text style={ms.label}>Street Address (optional)</Text>
        <TextInput
          style={ms.input}
          placeholder="e.g., 12 Rizal St., Brgy. Commonwealth"
          placeholderTextColor={COLORS.gray}
          value={value.streetAddress}
          onChangeText={t => onChange({ ...value, streetAddress: t })}
        />
      </View>

      {/* Notes */}
      <View style={ms.field}>
        <Text style={ms.label}>Additional Notes (optional)</Text>
        <TextInput
          style={[ms.input, ms.inputMulti]}
          placeholder="e.g., Near the red-roofed sari-sari store, across from the waiting shed"
          placeholderTextColor={COLORS.gray}
          value={value.notes}
          onChangeText={t => onChange({ ...value, notes: t })}
          multiline
          numberOfLines={2}
        />
      </View>
    </View>
  );
};

const ms = StyleSheet.create({
  container: {
    backgroundColor: '#f0fdf4',
    borderRadius: SIZES.radius,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.lightGreen,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heading: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  req: { color: COLORS.error },
  field: { gap: 4 },
  label: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 12,
    color: COLORS.gray,
  },
  input: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.lightGreen,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  inputMulti: { minHeight: 60, textAlignVertical: 'top' },
  mapPinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    borderWidth: 1.5,
    borderColor: COLORS.lightGreen,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mapPinIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPinIconWrapSet: {
    backgroundColor: COLORS.lightGreen,
  },
  mapPinSetLabel: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.primaryGreen,
  },
  mapPinCoords: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 1,
    letterSpacing: 0.3,
  },
  mapPinEmptyLabel: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  mapPinHint: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 1,
  },
  suggestions: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.lightGreen,
    maxHeight: 180,
    overflow: 'hidden',
  },
  suggestion: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGreen,
  },
  suggestionTxt: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
});

export const Step4Location: React.FC<Props> = ({
  profile,
  onChange,
  onNext,
  onBack,
}) => {
  const [openModal, setOpenModal] = useState<ModalType>(null);
  const [search, setSearch] = useState('');
  const [pickerTarget, setPickerTarget] =
    useState<'primaryMeeting' | 'secondaryMeeting' | null>(null);

  const loc = profile.location;
  const isValid =
    loc?.city !== '' &&
    loc?.barangay !== '' &&
    (loc?.primaryMeeting?.landmark || '').trim().length >= 2;

  const handlePinConfirm = (coords: LatLng) => {
    if (!pickerTarget) return;
    const target = loc[pickerTarget];
    onChange({
      location: {
        ...loc,
        [pickerTarget]: { ...target, coordinates: coords },
      },
    });
    setPickerTarget(null);
  };

  const barangays = loc.city ? METRO_MANILA[loc.city] ?? [] : [];
  const filteredCities = CITIES.filter(c =>
    c.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredBrgys = barangays.filter(b =>
    b.toLowerCase().includes(search.toLowerCase()),
  );

  const pickCity = (city: string) => {
    onChange({ location: { ...loc, city, barangay: '' } });
    setOpenModal(null);
    setSearch('');
  };
  const pickBrgy = (brgy: string) => {
    onChange({ location: { ...loc, barangay: brgy } });
    setOpenModal(null);
    setSearch('');
  };

  return (
    <StepWrapper
      iconName="map-marker"
      title="Your Location"
      subtitle="Helps pre-load offline maps and find the nearest evacuation centers for your area."
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!isValid}
    >
      {/* City */}
      <View style={s.field}>
        <Text style={s.label}>
          City / Municipality <Text style={s.req}>*</Text>
        </Text>
        <TouchableOpacity
          style={[s.selector, loc.city && s.selectorFilled]}
          onPress={() => {
            setSearch('');
            setOpenModal('city');
          }}
        >
          <Text style={[s.selTxt, !loc.city && s.selPlaceholder]}>
            {loc.city || 'Select city...'}
          </Text>
          <Icon name="chevron-down" size={20} color={COLORS.gray} />
        </TouchableOpacity>
      </View>

      {/* Barangay */}
      <View style={s.field}>
        <Text style={s.label}>
          Barangay <Text style={s.req}>*</Text>
        </Text>
        <TouchableOpacity
          style={[
            s.selector,
            !loc.city && s.selectorDisabled,
            loc.barangay && s.selectorFilled,
          ]}
          onPress={() => {
            if (!loc.city) return;
            setSearch('');
            setOpenModal('barangay');
          }}
          disabled={!loc.city}
        >
          <Text style={[s.selTxt, !loc.barangay && s.selPlaceholder]}>
            {loc.barangay ||
              (loc.city ? 'Select barangay...' : 'Select city first')}
          </Text>
          <Icon name="chevron-down" size={20} color={COLORS.gray} />
        </TouchableOpacity>
        {loc.city && (
          <Text style={s.count}>{barangays.length} barangays available</Text>
        )}
      </View>

      {/* Home street address */}
      <View style={s.field}>
        <Text style={s.label}>Home Street Address (optional)</Text>
        <TextInput
          style={s.input}
          placeholder="e.g., 25 Mabini St., Brgy. Holy Spirit"
          placeholderTextColor={COLORS.gray}
          value={loc.streetAddress}
          onChangeText={t =>
            onChange({ location: { ...loc, streetAddress: t } })
          }
        />
      </View>

      <View style={s.divider} />
      <View style={s.sectionHeader}>
        <Icon name="pin" size={20} color={COLORS.darkGreen} style={{ marginRight: 8 }} />
        <Text style={s.sectionTitle}>Family Meeting Points</Text>
      </View>
      <Text style={s.sectionHint}>
        Where does your family go if you get separated? Be as specific as
        possible so anyone can find it.
      </Text>

      <MeetingPointForm
        label="Primary Meeting Place"
        iconName="star"
        required
        value={loc.primaryMeeting}
        onChange={v => onChange({ location: { ...loc, primaryMeeting: v } })}
        onPickPin={() => setPickerTarget('primaryMeeting')}
      />

      <MeetingPointForm
        label="Secondary Meeting Place"
        iconName="map-marker-outline"
        value={loc.secondaryMeeting}
        onChange={v => onChange({ location: { ...loc, secondaryMeeting: v } })}
        onPickPin={() => setPickerTarget('secondaryMeeting')}
      />

      {/* Map pin picker — opens the offline map so the user can drop a
          precise GPS pin for the selected meeting point. */}
      <MeetingPointPickerModal
        visible={pickerTarget !== null}
        title={
          pickerTarget === 'primaryMeeting'
            ? 'Pin Primary Meeting Point'
            : 'Pin Secondary Meeting Point'
        }
        initial={pickerTarget ? loc[pickerTarget]?.coordinates ?? null : null}
        onConfirm={handlePinConfirm}
        onCancel={() => setPickerTarget(null)}
      />

      {/* City Modal */}
      <Modal 
        visible={openModal === 'city'} 
        animationType="slide" 
        transparent
        onRequestClose={() => setOpenModal(null)}
      >
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.modalTitle}>Select City</Text>
            <TextInput
              style={s.searchInput}
              placeholder="Search..."
              placeholderTextColor={COLORS.gray}
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            <FlatList
              data={filteredCities}
              keyExtractor={i => i}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.modalItem}
                  onPress={() => pickCity(item)}
                >
                  <Text style={s.modalItemTxt}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={() => setOpenModal(null)}
            >
              <Text style={s.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Barangay Modal */}
      <Modal
        visible={openModal === 'barangay'}
        animationType="slide"
        transparent
        onRequestClose={() => setOpenModal(null)}
      >
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.modalTitle}>Select Barangay</Text>
            <Text style={s.modalSub}>{loc.city}</Text>
            <TextInput
              style={s.searchInput}
              placeholder="Search..."
              placeholderTextColor={COLORS.gray}
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            <FlatList
              data={filteredBrgys}
              keyExtractor={i => i}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.modalItem}
                  onPress={() => pickBrgy(item)}
                >
                  <Text style={s.modalItemTxt}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={() => setOpenModal(null)}
            >
              <Text style={s.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </StepWrapper>
  );
};

const s = StyleSheet.create({
  field: { gap: 5 },
  label: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  req: { color: COLORS.error },
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
  selectorDisabled: { opacity: 0.5, backgroundColor: '#f5f5f5' },
  selTxt: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
    flex: 1,
  },
  selPlaceholder: { color: COLORS.gray },
  count: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 11,
    color: COLORS.gray,
    marginLeft: 4,
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
  divider: { height: 1, backgroundColor: COLORS.lightGreen },
  sectionHeader: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.body,
    color: COLORS.darkGreen,
  },
  sectionHint: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
    lineHeight: 18,
    marginTop: -6,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '78%',
  },
  modalTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.h3,
    color: COLORS.darkGreen,
    marginBottom: 2,
  },
  modalSub: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.gray,
    marginBottom: 10,
  },
  searchInput: {
    backgroundColor: COLORS.lightGreen,
    borderRadius: SIZES.radius,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
    marginBottom: 10,
  },
  modalItem: {
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGreen,
  },
  modalItemTxt: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.body,
    color: COLORS.darkGreen,
  },
  cancelBtn: {
    marginTop: 10,
    paddingVertical: 14,
    backgroundColor: COLORS.lightGreen,
    borderRadius: SIZES.radius,
    alignItems: 'center',
  },
  cancelTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.body,
    color: COLORS.primaryGreen,
  },
});

export default Step4Location;
