import {
  distanceMeters,
  distanceMiles,
  formatDistance,
  getCurrentLocation,
  isWithinRadius,
} from "./geo";

describe("geographic utilities", () => {
  const originalGeolocation = Object.getOwnPropertyDescriptor(
    navigator,
    "geolocation",
  );

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalGeolocation) {
      Object.defineProperty(navigator, "geolocation", originalGeolocation);
    } else {
      delete navigator.geolocation;
    }
  });

  it("returns zero for identical coordinates", () => {
    expect(distanceMeters({ lat: 30, lng: -97 }, { lat: 30, lng: -97 })).toBe(0);
  });

  it("converts meters to miles", () => {
    expect(
      distanceMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }),
    ).toBeCloseTo(69.09, 1);
  });

  it("accepts zero latitude and longitude when checking a radius", () => {
    expect(
      isWithinRadius(
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0, radius_m: 50 },
      ),
    ).toBe(true);
  });

  it("rejects places without coordinates", () => {
    expect(isWithinRadius({ lat: 0, lng: 0 }, { lat: null, lng: 0 })).toBe(
      false,
    );
  });

  it("returns the browser's live coordinates and accuracy", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success) =>
          success({
          coords: { latitude: 30, longitude: -97, accuracy: 12 },
          }),
      },
    });

    await expect(getCurrentLocation()).resolves.toEqual({
      lat: 30,
      lng: -97,
      accuracy: 12,
    });
  });

  it("reports denied location permission clearly", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success, failure) =>
          failure({ code: 1, PERMISSION_DENIED: 1 }),
      },
    });

    await expect(getCurrentLocation()).rejects.toThrow(
      "Allow location access in your browser to continue.",
    );
  });

  it.each([
    [49, "< 50 m"],
    [999, "999 m"],
    [1000, "1.0 km"],
    [10000, "10 km"],
  ])("formats %i meters as %s", (meters, expected) => {
    expect(formatDistance(meters)).toBe(expected);
  });
});
