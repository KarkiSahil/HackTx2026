// Readings less precise than this can't tell whether someone is inside a 50 m place.
export const MAX_GPS_ACCURACY_M = 100;

// Largest radius a place may have (schema allows 500); used to size nearby searches.
export const MAX_PLACE_RADIUS_M = 500;

const EARTH_RADIUS_M = 6371000;
const METERS_PER_DEGREE_LAT = 111320;

export function distanceMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function boundingBox({ lat, lng }, meters) {
  const dLat = meters / METERS_PER_DEGREE_LAT;
  const dLng = meters / (METERS_PER_DEGREE_LAT * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng };
}

// Places whose radius contains the point, nearest first, each with its distance.
export function placesContaining(places, point) {
  return places
    .map((place) => ({ ...place, distance_m: distanceMeters(point, place) }))
    .filter((place) => place.distance_m <= place.radius_m)
    .sort((a, b) => a.distance_m - b.distance_m);
}
