import {formatSOSMessage} from '../src/services/emergencyService';
import {evacuationService} from '../src/services/evacuationService';
import {defaultProfile} from '../src/stores/appStore';

describe('LIKAS domain services', () => {
  it('formats SOS messages with name, context, coordinates, and map link', () => {
    const message = formatSOSMessage({
      location: {latitude: 14.59951, longitude: 120.98422},
      profile: {...defaultProfile, name: 'Maria'},
      disasterContext: 'typhoon',
      at: new Date('2024-06-15T06:30:00.000Z'),
    });

    expect(message).toContain('[LIKAS] SOS');
    expect(message).toContain('Maria');
    expect(message).toContain('14.59951');
    expect(message).toContain('120.98422');
    expect(message).toMatch(/typhoon/i);
    expect(message).toContain('google.com/maps');
  });

  it('prioritizes pet-friendly centers when the household has pets', () => {
    const rankings = evacuationService.getRankedCenters({
      origin: {latitude: 14.5995, longitude: 120.9842},
      profile: {
        ...defaultProfile,
        pets: {
          ...defaultProfile.pets,
          hasPets: true,
        },
      },
      type: 'typhoon',
    });

    expect(rankings[0].isBestMatch).toBe(true);
    expect(rankings[0].center.isPetFriendly).toBe(true);
  });
});
