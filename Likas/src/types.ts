export type DisasterContext = 'earthquake' | 'typhoon' | 'volcano' | 'prep';

export type AgeGroup = 'adult' | 'senior' | 'minor';

export type LatLng = {
  latitude: number;
  longitude: number;
};

export type Dependents = {
  infants: number;
  children: number;
  elderly: number;
  pwd: number;
  hasPets: boolean;
  petDetails: string;
};

export type MeetingPoints = {
  primary: string;
  secondary: string;
};

export type LocationPreference = {
  city: string;
  barangay: string;
  coordinates: LatLng;
};

export type EmergencyContact = {
  id: string;
  name: string;
  phone: string;
};

export type UserProfile = {
  name: string;
  ageGroup: AgeGroup;
  dependents: Dependents;
  healthConditions: string[];
  location: LocationPreference;
  meetingPoints: MeetingPoints;
  emergencyContacts: EmergencyContact[];
};

export type EvacuationType = 'typhoon' | 'flood' | 'volcano' | 'earthquake';

export type EvacuationCenter = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  capacity: number;
  facilityType: string;
  disasterTypes: EvacuationType[];
  isPwdFriendly: boolean;
  isPetFriendly: boolean;
};

export type EvacuationRanking = {
  center: EvacuationCenter;
  distanceKm: number;
  estimatedWalkMinutes: number;
  score: number;
  isBestMatch: boolean;
  warnings: string[];
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

export type PrepChecklistItem = {
  id: string;
  category: 'goBag' | 'homePrep' | 'petNeeds';
  label: string;
  requiredFor?: Array<'infants' | 'elderly' | 'pwd' | 'pets'>;
};

export type FirstAidTopic = {
  id: string;
  title: string;
  authority: 'NDRRMC' | 'PHIVOLCS' | 'PAGASA';
  steps: string[];
};
