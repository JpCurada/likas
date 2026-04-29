import {Linking} from 'react-native';
import type {DisasterContext, LatLng, UserProfile} from '../types';

export const formatSOSMessage = ({
  location,
  profile,
  disasterContext,
}: {
  location: LatLng;
  profile: UserProfile;
  disasterContext?: DisasterContext;
}) => {
  const context = disasterContext
    ? `${disasterContext.toUpperCase()} emergency`
    : 'emergency';

  return `SOS! I am at ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(
    5,
  )}. ${profile.name || 'A LIKAS user'} needs help. ${context}.`;
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
      .map(contact => contact.phone)
      .filter(Boolean)
      .join(',');
    const smsUrl = `sms:${recipients}?body=${encodeURIComponent(message)}`;

    await Linking.openURL(smsUrl);
  },
};
