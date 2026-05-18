/**
 * Copy for Geolocation errors — works with @react-native-community/geolocation
 * PositionError codes: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT.
 */

export type GeolocationIssueCode =
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'
  | 'unknown';

export type GeolocationUserIssue = {
  code: GeolocationIssueCode;
  title: string;
  message: string;
};

/** Shown in the Android permission system dialog. */
export const ANDROID_LOCATION_PERMISSION_MESSAGE =
  'LIKAS uses your location on-device with downloaded map tiles to show where you are, find nearby shelters and hospitals, and trace walking routes. Your location is not sent to our servers.';

export function geolocationIssueFromError(
  code: number,
  nativeMessage?: string,
): GeolocationUserIssue {
  switch (code) {
    case 1:
      return {
        code: 'permission_denied',
        title: 'Location off',
        message:
          'Allow location so the offline map can show your position and unlock nearby places, evacuations, and routes.',
      };
    case 2:
      return {
        code: 'position_unavailable',
        title: 'GPS unavailable',
        message:
          'Turn on Location (GPS) in system settings, then try again.',
      };
    case 3:
      return {
        code: 'timeout',
        title: 'Location slow',
        message:
          'No position yet. Move near a window or outside, wait a few seconds, then try again.',
      };
    default:
      return {
        code: 'unknown',
        title: 'Location error',
        message:
          nativeMessage?.trim() ||
          'Could not read your position. Try again in a moment.',
      };
  }
}
