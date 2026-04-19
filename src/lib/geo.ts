const GEOCODE_TIMEOUT_MS = 8000;

export async function getAddress(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  const timeoutId = window.setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', abortFromCaller, { once: true });
    }
  }

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      headers: {
        'Accept-Language': 'en'
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Geocoding request failed with ${response.status}`);
    }

    const data = await response.json();
    return data.display_name || 'Address not found';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'Location lookup timed out';
    }

    console.error('Geocoding error:', error instanceof Error ? error.message : error);
    return 'Unknown Location';
  } finally {
    signal?.removeEventListener('abort', abortFromCaller);
    window.clearTimeout(timeoutId);
  }
}

export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Radius of the Earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return d;
}

export function formatMileage(miles: number): string {
  return miles.toFixed(1);
}

export function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  const bearing = (θ * 180 / Math.PI + 360) % 360;
  return bearing;
}

export function getCardinalDirection(bearing: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

export function getFullDirection(bearing: number): string {
  const directions = [
    'North', 'North-Northeast', 'Northeast', 'East-Northeast',
    'East', 'East-Southeast', 'Southeast', 'South-Southeast',
    'South', 'South-Southwest', 'Southwest', 'West-Southwest',
    'West', 'West-Northwest', 'Northwest', 'North-Northwest'
  ];
  const index = Math.round(bearing / 22.5) % 16;
  return directions[index];
}
