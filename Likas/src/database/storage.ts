import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  USER_PROFILE: 'likas_user_profile',
  ONBOARDING_COMPLETE: 'likas_onboarding_complete',
  PREP_CHECKLIST: 'likas_prep_checklist',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Companion {
  infants: number;
  children: number;
  elderly: number;
  pwd: number;
}

export type PetSize = 'Small' | 'Medium' | 'Large';

export interface PetEntry {
  count: number;
  size: PetSize;
}

export interface Pet {
  hasPets: boolean;
  dogs: PetEntry;
  cats: PetEntry;
  birds: PetEntry;
  rabbits: PetEntry;
  reptiles: PetEntry;
  others: PetEntry;
}

export interface MedicalCondition {
  asthma: boolean;
  diabetes: boolean;
  heartCondition: boolean;
  hypertension: boolean;
  epilepsy: boolean;
  kidneydisease: boolean;
  none: boolean;
  other: string;
}

export interface MeetingPoint {
  landmark: string; // e.g. "Basketball Court"
  streetAddress: string; // e.g. "Rizal St., Brgy. Commonwealth"
  notes: string; // e.g. "Near the sari-sari store with red roof"
}

export interface Location {
  city: string;
  barangay: string;
  streetAddress: string; // user's home address
  primaryMeeting: MeetingPoint;
  secondaryMeeting: MeetingPoint;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export interface UserProfile {
  name: string;
  ageGroup: 'Under 18' | '18-35' | '36-55' | '56+' | '';
  companions: Companion;
  pets: Pet;
  medicalConditions: MedicalCondition;
  location: Location;
  emergencyContacts: EmergencyContact[];
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_PET_ENTRY: PetEntry = { count: 0, size: 'Medium' };

const DEFAULT_MEETING: MeetingPoint = {
  landmark: '',
  streetAddress: '',
  notes: '',
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
