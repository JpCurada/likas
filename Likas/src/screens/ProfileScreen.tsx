import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { COLORS, FONTS, SIZES } from '../theme';
import { Icon } from '../components/Icon';
import { useAppStore } from '../stores/appStore';
import {
  loadProfile,
  saveProfile,
  clearOnboardingData,
  UserProfile,
  DEFAULT_PROFILE,
  Companion,
  MeetingPoint,
  Pet,
  PetEntry,
  PetSize,
  MedicalCondition,
  EmergencyContact,
} from '../database/storage';
import {
  CITIES,
  METRO_MANILA,
  LANDMARK_SUGGESTIONS,
} from '../data/metroManila';
import RNFS from 'react-native-fs';
import { assetManager, type ManifestAsset, type Manifest } from '../services/assetManager';
import { MeetingPointPickerModal } from '../components/MeetingPointPickerModal';

// ─── Sub-components ───────────────────────────────────────────────────────────

const AssetRow: React.FC<{
  id: string;
  asset: ManifestAsset;
  isInstalled: boolean | null;
  onSideload: () => void;
  onDownload: () => void;
  loading: boolean;
}> = ({ id, asset, isInstalled, onSideload, onDownload, loading }) => {
  const iconName = asset.kind === 'mbtiles' ? 'map' : asset.kind === 'model' ? 'robot' : 'database';
  const sizeMb = (asset.size / (1024 * 1024)).toFixed(0);

  return (
    <View style={ps.dataRow}>
      <View style={ps.dataRowL}>
        <Icon
          name={isInstalled ? 'check-circle' : iconName}
          size={22}
          color={isInstalled ? COLORS.primaryGreen : COLORS.gray}
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={ps.dataRowTitle}>{id.replace(/-/g, ' ')}</Text>
          <Text style={ps.dataRowSub}>
            v{asset.version} · {sizeMb} MB · {asset.required ? 'Required' : 'Optional'}
          </Text>
        </View>
      </View>

      {isInstalled === false && (
        <View style={ps.dataBtns}>
          <TouchableOpacity
            style={ps.dataBtnSideload}
            onPress={onSideload}
            disabled={loading}
          >
            <Icon name="folder-upload" size={14} color={COLORS.primaryGreen} />
          </TouchableOpacity>
          <TouchableOpacity
            style={ps.dataBtnDownload}
            onPress={onDownload}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Icon name="download" size={14} color={COLORS.white} />
            )}
          </TouchableOpacity>
        </View>
      )}

      {isInstalled === true && (
        <View style={ps.dataInstalledBadge}>
          <Text style={ps.dataInstalledTxt}>Ready</Text>
        </View>
      )}

      {isInstalled === null && (
        <ActivityIndicator size="small" color={COLORS.primaryGreen} />
      )}
    </View>
  );
};

const SectionCard: React.FC<{
  iconName: string;
  title: string;
  children: React.ReactNode;
}> = ({ iconName, title, children }) => {
  const [open, setOpen] = useState(true);
  return (
    <View style={ps.card}>
      <TouchableOpacity
        style={ps.cardHeader}
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.7}
      >
        <View style={ps.cardHeaderL}>
          <Icon name={iconName} size={20} color={COLORS.primaryGreen} />
          <Text style={ps.cardTitle}>{title}</Text>
        </View>
        <Icon name="chevron-right" size={22} color={COLORS.gray} style={[ps.chevron, open && ps.chevronOpen]} />
      </TouchableOpacity>
      {open && <View style={ps.cardBody}>{children}</View>}
    </View>
  );
};

