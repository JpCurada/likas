import {contextualChips, disasterActions} from '../data/seedData';
import type {ChatMessage, DisasterContext, EvacuationRanking} from '../types';

const scopeMessage =
  'LIKAS is specialized for disaster preparedness and emergency response. Ask about evacuation, first aid, typhoons, earthquakes, volcanoes, or go-bag preparation.';

const disasterKeywords = [
  'ash',
  'bag',
  'bleed',
  'burn',
  'baha',
  'earthquake',
  'evac',
  'flood',
  'lindol',
  'quake',
  'trapped',
  'typhoon',
  'ulan',
  'volcano',
  'bagyo',
  'sugat',
  'abo',
];

export const aiAssistantService = {
  initialize: async () => {
    // The native LiteRT-LM JSI module will be loaded here when model assets exist.
    return Promise.resolve();
  },

  getImmediateAction: (context: DisasterContext) => disasterActions[context],

  getContextualChips: (context: DisasterContext) => contextualChips[context],

  createOfflineResponse: (params: {
    userMessage: string;
    context: DisasterContext;
    nearestCenters: EvacuationRanking[];
    conversationHistory: ChatMessage[];
  }) => {
    const normalized = params.userMessage.toLowerCase();
    const isInScope = disasterKeywords.some(keyword =>
      normalized.includes(keyword),
    );

    if (!isInScope && params.conversationHistory.length > 1) {
      return scopeMessage;
    }

    if (normalized.includes('trapped') || normalized.includes('naipit')) {
      return 'NDRRMC guidance: stay calm, cover your mouth with cloth, avoid unnecessary movement, tap on a pipe or wall, and shout only when rescuers are nearby to conserve energy.';
    }

    if (normalized.includes('bleed') || normalized.includes('sugat')) {
      return 'NDRRMC first aid: apply firm direct pressure with clean cloth, keep pressure steady, add layers if blood soaks through, and seek emergency care when safe.';
    }

    if (
      normalized.includes('evac') ||
      normalized.includes('center') ||
      normalized.includes('shelter')
    ) {
      const bestCenter = params.nearestCenters[0];

      if (!bestCenter) {
        return 'NDRRMC guidance: move to a designated evacuation center announced by your barangay. If unavailable, choose a sturdy elevated building away from floodwater, glass, and power lines.';
      }

      return `NDRRMC guidance: your best local option is ${bestCenter.center.name}, about ${bestCenter.distanceKm.toFixed(
        1,
      )} km away or ${bestCenter.estimatedWalkMinutes} minutes on foot. ${bestCenter.isBestMatch ? 'It is marked as your best match for your household needs.' : ''}`;
    }

    if (params.context === 'earthquake') {
      return 'PHIVOLCS and NDRRMC guidance: DROP, COVER, AND HOLD ON. After shaking stops, check injuries, avoid elevators, watch for aftershocks, and move away from damaged structures.';
    }

    if (params.context === 'volcano') {
      return 'PHIVOLCS guidance: protect your breathing with an N95 mask or damp cloth, keep ash out of water and food, and follow mandatory evacuation orders at Alert Levels 4 and 5.';
    }

    if (params.context === 'typhoon') {
      return 'PAGASA and NDRRMC guidance: avoid floodwater, unplug appliances if water enters, keep documents dry, and evacuate early if your barangay is under flood or storm-surge warning.';
    }

    return 'NDRRMC guidance: prepare water, food, flashlight, radio, medicines, documents, and family meeting points. Keep the kit reachable and review it with everyone at home.';
  },
};
