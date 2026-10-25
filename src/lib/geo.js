export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is unavailable in this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
        }),
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Allow location access in your browser to continue."
            : error.code === error.TIMEOUT
              ? "Could not get your location in time. Please try again."
              : "Could not get your location. Check your device settings.";
        reject(new Error(message));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}

// Haversine formula — returns distance in meters between two lat/lng points
export function distanceMeters(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

export function distanceMiles(a, b) {
  return distanceMeters(a, b) / 1609.344;
}

// Returns true if userPos is within the place's radius
export function isWithinRadius(userPos, place) {
  if (
    !userPos ||
    place.lat === null ||
    place.lat === undefined ||
    place.lng === null ||
    place.lng === undefined
  ) {
    return false;
  }
  const d = distanceMeters(userPos, { lat: place.lat, lng: place.lng });
  return d <= (place.radius_m ?? 50);
}

// Same limit the api enforces: coarser readings can't place someone inside a 50 m spot.
export const MAX_GPS_ACCURACY_M = 100;

export function isPreciseEnough(location) {
  return Boolean(location) && location.accuracy <= MAX_GPS_ACCURACY_M;
}

// The nearest place whose radius contains the location, or null.
export function placeContaining(places, location) {
  if (!location) return null;
  return (
    places
      .map((place) => ({ place, distance: distanceMeters(location, place) }))
      .filter(({ place, distance }) => distance <= place.radius_m)
      .sort((a, b) => a.distance - b.distance)[0]?.place ?? null
  );
}

// Human-readable distance string
export function formatDistance(meters) {
  if (meters < 50) return "< 50 m";
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