const FieldRow: React.FC<{
  label: string;
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
  keyboardType?: any;
  multiline?: boolean;
}> = ({
  label,
  value,
  placeholder,
  onSave,
  keyboardType = 'default',
  multiline = false,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const commit = () => {
    onSave(draft.trim());
    setEditing(false);
  };
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };
  return (
    <View style={ps.fieldRow}>
      <Text style={ps.fieldLabel}>{label}</Text>
      {editing ? (
        <>
          <TextInput
            style={[ps.fieldInput, multiline && ps.fieldInputMulti]}
            value={draft}
            onChangeText={setDraft}
            autoFocus
            keyboardType={keyboardType}
            multiline={multiline}
            numberOfLines={multiline ? 3 : 1}
            returnKeyType={multiline ? 'default' : 'done'}
            onSubmitEditing={multiline ? undefined : commit}
          />
          <View style={ps.fieldBtns}>
            <TouchableOpacity style={ps.cancelBtn} onPress={cancel}>
              <Icon name="close" size={14} color={COLORS.gray} />
              <Text style={ps.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ps.saveBtn} onPress={commit}>
              <Icon name="check" size={14} color={COLORS.white} />
              <Text style={ps.saveTxt}>Save</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <TouchableOpacity
          style={ps.fieldDisplay}
          onPress={() => {
            setDraft(value);
            setEditing(true);
          }}
          activeOpacity={0.7}
        >
          <Text style={[ps.fieldVal, !value && ps.fieldEmpty]}>
            {value || placeholder || 'Tap to edit'}
          </Text>
          <Icon name="pencil" size={16} color={COLORS.primaryGreen} style={ps.editIcon} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const Counter: React.FC<{
  value: number;
  onInc: () => void;
  onDec: () => void;
}> = ({ value, onInc, onDec }) => (
  <View style={ps.counter}>
    <TouchableOpacity
      style={[ps.cBtn, value === 0 && ps.cBtnOff]}
      onPress={onDec}
      disabled={value === 0}
    >
      <Text style={ps.cBtnTxt}>−</Text>
    </TouchableOpacity>
    <Text style={ps.cVal}>{value}</Text>
    <TouchableOpacity style={ps.cBtn} onPress={onInc}>
      <Text style={ps.cBtnTxt}>+</Text>
    </TouchableOpacity>
  </View>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────

const PET_SIZES: PetSize[] = ['Small', 'Medium', 'Large'];
type PetKey = keyof Omit<Pet, 'hasPets'>;
const PET_ROWS: {
  key: PetKey;
  iconName: string;
  label: string;
  hasSize: boolean;
}[] = [
  { key: 'dogs', iconName: 'dog', label: 'Dogs', hasSize: true },
  { key: 'cats', iconName: 'cat', label: 'Cats', hasSize: true },
  { key: 'birds', iconName: 'bird', label: 'Birds', hasSize: false },
  { key: 'rabbits', iconName: 'rabbit', label: 'Rabbits', hasSize: true },
  { key: 'reptiles', iconName: 'snake', label: 'Reptiles', hasSize: false },
  { key: 'others', iconName: 'paw', label: 'Others', hasSize: true },
];

const AGE_GROUPS = ['Under 18', '18-35', '36-55', '56+'];
const CONDITIONS: {
  key: keyof Omit<MedicalCondition, 'other'>;
  iconName: string;
  label: string;
}[] = [
  { key: 'asthma', iconName: 'lungs', label: 'Asthma' },
  { key: 'diabetes', iconName: 'needle', label: 'Diabetes' },
  { key: 'heartCondition', iconName: 'heart-pulse', label: 'Heart Condition' },
  { key: 'hypertension', iconName: 'stethoscope', label: 'Hypertension' },
  { key: 'epilepsy', iconName: 'lightning-bolt', label: 'Epilepsy' },
  { key: 'kidneydisease', iconName: 'kidney', label: 'Kidney Disease' },
  { key: 'none', iconName: 'check-circle-outline', label: 'None / All Healthy' },
];
const RELATIONSHIPS = [
  'Spouse/Partner',
  'Parent',
  'Sibling',
  'Child',
  'Relative',
  'Friend',
  'Neighbor',
  'Other',
];

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation();
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [cityModal, setCityModal] = useState(false);
  const [brgyModal, setBrgyModal] = useState(false);
  const [search, setSearch] = useState('');

  // ── Map meeting-point picker state ──
  const [pickerTarget, setPickerTarget] = useState<'primaryMeeting' | 'secondaryMeeting' | null>(null);

  // ── Asset Management state ──
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [assetStatuses, setAssetStatuses] = useState<Record<string, boolean | null>>({});
  const [assetLoading, setAssetLoading] = useState<Record<string, boolean>>({});

  const refreshAssetStatuses = useCallback(async (m: Manifest) => {
    const statuses: Record<string, boolean> = {};
    for (const id of Object.keys(m.assets)) {
      statuses[id] = await assetManager.isInstalled(id);
    }
    setAssetStatuses(statuses);
  }, []);

  useEffect(() => {
    assetManager.fetchManifest().then(m => {
      setManifest(m);
      refreshAssetStatuses(m);
    });
  }, [refreshAssetStatuses]);

  const handleSideload = useCallback(async (assetId: string) => {
    if (!manifest) return;
    const asset = manifest.assets[assetId];
    setAssetLoading(prev => ({ ...prev, [assetId]: true }));
    try {
      // Modern Android sideload path: Android/data/com.likas/files/
      const sideloadDir = Platform.OS === 'android' ? RNFS.ExternalDirectoryPath : RNFS.DocumentDirectoryPath;
      const sourcePath = `${sideloadDir}/${asset.localFilename}`;

      if (!(await RNFS.exists(sourcePath))) {
        Alert.alert(
          'File not found',
          `Place "${asset.localFilename}" in the app's external folder via USB:\n\n` +
          `${sideloadDir.replace('/storage/emulated/0', 'Internal Storage')}/`,
        );
        return;
      }
      await assetManager.importFromPath(assetId, sourcePath);
      await refreshAssetStatuses(manifest);
      Alert.alert('Success', `${assetId} has been installed successfully.`);
    } catch (err: any) {
      Alert.alert('Import failed', err?.message ?? 'Unknown error');
    } finally {
      setAssetLoading(prev => ({ ...prev, [assetId]: false }));
    }
  }, [manifest, refreshAssetStatuses]);

  const handleDownload = useCallback(async (assetId: string) => {
    if (!manifest) return;
    setAssetLoading(prev => ({ ...prev, [assetId]: true }));
    try {
      await assetManager.downloadAsset(assetId);
      await refreshAssetStatuses(manifest);
      Alert.alert('Success', `${assetId} downloaded and installed.`);
    } catch (err: any) {
      Alert.alert('Download failed', err?.message ?? 'Unknown error');
    } finally {
      setAssetLoading(prev => ({ ...prev, [assetId]: false }));
    }
  }, [manifest, refreshAssetStatuses]);

  useEffect(() => {
    loadProfile().then(p => {
      if (p) setProfile(p);
      setLoading(false);
    });
  }, []);

  const commit = useCallback(
    async (updates: Partial<UserProfile>) => {
      const updated = { ...profile, ...updates };
      setProfile(updated);
      setSaving(true);
      try {
        await saveProfile(updated);
      } catch {
        Alert.alert('Error', 'Could not save.');
      } finally {
        setSaving(false);
      }
    },
    [profile],
  );

  const handleResetOnboarding = useCallback(async () => {
    setResetting(true);
    try {
      await clearOnboardingData();
      useAppStore.getState().resetForOnboarding();
      setProfile(DEFAULT_PROFILE);
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Onboarding' }],
        }),
      );
    } catch {
      Alert.alert(
        'Reset failed',
        'Could not clear your profile. Please try again.',
      );
      setResetting(false);
    }
  }, [navigation]);

  const updLoc = (patch: Partial<typeof profile.location>) =>
    commit({ location: { ...profile.location, ...patch } });
  const updMeeting = (
    which: 'primaryMeeting' | 'secondaryMeeting',
    patch: Partial<MeetingPoint>,
  ) => updLoc({ [which]: { ...profile.location[which], ...patch } });
  const updComp = (key: keyof Companion, delta: number) =>
    commit({
      companions: {
        ...profile.companions,
        [key]: Math.max(0, profile.companions[key] + delta),
      },
    });
  const updPetCount = (key: PetKey, delta: number) => {
    const e = profile.pets[key] as PetEntry;
    commit({
      pets: {
        ...profile.pets,
        [key]: { ...e, count: Math.max(0, e.count + delta) },
      },
    });
  };
  const updPetSize = (key: PetKey, size: PetSize) => {
    const e = profile.pets[key] as PetEntry;
    commit({ pets: { ...profile.pets, [key]: { ...e, size } } });
  };
  const toggleCondition = (key: keyof Omit<MedicalCondition, 'other'>) => {
    const mc = profile.medicalConditions;
    if (key === 'none')
      commit({
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
    else commit({ medicalConditions: { ...mc, [key]: !mc[key], none: false } });
  };
  const updContact = (i: number, patch: Partial<EmergencyContact>) => {
    const c = profile.emergencyContacts.map((x, idx) =>
      idx === i ? { ...x, ...patch } : x,
    );
    commit({ emergencyContacts: c });
  };

  if (loading)
    return (
      <SafeAreaView style={ps.loadSafe}>
        <ActivityIndicator color={COLORS.primaryGreen} size="large" />
        <Text style={ps.loadTxt}>Loading profile...</Text>
      </SafeAreaView>
    );

  const barangays = profile.location.city
    ? METRO_MANILA[profile.location.city] ?? []
    : [];

  return (
    <SafeAreaView style={ps.safe} edges={['top']}>
      {/* Header */}
      <View style={ps.header}>
        <View>
          <Text style={ps.headerTitle}>My Profile</Text>
          <Text style={ps.headerSub}>All changes save automatically</Text>
        </View>
        {saving && (
          <View style={ps.saveBadge}>
            <ActivityIndicator size="small" color={COLORS.primaryGreen} />
            <Text style={ps.saveTxt2}>Saving...</Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={ps.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity Banner */}
        <View style={ps.banner}>
          <Icon name="leaf" size={36} color={COLORS.white} style={ps.bannerIcon} />
          <View>
            <Text style={ps.bannerName}>{profile.name || 'Your Name'}</Text>
            <Text style={ps.bannerAge}>
              {profile.ageGroup || 'Age not set'}
            </Text>
          </View>
        </View>

        {/* ── IDENTITY ── */}
        <SectionCard iconName="account" title="Identity">
          <FieldRow
            label="Name / Nickname"
            value={profile.name}
            placeholder="Your name"
            onSave={v => commit({ name: v })}
          />
          <View style={ps.fieldRow}>
            <Text style={ps.fieldLabel}>Age Group</Text>
            <View style={ps.chipRow}>
              {AGE_GROUPS.map(ag => (
                <TouchableOpacity
                  key={ag}
                  style={[ps.chip, profile.ageGroup === ag && ps.chipOn]}
                  onPress={() => commit({ ageGroup: ag as any })}
                >
                  <Text
                    style={[
                      ps.chipTxt,
                      profile.ageGroup === ag && ps.chipTxtOn,
                    ]}
                  >
                    {ag}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </SectionCard>

        {/* ── HOUSEHOLD ── */}
        <SectionCard iconName="account-group" title="Household Members">
          {(
            [
              {
                key: 'infants',
                iconName: 'baby-carriage',
                label: 'Infants / Toddlers',
                sub: '0–3 yrs',
              },
              {
                key: 'children',
                iconName: 'human-child',
                label: 'Children',
                sub: '4–12 yrs',
              },
              { key: 'elderly', iconName: 'human-cane', label: 'Elderly', sub: '60+ yrs' },
              {
                key: 'pwd',
                iconName: 'wheelchair-accessibility',
                label: 'PWD / Mobility',
                sub: 'Disabilities',
              },
            ] as const
          ).map(row => (
            <View key={row.key} style={ps.counterRow}>
              <View style={ps.counterRowL}>
                <Icon name={row.iconName} size={24} color={COLORS.primaryGreen} style={ps.rIcon} />
                <View>
                  <Text style={ps.rLabel}>{row.label}</Text>
                  <Text style={ps.rSub}>{row.sub}</Text>
                </View>
              </View>
              <Counter
                value={profile.companions[row.key]}
                onInc={() => updComp(row.key, 1)}
                onDec={() => updComp(row.key, -1)}
              />
            </View>
          ))}
        </SectionCard>

        {/* ── PETS ── */}
        <SectionCard iconName="paw" title="Pets">
          <View style={ps.toggleRow}>
            <TouchableOpacity
              style={[ps.tBtn, !profile.pets.hasPets && ps.tBtnOn]}
              onPress={() =>
                commit({ pets: { ...profile.pets, hasPets: false } })
              }
            >
              <Text style={[ps.tTxt, !profile.pets.hasPets && ps.tTxtOn]}>
                No Pets
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ps.tBtn, profile.pets.hasPets && ps.tBtnYes]}
              onPress={() =>
                commit({ pets: { ...profile.pets, hasPets: true } })
              }
            >
              <View style={ps.yesBtnContent}>
                <Text style={[ps.tTxt, profile.pets.hasPets && ps.tTxtOn]}>
                  Has Pets
                </Text>
                <Icon name="paw" size={16} color={profile.pets.hasPets ? COLORS.darkGreen : COLORS.primaryGreen} style={{ marginLeft: 6 }} />
              </View>
            </TouchableOpacity>
          </View>
          {profile.pets.hasPets &&
            PET_ROWS.map(row => {
              const e = profile.pets[row.key] as PetEntry;
              return (
                <View key={row.key} style={ps.petBlock}>
                  <View style={ps.counterRow}>
                    <View style={ps.counterRowL}>
                      <Icon name={row.iconName} size={24} color={COLORS.primaryGreen} style={ps.rIcon} />
                      <Text style={ps.rLabel}>{row.label}</Text>
                    </View>
                    <Counter
                      value={e.count}
                      onInc={() => updPetCount(row.key, 1)}
                      onDec={() => updPetCount(row.key, -1)}
                    />
                  </View>
                  {e.count > 0 && row.hasSize && (
                    <View style={ps.sizeRow}>
                      <Text style={ps.sizeLabel}>Size:</Text>
                      {PET_SIZES.map(sz => (
                        <TouchableOpacity
                          key={sz}
                          style={[ps.sizeChip, e.size === sz && ps.sizeChipOn]}
                          onPress={() => updPetSize(row.key, sz)}
                        >
                          <Text
                            style={[ps.sizeTxt, e.size === sz && ps.sizeTxtOn]}
                          >
                            {sz}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
        </SectionCard>

        {/* ── HEALTH ── */}
        <SectionCard iconName="hospital-box" title="Medical Conditions">
          <View style={ps.condGrid}>
            {CONDITIONS.map(c => {
              const on =
                c.key === 'none'
                  ? profile.medicalConditions.none
                  : profile.medicalConditions[c.key];
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[ps.condChip, on && ps.condChipOn]}
                  onPress={() => toggleCondition(c.key)}
                >
                  <Icon name={c.iconName} size={14} color={on ? COLORS.darkGreen : COLORS.gray} style={ps.condIcon} />
                  <Text style={[ps.condLabel, on && ps.condLabelOn]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <FieldRow
            label="Other condition"
            value={profile.medicalConditions.other}
            placeholder="e.g., Epilepsy, Kidney disease..."
            onSave={v =>
              commit({
                medicalConditions: { ...profile.medicalConditions, other: v },
              })
            }
          />
        </SectionCard>

        {/* ── LOCATION ── */}
        <SectionCard iconName="map-marker" title="Location">
          {/* City */}
          <View style={ps.fieldRow}>
            <Text style={ps.fieldLabel}>City / Municipality</Text>
            <TouchableOpacity
              style={[ps.selector, profile.location.city && ps.selectorOn]}
              onPress={() => {
                setSearch('');
                setCityModal(true);
              }}
            >
              <Text
                style={[ps.selTxt, !profile.location.city && ps.selPlaceholder]}
              >
                {profile.location.city || 'Select city...'}
              </Text>
              <Icon name="chevron-down" size={20} color={COLORS.gray} />
            </TouchableOpacity>
          </View>
          {/* Barangay */}
          <View style={ps.fieldRow}>
            <Text style={ps.fieldLabel}>Barangay</Text>
            <TouchableOpacity
              style={[
                ps.selector,
                profile.location.barangay && ps.selectorOn,
                !profile.location.city && ps.selectorOff,
              ]}
              onPress={() => {
                if (profile.location.city) {
                  setSearch('');
                  setBrgyModal(true);
                }
              }}
            >
              <Text
                style={[
                  ps.selTxt,
                  !profile.location.barangay && ps.selPlaceholder,
                ]}
              >
                {profile.location.barangay || 'Select barangay...'}
              </Text>
              <Icon name="chevron-down" size={20} color={COLORS.gray} />
            </TouchableOpacity>
          </View>
          <FieldRow
            label="Home Street Address"
            value={profile.location.streetAddress}
            placeholder="e.g., 25 Mabini St."
            onSave={v => updLoc({ streetAddress: v })}
          />

          {/* Primary Meeting Place */}
          <View style={ps.meetingHeader}>
            <Icon name="star" size={16} color={COLORS.darkGreen} />
            <Text style={ps.meetingTitle}>Primary Meeting Place</Text>
          </View>

          {/* Map pin button */}
          <TouchableOpacity
            style={ps.mapPinBtn}
            onPress={() => setPickerTarget('primaryMeeting')}
            activeOpacity={0.8}
          >
            <View style={[
              ps.mapPinIconWrap,
              profile.location.primaryMeeting.coordinates && ps.mapPinIconWrapSet,
            ]}>
              <Icon
                name={profile.location.primaryMeeting.coordinates ? 'map-marker-check' : 'map-marker-plus-outline'}
                size={22}
                color={profile.location.primaryMeeting.coordinates ? COLORS.primaryGreen : COLORS.gray}
              />
            </View>
            <View style={{ flex: 1 }}>
              {profile.location.primaryMeeting.coordinates ? (
                <>
                  <Text style={ps.mapPinSetLabel}>Pin set ✓</Text>
                  <Text style={ps.mapPinCoords}>
                    {profile.location.primaryMeeting.coordinates.latitude.toFixed(5)},{' '}
                    {profile.location.primaryMeeting.coordinates.longitude.toFixed(5)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={ps.mapPinEmptyLabel}>Tap to pin on map</Text>
                  <Text style={ps.mapPinHint}>Drop a pin at the exact meeting spot</Text>
                </>
              )}
            </View>
            <Icon name="chevron-right" size={18} color={COLORS.gray} />
          </TouchableOpacity>

          <FieldRow
            label="Landmark Name (optional)"
            value={profile.location.primaryMeeting.landmark}
            placeholder="Basketball Court, Church…"
            onSave={v => updMeeting('primaryMeeting', { landmark: v })}
          />
          <FieldRow
            label="Street Address"
            value={profile.location.primaryMeeting.streetAddress}
            placeholder="12 Rizal St., Brgy. …"
            onSave={v => updMeeting('primaryMeeting', { streetAddress: v })}
          />
          <FieldRow
            label="Notes"
            value={profile.location.primaryMeeting.notes}
            placeholder="Near the red sari-sari store…"
            onSave={v => updMeeting('primaryMeeting', { notes: v })}
            multiline
          />

          {/* Secondary Meeting Place */}
          <View style={ps.meetingHeader}>
            <Icon name="map-marker-outline" size={16} color={COLORS.darkGreen} />
            <Text style={ps.meetingTitle}>Secondary Meeting Place</Text>
          </View>

          {/* Map pin button */}
          <TouchableOpacity
            style={ps.mapPinBtn}
            onPress={() => setPickerTarget('secondaryMeeting')}
            activeOpacity={0.8}
          >
            <View style={[
              ps.mapPinIconWrap,
              profile.location.secondaryMeeting.coordinates && ps.mapPinIconWrapSet,
            ]}>
              <Icon
                name={profile.location.secondaryMeeting.coordinates ? 'map-marker-check' : 'map-marker-plus-outline'}
                size={22}
                color={profile.location.secondaryMeeting.coordinates ? COLORS.primaryGreen : COLORS.gray}
              />
            </View>
            <View style={{ flex: 1 }}>
              {profile.location.secondaryMeeting.coordinates ? (
                <>
                  <Text style={ps.mapPinSetLabel}>Pin set ✓</Text>
                  <Text style={ps.mapPinCoords}>
                    {profile.location.secondaryMeeting.coordinates.latitude.toFixed(5)},{' '}
                    {profile.location.secondaryMeeting.coordinates.longitude.toFixed(5)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={ps.mapPinEmptyLabel}>Tap to pin on map</Text>
                  <Text style={ps.mapPinHint}>Drop a pin at the exact meeting spot</Text>
                </>
              )}
            </View>
            <Icon name="chevron-right" size={18} color={COLORS.gray} />
          </TouchableOpacity>
          <FieldRow
            label="Landmark Name (optional)"
            value={profile.location.secondaryMeeting.landmark}
            placeholder="Basketball Court, Church…"
            onSave={v => updMeeting('secondaryMeeting', { landmark: v })}
          />
          <FieldRow
            label="Street Address"
            value={profile.location.secondaryMeeting.streetAddress}
            placeholder="12 Rizal St., Brgy. …"
            onSave={v => updMeeting('secondaryMeeting', { streetAddress: v })}
          />
          <FieldRow
            label="Notes"
            value={profile.location.secondaryMeeting.notes}
            placeholder="Near the red sari-sari store…"
            onSave={v => updMeeting('secondaryMeeting', { notes: v })}
            multiline
          />
        </SectionCard>

        {/* ── CONTACTS ── */}
        <SectionCard iconName="phone-in-talk" title="Emergency Contacts">
          {profile.emergencyContacts.map((c, i) => (
            <View key={i} style={ps.contactBlock}>
              <View style={ps.contactHeader}>
                <Icon name={i === 0 ? "star" : "account"} size={16} color={COLORS.darkGreen} />
                <Text style={ps.contactTitle}>
                  {i === 0 ? 'Primary' : i === 1 ? '2nd' : '3rd'} Contact
                </Text>
              </View>
              <FieldRow
                label="Name"
                value={c.name}
                placeholder="Full name"
                onSave={v => updContact(i, { name: v })}
              />
              <FieldRow
                label="Phone Number"
                value={c.phone}
                placeholder="09XX-XXX-XXXX"
                onSave={v => updContact(i, { phone: v })}
                keyboardType="phone-pad"
              />
              {/* Relationship chips */}
              <Text style={ps.fieldLabel}>Relationship</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={ps.relScroll}
              >
                {RELATIONSHIPS.map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[ps.relChip, c.relationship === r && ps.relChipOn]}
                    onPress={() => updContact(i, { relationship: r })}
                  >
                    <Text
                      style={[ps.relTxt, c.relationship === r && ps.relTxtOn]}
                    >
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ))}
        </SectionCard>

        {/* ── OFFLINE DATA ── */}
        <SectionCard iconName="database-arrow-down" title="Offline Data">
          {manifest && Object.entries(manifest.assets).map(([id, asset]) => (
            <AssetRow
              key={id}
              id={id}
              asset={asset}
              isInstalled={assetStatuses[id]}
              onSideload={() => handleSideload(id)}
              onDownload={() => handleDownload(id)}
              loading={assetLoading[id]}
            />
          ))}
          {!manifest && <ActivityIndicator color={COLORS.primaryGreen} />}

          {/*
          <Text style={ps.dataHint}>
            <Text style={{ fontWeight: 'bold' }}>Sideload Path:</Text>{`\n`}
            Android/data/com.likas/files/{`\n\n`}
            Place files here via USB and click the sideload icon to install them into protected storage.
          </Text>
          */}
        </SectionCard>

        {/* Reset */}
        <TouchableOpacity
          style={[ps.resetBtn, resetting && ps.resetBtnDisabled]}
          disabled={resetting}
          onPress={() =>
            Alert.alert(
              'Reset & Redo Onboarding?',
              'Your profile and prep checklist will be cleared. Offline maps and the AI model stay installed.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Reset',
                  style: 'destructive',
                  onPress: () => void handleResetOnboarding(),
                },
              ],
            )
          }
        >
          {resetting ? (
            <ActivityIndicator size="small" color={COLORS.error} />
          ) : (
            <Icon name="refresh" size={18} color={COLORS.error} style={{ marginRight: 8 }} />
          )}
          <Text style={ps.resetTxt}>
            {resetting ? 'Resetting…' : 'Reset & Redo Onboarding'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Meeting Point Map Picker */}
      <MeetingPointPickerModal
        visible={pickerTarget !== null}
        title={
          pickerTarget === 'primaryMeeting'
            ? 'Pin Primary Meeting Point'
            : 'Pin Secondary Meeting Point'
        }
        initial={
          pickerTarget ? profile.location[pickerTarget].coordinates : null
        }
        onConfirm={coords => {
          if (pickerTarget) {
            updMeeting(pickerTarget, { coordinates: coords });
          }
          setPickerTarget(null);
        }}
        onCancel={() => setPickerTarget(null)}
      />

      {resetting && (
        <Modal visible transparent animationType="fade" statusBarTranslucent>
          <View style={ps.resetOverlay}>
            <ActivityIndicator size="large" color={COLORS.primaryGreen} />
            <Text style={ps.resetOverlayTxt}>Clearing profile…</Text>
          </View>
        </Modal>
      )}

      {/* City Modal */}
      <Modal visible={cityModal} animationType="slide" transparent>
        <View style={ps.overlay}>
          <View style={ps.sheet}>
            <Text style={ps.modalTitle}>Select City</Text>
            <TextInput
              style={ps.modalSearch}
              placeholder="Search..."
              placeholderTextColor={COLORS.gray}
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            <FlatList
              data={CITIES.filter(c =>
                c.toLowerCase().includes(search.toLowerCase()),
              )}
              keyExtractor={i => i}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={ps.modalItem}
                  onPress={() => {
                    updLoc({ city: item, barangay: '' });
                    setCityModal(false);
                    setSearch('');
                  }}
                >
                  <Text style={ps.modalItemTxt}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={ps.modalCancel}
              onPress={() => setCityModal(false)}
            >
              <Text style={ps.modalCancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Barangay Modal */}
      <Modal visible={brgyModal} animationType="slide" transparent>
        <View style={ps.overlay}>
          <View style={ps.sheet}>
            <Text style={ps.modalTitle}>Select Barangay</Text>
            <Text style={ps.modalSub}>{profile.location.city}</Text>
            <TextInput
              style={ps.modalSearch}
              placeholder="Search..."
              placeholderTextColor={COLORS.gray}
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            <FlatList
              data={barangays.filter(b =>
                b.toLowerCase().includes(search.toLowerCase()),
              )}
              keyExtractor={i => i}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={ps.modalItem}
                  onPress={() => {
                    updLoc({ barangay: item });
                    setBrgyModal(false);
                    setSearch('');
                  }}
                >
                  <Text style={ps.modalItemTxt}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={ps.modalCancel}
              onPress={() => setBrgyModal(false)}
            >
              <Text style={ps.modalCancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const ps = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f0fdf4' },
  loadSafe: {
    flex: 1,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadTxt: {
    fontFamily: FONTS.primaryRegular,
    color: COLORS.gray,
    fontSize: SIZES.small,
  },
  header: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SIZES.padding,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGreen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: SIZES.h2,
    color: COLORS.darkGreen,
  },
  headerSub: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  saveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.lightGreen,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  saveTxt2: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.primaryGreen,
  },
  scroll: { padding: SIZES.padding, gap: 12 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.darkGreen,
    borderRadius: SIZES.radius + 4,
    padding: 20,
  },
  bannerIcon: { marginRight: 4 },
  bannerName: {
    fontFamily: FONTS.primaryExtraBold,
    fontSize: SIZES.h2,
    color: COLORS.white,
  },
  bannerAge: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.accentGreen,
    marginTop: 2,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.lightGreen,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  cardHeaderL: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.body,
    color: COLORS.darkGreen,
  },
  chevron: { transform: [{ rotate: '0deg' }] },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGreen,
    paddingTop: 12,
    gap: 12,
  },
  fieldRow: { gap: 5 },
  fieldLabel: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 12,
    color: COLORS.gray,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fieldDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.lightGreen,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fieldVal: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
    flex: 1,
  },
  fieldEmpty: { color: COLORS.gray, fontStyle: 'italic' },
  editIcon: { marginLeft: 8 },
  fieldInput: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primaryGreen,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  fieldInputMulti: { minHeight: 72, textAlignVertical: 'top' },
  fieldBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: COLORS.lightGreen,
    borderRadius: 8,
  },
  cancelTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.gray,
    marginLeft: 4,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: COLORS.primaryGreen,
    borderRadius: 8,
  },
  saveTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.white,
    marginLeft: 4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
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
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counterRowL: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  rIcon: { width: 28, textAlign: 'center' },
  rLabel: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  rSub: { fontFamily: FONTS.primaryRegular, fontSize: 12, color: COLORS.gray },
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
  tBtnOn: { borderColor: COLORS.primaryGreen },
  yesBtnContent: { flexDirection: 'row', alignItems: 'center' },
  tBtnYes: { backgroundColor: COLORS.primaryGreen },
  tTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.small,
    color: COLORS.primaryGreen,
  },
  tTxtOn: { color: COLORS.darkGreen },
  petBlock: {
    gap: 6,
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
  },
  sizeChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 100,
    backgroundColor: COLORS.lightGreen,
    borderWidth: 1.5,
    borderColor: 'transparent',
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
  condGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  condChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 100,
    backgroundColor: COLORS.lightGreen,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  condChipOn: { backgroundColor: '#dcfce7', borderColor: COLORS.primaryGreen },
  condIcon: {},
  condLabel: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 12,
    color: COLORS.gray,
  },
  condLabelOn: { color: COLORS.darkGreen },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.lightGreen,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  selectorOn: { borderColor: COLORS.primaryGreen },
  selectorOff: { opacity: 0.5 },
  selTxt: {
    fontFamily: FONTS.primaryRegular,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
    flex: 1,
  },
  selPlaceholder: { color: COLORS.gray, fontStyle: 'italic' },
  meetingHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  meetingTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  // ── Map pin button ──
  mapPinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.lightGreen,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  mapPinIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPinIconWrapSet: {
    backgroundColor: '#dcfce7',
  },
  mapPinSetLabel: {
    fontFamily: FONTS.primaryBold,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primaryGreen,
  },
  mapPinCoords: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 1,
    letterSpacing: 0.2,
  },
  mapPinEmptyLabel: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 13,
    color: COLORS.darkGreen,
  },
  mapPinHint: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 1,
  },
  contactBlock: {
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGreen,
  },
  contactHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contactTitle: {
    fontFamily: FONTS.primaryBold,
    fontSize: SIZES.small,
    color: COLORS.darkGreen,
  },
  relScroll: { gap: 8, paddingVertical: 2 },
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
  // ── Offline Data section ──
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  dataRowL: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dataRowTitle: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 14,
    color: '#1a1a1a',
    textTransform: 'capitalize',
  },
  dataRowSub: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  dataBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dataBtnSideload: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.lightGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dataBtnDownload: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primaryGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dataInstalledBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  dataInstalledTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: 11,
    color: COLORS.primaryGreen,
  },
  dataHint: {
    fontFamily: FONTS.primaryRegular,
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 16,
    lineHeight: 17,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
  },
  resetBtn: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnDisabled: {
    opacity: 0.7,
  },
  resetTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.body,
    color: COLORS.error,
  },
  resetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(240, 253, 244, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  resetOverlayTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.body,
    color: COLORS.darkGreen,
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
  modalSearch: {
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
  modalCancel: {
    marginTop: 10,
    paddingVertical: 14,
    backgroundColor: COLORS.lightGreen,
    borderRadius: SIZES.radius,
    alignItems: 'center',
  },
  modalCancelTxt: {
    fontFamily: FONTS.primarySemiBold,
    fontSize: SIZES.body,
    color: COLORS.primaryGreen,
  },
});

export default ProfileScreen;