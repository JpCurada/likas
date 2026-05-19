import {Linking} from 'react-native';
import type {
  Companion,
  DisasterContext,
  LatLng,
  MedicalCondition,
  Pet,
  UserProfile,
} from '../types';

const MAX_MED_TERMS = 4;
const MAX_OTHER_NOTE = 36;

const MED_ORDER: (keyof MedicalCondition)[] = [
  'asthma',
  'diabetes',
  'heartCondition',
  'hypertension',
  'epilepsy',
  'kidneydisease',
];

const medShort = (k: keyof MedicalCondition): string => {
  switch (k) {
    case 'heartCondition':
      return 'heart condition';
    case 'kidneydisease':
      return 'kidney disease';
    default:
      return k;
  }
};

function summarizeMedical(m: MedicalCondition): string | null {
  if (m.none) {
    return null;
  }
  const parts: string[] = [];
  for (const key of MED_ORDER) {
    if (m[key] === true) {
      parts.push(medShort(key));
    }
  }
  const other = typeof m.other === 'string' ? m.other.trim() : '';
  if (other) {
    parts.push(
      other.length > MAX_OTHER_NOTE
        ? `${other.slice(0, MAX_OTHER_NOTE)}…`
        : other,
    );
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.slice(0, MAX_MED_TERMS).join(', ');
}

function companionSummary(c: Companion): string | null {
  const bits: string[] = [];
  if (c.infants > 0) {
    bits.push(`${c.infants} infant${c.infants > 1 ? 's' : ''}`);
  }
  if (c.children > 0) {
    bits.push(`${c.children} child${c.children > 1 ? 'ren' : ''}`);
  }
  if (c.elderly > 0) {
    bits.push(`${c.elderly} elder${c.elderly > 1 ? 's' : ''}`);
  }
  if (c.pwd > 0) {
    bits.push(`${c.pwd} PWD`);
  }
  return bits.length > 0 ? bits.join(', ') : null;
}

function petCount(pets: Pet): number {
  return (
    pets.dogs.count +
    pets.cats.count +
    pets.birds.count +
    pets.rabbits.count +
    pets.reptiles.count +
    pets.others.count
  );
}

function situationLine(disasterContext?: DisasterContext): string {
  if (!disasterContext || disasterContext === 'prep') {
    return 'General emergency — need help.';
  }
  const labels: Record<Exclude<DisasterContext, 'prep'>, string> = {
    earthquake: 'Earthquake / structural emergency — need help.',
    typhoon: 'Typhoon / flood-related emergency — need help.',
    volcano: 'Volcanic ashfall / eruption risk — need help.',
  };
  return labels[disasterContext];
}

function mapsLink(location: LatLng): string {
  const q = `${location.latitude},${location.longitude}`;
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}`;
}

function formatSentAt(at: Date): string {
  try {
    return at.toLocaleString('en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return at.toISOString();
  }
}

/**
 * Builds a structured SMS body for emergency contacts (user still taps Send).
 * Uses profile + GPS so responders get location, map link, and critical household clues.
 */
export const formatSOSMessage = ({
  location,
  profile,
  disasterContext,
  at = new Date(),
}: {
  location: LatLng;
  profile: UserProfile;
  disasterContext?: DisasterContext;
  at?: Date;
}) => {
  const displayName = profile.name?.trim() || 'LIKAS user';
  const gps = `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
  const barangayCity = [profile.location.barangay, profile.location.city]
    .map(s => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .join(', ');

  const street = profile.location.streetAddress?.trim();
  const meetingLandmark = profile.location.primaryMeeting?.landmark?.trim();
  const meetingNotes = profile.location.primaryMeeting?.notes?.trim();
  const meetingParts = [meetingLandmark, meetingNotes]
    .filter(Boolean)
    .join(' — ');
  const meetingLine = meetingParts ? `Meeting plan: ${meetingParts}.` : null;

  const ageFrag =
    profile.ageGroup && profile.ageGroup.length > 0
      ? ` (age band: ${profile.ageGroup})`
      : '';

  const lines: string[] = [
    '[LIKAS] SOS',
    situationLine(disasterContext),
    `Sent: ${formatSentAt(at)}`,
    `Name: ${displayName}${ageFrag}`,
    '',
    barangayCity ? `Area: ${barangayCity}` : `Area: (see GPS below)`,
  ];

  if (street) {
    lines.push(`Street: ${street}`);
  }

  lines.push(`GPS: ${gps}`);
  lines.push(`Map: ${mapsLink(location)}`);

  if (meetingLine) {
    lines.push('');
    lines.push(meetingLine);
  }

  const companions = companionSummary(profile.companions);
  const med = summarizeMedical(profile.medicalConditions);
  const petLine =
    profile.pets.hasPets && petCount(profile.pets) > 0
      ? `${petCount(profile.pets)} pet(s) with me`
      : profile.pets.hasPets
        ? 'Has pets with me'
        : null;

  const contextBits = [companions ? `With me: ${companions}` : null, med ? `Medical: ${med}` : null, petLine]
    .filter(Boolean) as string[];

  if (contextBits.length > 0) {
    lines.push('');
    lines.push(contextBits.join(' | '));
  }

  lines.push('');
  lines.push('Auto-drafted from LIKAS — not sent until I press Send. Please help or send responders.');

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

export const emergencyService = {
  triggerSOS: async ({
    location,
    profile,
    disasterContext,
  }: {
    location: LatLng;
    profile: UserProfile;
    disasterContext?: DisasterContext;
  }) => {
    const message = formatSOSMessage({location, profile, disasterContext});
    const recipients = profile.emergencyContacts
      .map(contact => contact.phone.replace(/\s/g, ''))
      .filter(Boolean)
      .join(',');
    if (!recipients) {
      throw new Error('No emergency contact phone numbers');
    }
    const smsUrl = `sms:${recipients}?body=${encodeURIComponent(message)}`;
    await Linking.openURL(smsUrl);
  },
};
