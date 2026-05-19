export type DisasterContext = 'earthquake' | 'typhoon' | 'volcano' | 'prep';

/** Short label on a chat chip; `prompt` is the full text sent to the assistant. */
export type ChatPromptChip = {
  label: string;
  prompt: string;
};

export type AgeGroup = 'Under 18' | '18-35' | '36-55' | '56+' | '';

export type LatLng = {
  latitude: number;
  longitude: number;
};

export type Companion = {
  infants: number;
  children: number;
  elderly: number;
  pwd: number;
};

export type PetSize = 'Small' | 'Medium' | 'Large';

export type PetEntry = {
  count: number;
  size: PetSize;
};

export type Pet = {
  hasPets: boolean;
  dogs: PetEntry;
  cats: PetEntry;
  birds: PetEntry;
  rabbits: PetEntry;
  reptiles: PetEntry;
  others: PetEntry;
};

export type MedicalCondition = {
  asthma: boolean;
  diabetes: boolean;
  heartCondition: boolean;
  hypertension: boolean;
  epilepsy: boolean;
  kidneydisease: boolean;
  none: boolean;
  other: string;
};

export type MeetingPoint = {
  landmark: string;
  streetAddress: string;
  notes: string;
  /** Exact GPS coordinates pinned by the user on the map — null if not yet set */
  coordinates?: LatLng | null;
};

export type UserLocation = {
  city: string;
  barangay: string;
  streetAddress: string;
  coordinates: LatLng;
  primaryMeeting: MeetingPoint;
  secondaryMeeting: MeetingPoint;
};

export type EmergencyContact = {
  name: string;
  phone: string;
  relationship: string;
};

export type UserProfile = {
  name: string;
  ageGroup: AgeGroup;
  companions: Companion;
  pets: Pet;
  medicalConditions: MedicalCondition;
  location: UserLocation;
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

export type NearbyPin = {
  name: string;
  address: string;
  distanceKm: number;
  coordinates: LatLng;
};

export type ChatMessageAttachment =
  | {
      kind: 'route';
      destinationName: string;
      destination: LatLng;
      distanceMeters: number;
      durationMinutesWalking: number;
      polyline: LatLng[];
    }
  | {
      kind: 'nearby';
      category: string;
      label: string; // human-readable e.g. "hospitals"
      pins: NearbyPin[];
    };

export type ToolTraceEntry = {
  name: string;
  status: 'running' | 'done' | 'error';
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  attachment?: ChatMessageAttachment;
  toolTrace?: ToolTraceEntry[];
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
