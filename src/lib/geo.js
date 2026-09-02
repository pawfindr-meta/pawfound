export function getDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function checkPetSafety(petLat, petLng, safezoneList) {
  if (petLat == null || petLng == null || !safezoneList?.length) {
    return { isSafe: true, matchedZone: null, unknown: !safezoneList?.length };
  }
  for (const sz of safezoneList) {
    const dist = getDistanceMeters(sz.lat, sz.lng, petLat, petLng);
    if (dist <= sz.radius) return { isSafe: true, matchedZone: sz, distance: dist };
  }
  return { isSafe: false, matchedZone: null, distance: 0 };
}

export const DEFAULT_MAP_CENTER = [14.6760, 121.0437];
