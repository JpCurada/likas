import AsyncStorage from '@react-native-async-storage/async-storage';
import {defaultCoordinates} from '../data/seedData';

const KEYS = {
  USER_PROFILE: 'likas_user_profile',
  ONBOARDING_COMPLETE: 'likas_onboarding_complete',
  PREP_CHECKLIST: 'likas_prep_checklist',
  SETUP_COMPLETE: 'likas_setup_complete',
};

// ─── Types ────────────────────────────────────────────────────────────────────

// Re-export the canonical types from src/types.ts. Kept here for backwards
// compatibility with onboarding/profile screens that already import them
// from this module.
export type {
  Companion,
  PetSize,
  PetEntry,
  Pet,
  MedicalCondition,
  MeetingPoint,
  UserLocation as Location,
  EmergencyContact,
  UserProfile,
} from '../types';
import type {PetEntry, MeetingPoint, UserProfile} from '../types';

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_PET_ENTRY: PetEntry = { count: 0, size: 'Medium' };

const DEFAULT_MEETING: MeetingPoint = {
  landmark: '',
  streetAddress: '',
  notes: '',
  coordinates: null,
};

export const DEFAULT_PROFILE: UserProfile = {
  name: '',
  ageGroup: '',
  companions: { infants: 0, children: 0, elderly: 0, pwd: 0 },
  pets: {
    hasPets: false,
    dogs: { ...DEFAULT_PET_ENTRY },
    cats: { ...DEFAULT_PET_ENTRY },
    birds: { ...DEFAULT_PET_ENTRY },
    rabbits: { ...DEFAULT_PET_ENTRY },
    reptiles: { ...DEFAULT_PET_ENTRY },
    others: { ...DEFAULT_PET_ENTRY },
  },
  medicalConditions: {
    asthma: false,
    diabetes: false,
    heartCondition: false,
    hypertension: false,
    epilepsy: false,
    kidneydisease: false,
    none: false,
    other: '',
  },
  location: {
    city: '',
    barangay: '',
    streetAddress: '',
    coordinates: defaultCoordinates,
    primaryMeeting: { ...DEFAULT_MEETING },
    secondaryMeeting: { ...DEFAULT_MEETING },
  },
  emergencyContacts: [
    { name: '', phone: '', relationship: '' },
    { name: '', phone: '', relationship: '' },
    { name: '', phone: '', relationship: '' },
  ],
};

// ─── Profile ──────────────────────────────────────────────────────────────────

export const saveProfile = async (profile: UserProfile): Promise<void> => {
  await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(profile));
};

export const loadProfile = async (): Promise<UserProfile | null> => {
  const data = await AsyncStorage.getItem(KEYS.USER_PROFILE);
  if (!data) return null;
  // Merge with DEFAULT_PROFILE so old saves get new fields
  const saved = JSON.parse(data) as Partial<UserProfile>;
  return deepMerge(DEFAULT_PROFILE, saved) as UserProfile;
};

// ─── Onboarding ───────────────────────────────────────────────────────────────

export const setOnboardingComplete = async (): Promise<void> => {
  await AsyncStorage.setItem(KEYS.ONBOARDING_COMPLETE, 'true');
};

export const isOnboardingComplete = async (): Promise<boolean> => {
  const val = await AsyncStorage.getItem(KEYS.ONBOARDING_COMPLETE);
  return val === 'true';
};

// ─── Setup (post-onboarding asset download) ───────────────────────────────────

export const setSetupComplete = async (): Promise<void> => {
  await AsyncStorage.setItem(KEYS.SETUP_COMPLETE, 'true');
};

export const isSetupComplete = async (): Promise<boolean> => {
  const val = await AsyncStorage.getItem(KEYS.SETUP_COMPLETE);
  return val === 'true';
};

// ─── Prep Checklist ───────────────────────────────────────────────────────────

export const savePrepChecklist = async (
  checklist: Record<string, boolean>,
): Promise<void> => {
  await AsyncStorage.setItem(KEYS.PREP_CHECKLIST, JSON.stringify(checklist));
};

export const loadPrepChecklist = async (): Promise<Record<string, boolean>> => {
  const data = await AsyncStorage.getItem(KEYS.PREP_CHECKLIST);
  return data ? JSON.parse(data) : {};
};

// ─── Reset ────────────────────────────────────────────────────────────────────

export const clearAllData = async (): Promise<void> => {
  await AsyncStorage.multiRemove(Object.values(KEYS));
};

/** Wipes profile + onboarding + prep flags but keeps Setup complete so offline assets stay. */
export const clearOnboardingData = async (): Promise<void> => {
  await AsyncStorage.multiRemove([
    KEYS.USER_PROFILE,
    KEYS.ONBOARDING_COMPLETE,
    KEYS.PREP_CHECKLIST,
  ]);
};

// ─── Util ─────────────────────────────────────────────────────────────────────

function deepMerge(base: any, override: any): any {
  if (typeof base !== 'object' || base === null) return override ?? base;
  const result = { ...base };
  for (const key of Object.keys(base)) {
    if (
      key in override &&
      override[key] !== null &&
      override[key] !== undefined
    ) {
      if (typeof base[key] === 'object' && !Array.isArray(base[key])) {
        result[key] = deepMerge(base[key], override[key]);
      } else {
        result[key] = override[key];
      }
    }
  }
  return result;
}
