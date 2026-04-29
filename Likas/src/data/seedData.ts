import type {
  DisasterContext,
  EvacuationCenter,
  FirstAidTopic,
  PrepChecklistItem,
} from '../types';

export const defaultCoordinates = {
  latitude: 14.5995,
  longitude: 120.9842,
};

export const disasterActions: Record<DisasterContext, string> = {
  earthquake: 'DROP, COVER, AND HOLD ON!',
  typhoon: 'MOVE AWAY FROM FLOODWATER AND GO TO HIGHER GROUND.',
  volcano: 'WEAR A MASK OR WET CLOTH AND PREPARE TO EVACUATE.',
  prep: 'CHECK YOUR GO-BAG, WATER, MEDICINE, AND CONTACTS.',
};

export const contextualChips: Record<DisasterContext, string[]> = {
  earthquake: [
    'I am trapped',
    'After the shaking stops',
    'Check gas leaks',
    'Nearest open area',
  ],
  typhoon: [
    'Floodwater is rising',
    'Nearest evacuation center',
    'Power is out',
    'Protect documents',
  ],
  volcano: [
    'Ashfall outside',
    'Alert level 4',
    'Protect breathing',
    'Evacuate animals',
  ],
  prep: [
    'Go-bag checklist',
    'First-aid for burns',
    'Family meeting place',
    'Pet supplies',
  ],
};

export const evacuationCenters: EvacuationCenter[] = [
  {
    id: 'mnl-school-001',
    name: 'Manila Science High School Evacuation Center',
    address: 'Padre Faura St, Ermita, Manila',
    latitude: 14.5809,
    longitude: 120.9877,
    capacity: 1200,
    facilityType: 'School',
    disasterTypes: ['typhoon', 'flood', 'earthquake'],
    isPwdFriendly: true,
    isPetFriendly: false,
  },
  {
    id: 'mnl-sports-002',
    name: 'Rizal Memorial Sports Complex',
    address: 'Pablo Ocampo St, Malate, Manila',
    latitude: 14.5638,
    longitude: 120.9947,
    capacity: 3500,
    facilityType: 'Sports Complex',
    disasterTypes: ['typhoon', 'flood', 'earthquake'],
    isPwdFriendly: true,
    isPetFriendly: true,
  },
  {
    id: 'qc-hall-001',
    name: 'Quezon City Hall Covered Court',
    address: 'Elliptical Road, Diliman, Quezon City',
    latitude: 14.6507,
    longitude: 121.0494,
    capacity: 1800,
    facilityType: 'Barangay Hall',
    disasterTypes: ['typhoon', 'flood', 'volcano', 'earthquake'],
    isPwdFriendly: true,
    isPetFriendly: true,
  },
  {
    id: 'pasig-school-001',
    name: 'Pasig City Science High School',
    address: 'Rainforest Park, Maybunga, Pasig',
    latitude: 14.5732,
    longitude: 121.0959,
    capacity: 900,
    facilityType: 'School',
    disasterTypes: ['typhoon', 'flood'],
    isPwdFriendly: false,
    isPetFriendly: false,
  },
];

export const prepChecklist: PrepChecklistItem[] = [
  {id: 'water', category: 'goBag', label: '3-day drinking water supply'},
  {id: 'food', category: 'goBag', label: 'Ready-to-eat food'},
  {id: 'radio', category: 'goBag', label: 'Battery radio and flashlight'},
  {id: 'documents', category: 'goBag', label: 'Waterproof document copies'},
  {id: 'medicine', category: 'goBag', label: 'Maintenance medicines'},
  {
    id: 'infant-kit',
    category: 'goBag',
    label: 'Infant milk, diapers, and wipes',
    requiredFor: ['infants'],
  },
  {
    id: 'mobility-aid',
    category: 'goBag',
    label: 'Mobility aid and extra batteries',
    requiredFor: ['pwd', 'elderly'],
  },
  {id: 'gas-valve', category: 'homePrep', label: 'Know how to shut off gas'},
  {id: 'chargers', category: 'homePrep', label: 'Charge power banks'},
  {
    id: 'pet-food',
    category: 'petNeeds',
    label: 'Pet food, leash, carrier, and vaccination card',
    requiredFor: ['pets'],
  },
];

export const firstAidTopics: FirstAidTopic[] = [
  {
    id: 'bleeding',
    title: 'Severe Bleeding',
    authority: 'NDRRMC',
    steps: [
      'Apply firm direct pressure with clean cloth or gauze.',
      'Keep pressure steady and raise the injured area if possible.',
      'Do not remove soaked cloth; add another layer on top.',
      'Seek emergency medical help as soon as it is safe.',
    ],
  },
  {
    id: 'burns',
    title: 'Burns',
    authority: 'NDRRMC',
    steps: [
      'Cool the burn with clean running water for at least 20 minutes.',
      'Remove tight items near the burned area before swelling starts.',
      'Cover with clean non-stick dressing or cloth.',
      'Do not apply toothpaste, oil, or ice.',
    ],
  },
  {
    id: 'ashfall',
    title: 'Ashfall Breathing Protection',
    authority: 'PHIVOLCS',
    steps: [
      'Stay indoors and close windows and doors.',
      'Wear an N95 mask; use a damp cloth only if no mask is available.',
      'Avoid driving unless evacuation is ordered.',
      'Protect infants, elderly, and people with asthma first.',
    ],
  },
];
