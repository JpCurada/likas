import {create} from 'zustand';
import {defaultCoordinates} from '../data/seedData';
import type {
  ChatMessage,
  DisasterContext,
  LatLng,
  MeetingPoint,
  NearbyPin,
  PetEntry,
  UserProfile,
} from '../types';

export type ActiveRoute = {
  destinationName: string;
  destination: LatLng;
  polyline: LatLng[];
  distanceMeters: number;
  durationMinutesWalking: number;
};

// Mirrors DEFAULT_PROFILE in src/database/storage.ts. Kept local here so
// importing this store in test environments doesn't pull AsyncStorage in.
const EMPTY_PET: PetEntry = {count: 0, size: 'Medium'};
const EMPTY_MEETING: MeetingPoint = {
  landmark: '',
  streetAddress: '',
  notes: '',
};

export const defaultProfile: UserProfile = {
  name: '',
  ageGroup: '',
  companions: {infants: 0, children: 0, elderly: 0, pwd: 0},
  pets: {
    hasPets: false,
    dogs: {...EMPTY_PET},
    cats: {...EMPTY_PET},
    birds: {...EMPTY_PET},
    rabbits: {...EMPTY_PET},
    reptiles: {...EMPTY_PET},
    others: {...EMPTY_PET},
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
    primaryMeeting: {...EMPTY_MEETING},
    secondaryMeeting: {...EMPTY_MEETING},
  },
  emergencyContacts: [
    {name: '', phone: '', relationship: ''},
    {name: '', phone: '', relationship: ''},
    {name: '', phone: '', relationship: ''},
  ],
};

type AppState = {
  activeContext: DisasterContext;
  profile: UserProfile;
  hasCompletedOnboarding: boolean;
  packedItems: Record<string, boolean>;
  chatMessages: ChatMessage[];
  activeRoute: ActiveRoute | null;
  nearbyPins: NearbyPin[];
  /** The fully processed MapLibre style object — set by MapScreen on first init. */
  offlineMapStyle: any | null;
  setActiveContext: (context: DisasterContext) => void;
  updateProfile: (profile: UserProfile) => void;
  completeOnboarding: () => void;
  togglePackedItem: (itemId: string) => void;
  addChatMessage: (message: ChatMessage) => void;
  setActiveRoute: (route: ActiveRoute | null) => void;
  setNearbyPins: (pins: NearbyPin[]) => void;
  setOfflineMapStyle: (style: any) => void;
};

export const useAppStore = create<AppState>(set => ({
  activeContext: 'prep',
  profile: defaultProfile,
  hasCompletedOnboarding: false,
  packedItems: {},
  chatMessages: [
    {
      id: 'welcome',
      role: 'assistant',
      text: 'I am LIKAS, your offline disaster guide. Choose a context or ask about evacuation, first aid, earthquakes, typhoons, or volcanoes.',
    },
  ],
  setActiveContext: context => set({activeContext: context}),
  updateProfile: profile => set({profile}),
  completeOnboarding: () => set({hasCompletedOnboarding: true}),
  togglePackedItem: itemId =>
    set(state => ({
      packedItems: {
        ...state.packedItems,
        [itemId]: !state.packedItems[itemId],
      },
    })),
  addChatMessage: message =>
    set(state => ({chatMessages: [...state.chatMessages, message]})),
  activeRoute: null,
  nearbyPins: [],
  offlineMapStyle: null,
  setActiveRoute: route => set({activeRoute: route, nearbyPins: []}),
  setNearbyPins: pins => set({nearbyPins: pins, activeRoute: null}),
  setOfflineMapStyle: style => set({offlineMapStyle: style}),
}));
