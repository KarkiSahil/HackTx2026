import { HttpError } from "./errors.js";
import { MAX_GPS_ACCURACY_M, MAX_PLACE_RADIUS_M, distanceMeters, placesContaining } from "./geo.js";

export function assertPreciseEnough(accuracy) {
  if (accuracy > MAX_GPS_ACCURACY_M) {
    throw new HttpError(
      422,
      "gps_imprecise",
      `Your location is only accurate to about ${Math.round(accuracy)} m. Step outside or wait a moment, then try again.`,
    );
  }
}

// The place the user is standing in: the one they named, or the nearest one whose radius contains them.
export async function resolvePlace(db, { place_id, lat, lng, accuracy }) {
  assertPreciseEnough(accuracy);
  const point = { lat, lng };

  if (place_id) {
    const place = await db.getPlace(place_id);
    if (!place) throw new HttpError(404, "place_not_found", "That place no longer exists.");
    const distance = distanceMeters(point, place);
    if (distance > place.radius_m) {
      throw new HttpError(
        403,
        "not_at_place",
        `You're ${Math.round(distance)} m from ${place.name}. Get within ${place.radius_m} m to leave something here.`,
      );
    }
    return place;
  }

  const [nearest] = placesContaining(await db.placesNear(point, MAX_PLACE_RADIUS_M), point);
  if (!nearest) {
    throw new HttpError(409, "no_place", "There's no Katha place here yet. Name this spot to start one.");
  }
  return nearest;
}
