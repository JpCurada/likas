import {queryNearbyEvacuationCenters} from '../utils/geoUtils';
import type {
  EvacuationRanking,
  EvacuationType,
  LatLng,
  UserProfile,
} from '../types';

const walkingKph = 4.2;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export const getDistanceKm = (from: LatLng, to: LatLng) => {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(to.latitude - from.latitude);
  const lonDelta = toRadians(to.longitude - from.longitude);
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);

  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(lonDelta / 2) *
      Math.sin(lonDelta / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const evacuationService = {
  getRankedCenters: ({
    origin,
    profile,
    type,
  }: {
    origin: LatLng;
    profile: UserProfile;
    type?: EvacuationType;
  }): EvacuationRanking[] => {
    const profileNeedsPwd =
      profile.companions.pwd > 0 || profile.companions.elderly > 0;
    // Grid-indexed spatial prefilter: scan only shelters near the origin
    // instead of the full nationwide set, then rank precisely below.
    const evacuationCenters = queryNearbyEvacuationCenters(
      origin.latitude,
      origin.longitude,
    );
    const maxCapacity = Math.max(
      1,
      ...evacuationCenters.map(center => center.capacity),
    );

    const rankings = evacuationCenters
      .filter(center => !type || center.disasterTypes.includes(type))
      .map(center => {
        const distanceKm = getDistanceKm(origin, {
          latitude: center.latitude,
          longitude: center.longitude,
        });
        const distanceScore = Math.max(0, 1 - distanceKm / 20);
        const pwdScore =
          profileNeedsPwd && center.isPwdFriendly
            ? 1
            : profileNeedsPwd
              ? 0
              : 0.7;
        const petScore =
          profile.pets.hasPets && center.isPetFriendly
            ? 1
            : profile.pets.hasPets
              ? 0
              : 0.7;
        // OSM rarely tags capacity; treat unknown as neutral (0.5) so a close
        // real shelter isn't buried just for missing a capacity tag.
        const capacityScore =
          center.capacity > 0 ? center.capacity / maxCapacity : 0.5;
        const score =
          distanceScore * 0.4 +
          pwdScore * 0.3 +
          petScore * 0.2 +
          capacityScore * 0.1;
        const warnings: string[] = [];
        /*
        const warnings =
          type === 'flood' && distanceKm > 8
            ? ['Route may pass through flood-prone roads; verify with barangay advisories.']
            : [];
        */

        return {
          center,
          distanceKm,
          estimatedWalkMinutes: Math.ceil((distanceKm / walkingKph) * 60),
          score,
          isBestMatch: false,
          warnings,
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);

    return rankings.map((ranking, index) => ({
      ...ranking,
      isBestMatch: index === 0,
    }));
  },
};
