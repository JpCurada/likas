import {formatSOSMessage} from '../src/services/emergencyService';
import {evacuationService} from '../src/services/evacuationService';
import {defaultProfile} from '../src/stores/appStore';

describe('LIKAS domain services', () => {
  it('formats SOS messages with name, context, and coordinates', () => {
    const message = formatSOSMessage({
      location: {latitude: 14.59951, longitude: 120.98422},
      profile: {...defaultProfile, name: 'Maria'},
      disasterContext: 'typhoon',
    });

    expect(message).toContain('SOS');
    expect(message).toContain('Maria');
    expect(message).toContain('14.59951');
    expect(message).toContain('120.98422');
    expect(message).toContain('TYPHOON emergency');
  });

  it('prioritizes pet-friendly centers when the household has pets', () => {
    const rankings = evacuationService.getRankedCenters({
      origin: {latitude: 14.5995, longitude: 120.9842},
      profile: {
        ...defaultProfile,
        dependents: {
          ...defaultProfile.dependents,
          hasPets: true,
        },
      },
      type: 'typhoon',
    });

    expect(rankings[0].isBestMatch).toBe(true);
    expect(rankings[0].center.isPetFriendly).toBe(true);
  });
});
