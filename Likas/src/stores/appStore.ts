import {create} from 'zustand';
import {defaultCoordinates} from '../data/seedData';
import type {ChatMessage, DisasterContext, UserProfile} from '../types';

export const defaultProfile: UserProfile = {
  name: '',
  ageGroup: 'adult',
  dependents: {
    infants: 0,
    children: 0,
    elderly: 0,
    pwd: 0,
    hasPets: false,
    petDetails: '',
  },
  healthConditions: [],
  location: {
    city: 'Manila',
    barangay: 'Ermita',
    coordinates: defaultCoordinates,
  },
  meetingPoints: {
    primary: '',
    secondary: '',
  },
  emergencyContacts: [
    {id: 'primary', name: '', phone: ''},
    {id: 'secondary', name: '', phone: ''},
    {id: 'backup', name: '', phone: ''},
  ],
};

type AppState = {
  activeContext: DisasterContext;
  profile: UserProfile;
  hasCompletedOnboarding: boolean;
  packedItems: Record<string, boolean>;
  chatMessages: ChatMessage[];
  setActiveContext: (context: DisasterContext) => void;
  updateProfile: (profile: UserProfile) => void;
  completeOnboarding: () => void;
  togglePackedItem: (itemId: string) => void;
  addChatMessage: (message: ChatMessage) => void;
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
}));
