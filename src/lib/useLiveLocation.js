import { useEffect, useState } from "react";

// Continuously tracks the device's position. Only the user's own location is
// ever shown; it is sent to the server only when they create or unlock something.
export function useLiveLocation() {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Location is unavailable in this browser.");
      setLoading(false);
      return undefined;
    }
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setLocation({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
        setError("");
        setLoading(false);
      },
      (failure) => {
        setError(
          failure.code === failure.PERMISSION_DENIED
            ? "Allow location access to unlock and leave things at places."
            : "Could not get your location. Check your device settings.",
        );
        setLoading(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { location, error, loading };
}
