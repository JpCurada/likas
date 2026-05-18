import { COLORS } from '../theme';

export interface DisasterItem {
  icon: string;
  title: string;
  desc: string;
}

export interface DisasterPhase {
  phase: string;
  color: string;
  items: DisasterItem[];
}

export const EARTHQUAKE_STEPS: DisasterPhase[] = [
  {
    phase: 'DURING',
    color: COLORS.error,
    items: [
      {
        icon: 'arrow-down-bold-circle-outline',
        title: 'DROP, COVER, HOLD ON',
        desc: 'Drop to hands and knees. Take cover under a sturdy table or desk. Hold on until shaking stops.',
      },
      {
        icon: 'cancel',
        title: 'Do NOT run outside',
        desc: 'Most injuries happen when people try to move or run during shaking. Stay where you are.',
      },
      {
        icon: 'window-closed-variant',
        title: 'Away from windows',
        desc: 'Move away from glass, windows, outside doors, and walls that could shatter.',
      },
      {
        icon: 'bed-empty',
        title: 'If in bed',
        desc: 'Stay there. Hold on and protect your head with a pillow. Rolling to the floor can cause injury.',
      },
    ],
  },
  {
    phase: 'AFTER',
    color: COLORS.blue,
    items: [
      {
        icon: 'fire',
        title: 'Check for fires',
        desc: 'Check for gas leaks. If you smell gas, open windows, leave the building, and do not use electrical switches.',
      },
      {
        icon: 'stethoscope',
        title: 'Check for injuries',
        desc: 'Do not move seriously injured persons unless in immediate danger. Apply first aid.',
      },
      {
        icon: 'radio',
        title: 'Listen for updates',
        desc: 'Use a battery-powered radio for official PHIVOLCS/NDRRMC updates.',
      },
      {
        icon: 'home-outline',
        title: 'Inspect your home',
        desc: 'Check for structural damage before re-entering. Watch for aftershocks.',
      },
    ],
  },
  {
    phase: 'EVACUATE IF',
    color: '#7c3aed',
    items: [
      {
        icon: 'water-alert-outline',
        title: 'Near the coast',
        desc: 'Move to high ground immediately — tsunami waves can arrive within minutes of a strong quake.',
      },
      {
        icon: 'home-off-outline',
        title: 'Building is damaged',
        desc: 'Leave if you see cracks in walls, tilting floors, or smell gas.',
      },
      {
        icon: 'fire-alert',
        title: 'Fire breaks out',
        desc: 'Evacuate immediately using stairs. Do not use elevators.',
      },
    ],
  },
];

export const TYPHOON_STEPS: DisasterPhase[] = [
  {
    phase: 'BEFORE',
    color: COLORS.blue,
    items: [
      {
        icon: 'bag-personal',
        title: 'Prepare your Go-Bag',
        desc: 'Pack food, water (3-day supply), medicines, important documents, flashlight, and cash.',
      },
      {
        icon: 'cellphone',
        title: 'Charge all devices',
        desc: 'Charge phones, power banks, and radios. Save NDRRMC and LGU numbers.',
      },
      {
        icon: 'home',
        title: 'Secure your home',
        desc: 'Board up windows, clear drains, bring loose outdoor items inside.',
      },
      {
        icon: 'antenna',
        title: 'Monitor PAGASA alerts',
        desc: 'Signal No. 3+ means evacuate low-lying areas, coastal zones, and unstable slopes.',
      },
    ],
  },
  {
    phase: 'DURING',
    color: COLORS.error,
    items: [
      {
        icon: 'home',
        title: 'Stay indoors',
        desc: 'Stay in the strongest part of your home. Avoid upper floors if the roof is weak.',
      },
      {
        icon: 'door',
        title: 'Away from windows',
        desc: 'Strong winds can shatter glass. Move to interior rooms.',
      },
      {
        icon: 'water-alert',
        title: 'Watch for flooding',
        desc: 'If water rises rapidly, move to upper floors. Do NOT wait to evacuate if warned.',
      },
      {
        icon: 'lightning-bolt',
        title: 'Avoid floodwater',
        desc: '6 inches of water can knock you off your feet. Never walk in flowing floodwater.',
      },
    ],
  },
  {
    phase: 'EVACUATE IF',
    color: '#7c3aed',
    items: [
      {
        icon: 'image-filter-hdr',
        title: 'Near slopes or mountains',
        desc: 'Landslide risk is high during heavy rain. Leave early — do not wait for the signal.',
      },
      {
        icon: 'waves',
        title: 'In a flood-prone area',
        desc: 'If you live in a low-lying or coastal barangay, pre-emptive evacuation saves lives.',
      },
      {
        icon: 'bullhorn-outline',
        title: 'LGU orders evacuation',
        desc: 'Obey barangay evacuation orders immediately. Your life is worth more than your property.',
      },
    ],
  },
];
