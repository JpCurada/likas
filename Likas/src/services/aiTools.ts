import type {
  DisasterContext,
  EvacuationType,
  LatLng,
  UserProfile,
} from '../types';
import {evacuationService, getDistanceKm} from './evacuationService';
import {
  GraphNotLoadedError,
  NoRouteError,
  RouteTooLongError,
  routingService,
} from './routingService';
import {
  getHospitalGeoJSON,
  getEvacuationGeoJSON,
  getGymnasiumGeoJSON,
  getSchoolGeoJSON,
  getMultiPurposeGeoJSON,
  getCoveredCourtGeoJSON,
} from '../utils/geoUtils';

import earthquakeProtocol from '../../assets/protocols/earthquake.json';
import typhoonProtocol from '../../assets/protocols/typhoon.json';
import volcanoProtocol from '../../assets/protocols/volcano.json';

const PROTOCOLS: Record<string, any> = {
  earthquake: earthquakeProtocol,
  typhoon: typhoonProtocol,
  volcano: volcanoProtocol,
};

type ToolContext = {
  profile: UserProfile;
  activeContext: DisasterContext;
  /**
   * The user's CURRENT GPS position, when available. Tools that compute
   * "nearest X" prefer this over `profile.location.coordinates` so the
   * ranking reflects where the user is right now — not where they were
   * when they onboarded. Null when location permission is denied or no
   * fix has arrived yet; tools must fall back to the profile home in
   * that case.
   */
  liveLocation?: LatLng | null;
};

/** Returns the best origin to rank "nearest" results from. */
const resolveOrigin = (ctx: ToolContext): LatLng =>
  ctx.liveLocation ?? ctx.profile.location.coordinates;

export type ToolResult = {
  summary: string;
  /** Optional structured payload the UI can render as a card (route, list, etc). */
  payload?: unknown;
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, any>, ctx: ToolContext) => Promise<ToolResult>;
};

const POI_GETTERS: Record<string, () => any> = {
  hospital: getHospitalGeoJSON,
  evacuation_center: getEvacuationGeoJSON,
  gymnasium: getGymnasiumGeoJSON,
  school: getSchoolGeoJSON,
  multi_purpose_hall: getMultiPurposeGeoJSON,
  covered_court: getCoveredCourtGeoJSON,
};

const inferEvacuationType = (
  context: DisasterContext,
): EvacuationType | undefined => {
  if (context === 'earthquake') return 'earthquake';
  if (context === 'typhoon') return 'typhoon';
  if (context === 'volcano') return 'volcano';
  return undefined;
};

