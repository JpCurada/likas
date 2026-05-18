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
  /**
   * Set when a chat-driven tool produces a route or pins, so MapScreen can
   * auto-present the map (snap the chat sheet to its half-screen point) the
   * moment the result lands. Consumed and cleared by MapScreen.
   */
  pendingMapFocus: 'route' | 'nearby' | null;
  /** The fully processed MapLibre style object — set by MapScreen on first init. */
  offlineMapStyle: any | null;
  /**
   * Live GPS position from MapScreen's watcher. Null until permissions are
   * granted and the first fix arrives. AI tools (find_nearby /
   * route_to_nearest_evacuation) prefer this over the onboarded home
   * coordinates so "nearest X" reflects where the user actually is right
   * now, not where they registered the app.
   */
  liveLocation: LatLng | null;
  setActiveContext: (context: DisasterContext) => void;
  updateProfile: (profile: UserProfile) => void;
  /** Clears in-memory session state when redoing onboarding (keeps offline map style). */
  resetForOnboarding: () => void;
  completeOnboarding: () => void;
  togglePackedItem: (itemId: string) => void;
  addChatMessage: (message: ChatMessage) => void;
  setActiveRoute: (route: ActiveRoute | null) => void;
  setNearbyPins: (pins: NearbyPin[]) => void;
  setPendingMapFocus: (focus: 'route' | 'nearby' | null) => void;
  setOfflineMapStyle: (style: any) => void;
  setLiveLocation: (loc: LatLng | null) => void;
};

const WELCOME_CHAT_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'I am LIKAS, your offline disaster guide. Choose a context or ask about evacuation, first aid, earthquakes, typhoons, or volcanoes.',
};

export const useAppStore = create<AppState>(set => ({
  activeContext: 'prep',
  profile: defaultProfile,
  hasCompletedOnboarding: false,
  packedItems: {},
  chatMessages: [WELCOME_CHAT_MESSAGE],
  setActiveContext: context => set({activeContext: context}),
  updateProfile: profile => set({profile}),
  resetForOnboarding: () =>
    set(state => ({
      activeContext: 'prep',
      profile: defaultProfile,
      hasCompletedOnboarding: false,
      packedItems: {},
      chatMessages: [WELCOME_CHAT_MESSAGE],
      activeRoute: null,
      nearbyPins: [],
      pendingMapFocus: null,
      liveLocation: null,
      offlineMapStyle: state.offlineMapStyle,
    })),
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
  pendingMapFocus: null,
  offlineMapStyle: null,
  liveLocation: null,
  setActiveRoute: route => set({activeRoute: route, nearbyPins: []}),
  setNearbyPins: pins => set({nearbyPins: pins, activeRoute: null}),
  setPendingMapFocus: focus => set({pendingMapFocus: focus}),
  setOfflineMapStyle: style => set({offlineMapStyle: style}),
  setLiveLocation: loc => set({liveLocation: loc}),
}));
