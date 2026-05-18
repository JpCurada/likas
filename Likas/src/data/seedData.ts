import type {
  ChatPromptChip,
  DisasterContext,
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

/**
 * Quick-prompt chips for the chat UI: `label` is shown on the chip; `prompt` is sent as the user message.
 * Wording asks for general guidance users should still verify with local authorities (NDRRMC, PAGASA, PHIVOLCS).
 */
export const chatPromptChipsByContext: Record<DisasterContext, ChatPromptChip[]> = {
  earthquake: [
    {
      label: 'During shaking',
      prompt:
        'What should I do during an earthquake while indoors? Explain DROP, COVER, AND HOLD ON in clear steps.',
    },
    {
      label: 'After shaking stops',
      prompt:
        'Right after an earthquake stops, what should I check before moving around? Include injuries, structure, gas, and aftershocks.',
    },
    {
      label: 'Nearest evacuation',
      prompt: "How do I find the nearest evacuation center from where I am, and when should I go there?",
    },
    {
      label: 'If trapped',
      prompt:
        'If I think I am trapped after an earthquake, what should I do while waiting for rescue? Focus on signaling, air, and staying calm.',
    },
    {
      label: 'Tsunami / coast',
      prompt:
        'If I am near the coast after a strong earthquake, what tsunami preparedness steps should I follow until authorities clear the area?',
    },
    {
      label: 'Severe bleeding',
      prompt:
        'First aid for severe bleeding: what to do first while waiting for help? Keep it concise and aligned with official first-aid guidance.',
    },
  ],
  typhoon: [
    {
      label: 'Before landfall',
      prompt:
        'Typhoon preparedness: what should I do at home before strong winds and heavy rain (windows, roof items, documents, charging devices)?',
    },
    {
      label: 'Floodwater safety',
      prompt:
        'Why should I avoid walking or driving through floodwater, and what are safer options if I must move?',
    },
    {
      label: 'Nearest evacuation',
      prompt: "When should I go to an evacuation center in a typhoon, and how do I find the nearest one?",
    },
    {
      label: 'Power / water outage',
      prompt:
        'Practical tips for a typhoon-related power outage: water, food, medicines, and communication.',
    },
    {
      label: 'Documents & cash',
      prompt:
        'How should I protect important documents and cash in case we need to evacuate during a typhoon?',
    },
    {
      label: 'Storm surge basics',
      prompt:
        'Explain storm surge risk in simple terms and what coastal residents should watch for during a typhoon.',
    },
  ],
  volcano: [
    {
      label: 'Ashfall & breathing',
      prompt:
        'During volcanic ashfall, how should I protect breathing indoors and outdoors? Mention masks versus damp cloth if no mask.',
    },
    {
      label: 'Follow alerts',
      prompt:
        'Why is it important to follow PHIVOLCS alert levels and local evacuation orders, and where should I get updates offline if possible?',
    },
    {
      label: 'Protect water & roof',
      prompt:
        'How can I protect drinking water and roof gutters from volcanic ash until conditions improve?',
    },
    {
      label: 'Nearest evacuation',
      prompt: 'How do I find the nearest evacuation center if volcanic activity worsens and authorities ask us to move?',
    },
    {
      label: 'Pets & livestock',
      prompt:
        'Quick tips for pets or small livestock during ashfall and evacuation: shelter, water, and carriers.',
    },
    {
      label: 'Driving in ash',
      prompt:
        'Should I drive during heavy ashfall? Give practical guidance for visibility and vehicle damage.',
    },
  ],
  prep: [
    {
      label: 'Go bag essentials',
      prompt:
        'What should go in a 72-hour go bag for a family in the Philippines? List categories: water, food, first aid, documents, tools.',
    },
    {
      label: 'Family meet-up plan',
      prompt:
        'How do I make a family communication and meeting point plan if phones fail during a disaster?',
    },
    {
      label: 'First aid for burns',
      prompt:
        'What are the basic first-aid steps for minor to moderate burns? Say what not to put on burns.',
    },
    {
      label: 'Documents waterproof',
      prompt:
        'How should I store copies of IDs, land titles, and medical info so they survive floods or evacuation?',
    },
    {
      label: 'Nearest evacuation',
      prompt: "How can I find evacuation centers near me and save their locations offline in the app?",
    },
    {
      label: 'Pet emergency kit',
      prompt:
        'What should I pack for dogs or cats in an emergency evacuation (food, leash, meds, vaccination records)?',
    },
  ],
};

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