const routeToNearestEvacuation: ToolDefinition = {
  name: 'route_to_nearest_evacuation',
  description:
    'Rank the top 3 nearest evacuation centers for the user, considering distance, PWD/elderly access, and pet-friendliness. Use this when the user asks where to evacuate, where to go, or about the nearest shelter.',
  parameters: {
    type: 'object',
    properties: {
      profile_aware: {
        type: 'boolean',
        description:
          'When true, factor in the user profile (PWD, elderly, pets). Defaults to true.',
      },
    },
    required: [],
  },
  handler: async (_args, ctx) => {
    const type = inferEvacuationType(ctx.activeContext);
    const origin = resolveOrigin(ctx);
    const ranked = evacuationService.getRankedCenters({
      origin,
      profile: ctx.profile,
      type,
    });
    if (ranked.length === 0) {
      return {
        summary:
          'No evacuation centers found nearby. Contact your barangay or call NDRRMC at 911.',
      };
    }
    const lines = ranked
      .map(
        (r, i) =>
          `${i + 1}. ${r.center.name} — ${r.distanceKm.toFixed(1)} km (~${r.estimatedWalkMinutes} min walking)${r.isBestMatch ? ' [best match]' : ''}`,
      )
      .join('\n');

    // Try to compute a road-following route to the best match. Soft-fail to a
    // straight-line distance if the graph isn't installed or no path snaps.
    const best = ranked[0];
    const destination = {
      latitude: best.center.latitude,
      longitude: best.center.longitude,
    };
    let route = null;
    let routeNote = '';
    try {
      route = await routingService.route(origin, destination);
      routeNote = `\n\nRoute to ${best.center.name}: ${(route.distanceMeters / 1000).toFixed(2)} km along walkable roads, ~${route.durationMinutesWalking} min walking.`;
    } catch (err) {
      if (err instanceof GraphNotLoadedError) {
        routeNote =
          '\n\n(Road-following route unavailable — pedestrian map data not installed. The location is shown on the map.)';
      } else if (err instanceof RouteTooLongError) {
        routeNote =
          `\n\n(${best.center.name} is beyond walking-route range. Its location is shown on the map — move closer, then route again.)`;
      } else if (err instanceof NoRouteError) {
        routeNote =
          '\n\n(Could not find a walkable path to your location. The destination is shown on the map.)';
      }
    }

    return {
      summary: `Top evacuation options:\n${lines}${routeNote}`,
      payload: {
        kind: 'evacuation_ranking',
        centers: ranked,
        route: route
          ? {
              destinationName: best.center.name,
              destination,
              polyline: route.polyline,
              distanceMeters: route.distanceMeters,
              durationMinutesWalking: route.durationMinutesWalking,
            }
          : null,
      },
    };
  },
};

const getProtocol: ToolDefinition = {
  name: 'get_protocol',
  description:
    'Look up the official NDRRMC/PHIVOLCS/PAGASA protocol for a disaster type and phase. Use this for ANY safety-critical question. Quote the returned text verbatim — do not paraphrase.',
  parameters: {
    type: 'object',
    properties: {
      disaster: {
        type: 'string',
        enum: ['earthquake', 'typhoon', 'volcano'],
        description: 'The disaster type to look up.',
      },
      phase: {
        type: 'string',
        enum: ['before', 'during', 'after'],
        description:
          'The phase of the disaster: before (preparation), during (active event), after (recovery).',
      },
    },
    required: ['disaster', 'phase'],
  },
  handler: async args => {
    const disaster = String(args.disaster ?? '').toLowerCase();
    const phase = String(args.phase ?? '').toLowerCase();
    const protocol = PROTOCOLS[disaster];
    if (!protocol) {
      return {
        summary: `No protocol on file for "${disaster}". Contact NDRRMC at 911.`,
      };
    }
    const text = protocol.phases?.[phase];
    if (!text) {
      return {
        summary: `No "${phase}" phase recorded for ${disaster}. Contact NDRRMC at 911.`,
      };
    }
    return {
      summary: text,
      payload: {
        kind: 'protocol',
        disaster,
        phase,
        source: protocol.source,
        retrieved: protocol.retrieved,
        emergency_contact: protocol.emergency_contact,
      },
    };
  },
};

const findNearby: ToolDefinition = {
  name: 'find_nearby',
  description:
    'Find the 3 nearest places of interest in a category (hospital, evacuation center, school, gymnasium, multi_purpose_hall, covered_court).',
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: [
          'hospital',
          'evacuation_center',
          'gymnasium',
          'school',
          'multi_purpose_hall',
          'covered_court',
        ],
        description: 'The POI category to search.',
      },
    },
    required: ['category'],
  },
  handler: async (args, ctx) => {
    const category = String(args.category ?? '');
    const getter = POI_GETTERS[category];
    if (!getter) {
      return {summary: `Unknown category: ${category}.`};
    }
    const fc = getter();
    const origin = resolveOrigin(ctx);
    const sorted = fc.features
      .map((f: any) => ({
        name: f.properties?.name ?? 'Unnamed',
        address: f.properties?.address ?? '',
        distanceKm: getDistanceKm(origin, {
          latitude: f.geometry.coordinates[1],
          longitude: f.geometry.coordinates[0],
        }),
        coordinates: {
          latitude: f.geometry.coordinates[1],
          longitude: f.geometry.coordinates[0],
        },
      }))
      .sort((a: any, b: any) => a.distanceKm - b.distanceKm)
      .slice(0, 3);
    if (sorted.length === 0) {
      return {summary: `No ${category.replace('_', ' ')} found nearby.`};
    }
    const lines = sorted
      .map(
        (s: any, i: number) =>
          `${i + 1}. ${s.name} — ${s.distanceKm.toFixed(1)} km${s.address ? ` · ${s.address}` : ''}`,
      )
      .join('\n');
    return {
      summary: `Nearest ${category.replace('_', ' ')}:\n${lines}`,
      payload: {kind: 'nearby', category, results: sorted},
    };
  },
};

