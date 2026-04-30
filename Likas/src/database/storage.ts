import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Keys ────────────────────────────────────────────────────────────────────
const KEYS = {
  USER_PROFILE: 'likas_user_profile',
  ONBOARDING_COMPLETE: 'likas_onboarding_complete',
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Companion {
  infants: number;
  children: number;
  elderly: number;
  pwd: number;
}

export interface Pet {
  hasPets: boolean;
  dogs: number;
  cats: number;
  birds: number;
  others: number;
}

export interface MedicalCondition {
  asthma: boolean;
  diabetes: boolean;
  heartCondition: boolean;
  hypertension: boolean;
  none: boolean;
  other: string;
}

export interface Location {
  city: string;
  barangay: string;
  primaryMeetingPoint: string;
  secondaryMeetingPoint: string;
}

export interface EmergencyContact {
  name: string;
  phone: string;
}

export interface UserProfile {
  // Step 1
  name: string;
  ageGroup: 'Under 18' | '18-35' | '36-55' | '56+' | '';

  // Step 2
  companions: Companion;
  pets: Pet;

  // Step 3
  medicalConditions: MedicalCondition;

  // Step 4
  location: Location;

  // Step 5
  emergencyContacts: EmergencyContact[];
}

// ─── Default Profile ─────────────────────────────────────────────────────────

export const DEFAULT_PROFILE: UserProfile = {
  name: '',
  ageGroup: '',
  companions: { infants: 0, children: 0, elderly: 0, pwd: 0 },
  pets: { hasPets: false, dogs: 0, cats: 0, birds: 0, others: 0 },
  medicalConditions: {
    asthma: false,
    diabetes: false,
    heartCondition: false,
    hypertension: false,
    none: false,
    other: '',
  },
  location: {
    city: '',
    barangay: '',
    primaryMeetingPoint: '',
    secondaryMeetingPoint: '',
  },
  emergencyContacts: [
    { name: '', phone: '' },
    { name: '', phone: '' },
    { name: '', phone: '' },
  ],
};

// ─── Storage Functions ────────────────────────────────────────────────────────

export const saveProfile = async (profile: UserProfile): Promise<void> => {
  try {
    await AsyncStorage.setItem(KEYS.USER_PROFILE, JSON.stringify(profile));
  } catch (error) {
    console.error('Error saving profile:', error);
    throw error;
  }
};

export const loadProfile = async (): Promise<UserProfile | null> => {
  try {
    const data = await AsyncStorage.getItem(KEYS.USER_PROFILE);
    if (data) return JSON.parse(data) as UserProfile;
    return null;
  } catch (error) {
    console.error('Error loading profile:', error);
    return null;
  }
};

export const setOnboardingComplete = async (): Promise<void> => {
  await AsyncStorage.setItem(KEYS.ONBOARDING_COMPLETE, 'true');
};

export const isOnboardingComplete = async (): Promise<boolean> => {
  const val = await AsyncStorage.getItem(KEYS.ONBOARDING_COMPLETE);
  return val === 'true';
};

export const clearAllData = async (): Promise<void> => {
  await AsyncStorage.multiRemove(Object.values(KEYS));
};