const getUserProfile: ToolDefinition = {
  name: 'get_user_profile',
  description:
    'Return a detailed view of the user profile beyond the summary in the system prompt: medical conditions, meeting points, emergency contacts, exact address, pet details. Use when the user asks about themselves ("what are my meds", "who are my contacts", "where is our meeting place") or when those details would meaningfully change your advice.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  handler: async (_args, ctx) => {
    const p = ctx.profile;
    const conditions = Object.entries(p.medicalConditions)
      .filter(
        ([key, val]) => key !== 'none' && key !== 'other' && val === true,
      )
      .map(([key]) => key);
    if (p.medicalConditions.other) conditions.push(p.medicalConditions.other);

    const pets = p.pets.hasPets
      ? Object.entries(p.pets)
          .filter(
            ([key, val]) =>
              key !== 'hasPets' &&
              typeof val === 'object' &&
              (val as any).count > 0,
          )
          .map(
            ([key, val]) =>
              `${(val as any).count} ${key} (${(val as any).size})`,
          )
      : [];

    const contacts = p.emergencyContacts
      .filter(c => c.name && c.phone)
      .map(c => `${c.name}${c.relationship ? ` — ${c.relationship}` : ''}: ${c.phone}`);

    const lines = [
      `Name: ${p.name || '(unset)'}`,
      `Age group: ${p.ageGroup || '(unset)'}`,
      `Companions: ${p.companions.infants} infants, ${p.companions.children} children, ${p.companions.elderly} elderly, ${p.companions.pwd} PWD`,
      `Pets: ${pets.length > 0 ? pets.join(', ') : 'none'}`,
      `Medical conditions: ${conditions.length > 0 ? conditions.join(', ') : 'none reported'}`,
      `Address: ${p.location.streetAddress || '(unset)'}, ${p.location.barangay}, ${p.location.city}`,
      `Primary meeting point: ${p.location.primaryMeeting?.landmark || '(unset)'}${p.location.primaryMeeting?.streetAddress ? ` — ${p.location.primaryMeeting.streetAddress}` : ''}${p.location.primaryMeeting?.notes ? ` (${p.location.primaryMeeting.notes})` : ''}`,
      `Secondary meeting point: ${p.location.secondaryMeeting?.landmark || '(unset)'}${p.location.secondaryMeeting?.streetAddress ? ` — ${p.location.secondaryMeeting.streetAddress}` : ''}`,
      `Emergency contacts: ${contacts.length > 0 ? contacts.join('; ') : 'none configured'}`,
    ];
    return {summary: lines.join('\n')};
  },
};

export const TOOL_REGISTRY: ToolDefinition[] = [
  routeToNearestEvacuation,
  getProtocol,
  findNearby,
  getUserProfile,
];

export const findTool = (name: string): ToolDefinition | undefined =>
  TOOL_REGISTRY.find(t => t.name === name);

export const describeToolsForPrompt = (): string =>
  TOOL_REGISTRY.map(
    t => `- ${t.name}: ${t.description} args=${JSON.stringify(t.parameters)}`,
  ).join('\n');
