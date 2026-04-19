import type { Ride, Trail, Vehicle } from '../types';

const STORAGE_KEY = 'holoholo_local_data_v1';

export interface LocalDataStore {
  vehicles: Vehicle[];
  rides: Ride[];
  trails: Trail[];
}

const EMPTY_STORE: LocalDataStore = {
  vehicles: [],
  rides: [],
  trails: [],
};

const asNumber = (value: unknown, fallback = Date.now()): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }

    const date = Date.parse(value);
    if (!Number.isNaN(date)) {
      return date;
    }
  }

  return fallback;
};

const normalizeVehicle = (value: unknown): Vehicle | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<Vehicle>;
  if (!raw.id || !raw.name) {
    return null;
  }

  return {
    id: String(raw.id),
    name: String(raw.name),
    type: raw.type ?? 'other',
    totalMileage: typeof raw.totalMileage === 'number' ? raw.totalMileage : 0,
    tripMileage: typeof raw.tripMileage === 'number' ? raw.tripMileage : 0,
    userId: raw.userId ?? 'local-device',
    createdAt: asNumber(raw.createdAt),
  };
};

const normalizeRide = (value: unknown): Ride | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<Ride>;
  if (!raw.id || !raw.vehicleId || !Array.isArray(raw.path)) {
    return null;
  }

  return {
    id: String(raw.id),
    vehicleId: String(raw.vehicleId),
    userId: raw.userId ?? 'local-device',
    distance: typeof raw.distance === 'number' ? raw.distance : 0,
    path: raw.path,
    startTime: asNumber(raw.startTime),
    endTime: raw.endTime === undefined ? undefined : asNumber(raw.endTime),
    duration: typeof raw.duration === 'number' ? raw.duration : undefined,
  };
};

const normalizeTrail = (value: unknown): Trail | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<Trail>;
  if (!raw.id || !raw.name || !Array.isArray(raw.path)) {
    return null;
  }

  return {
    id: String(raw.id),
    name: String(raw.name),
    userId: raw.userId ?? 'local-device',
    path: raw.path,
    distance: typeof raw.distance === 'number' ? raw.distance : 0,
    createdAt: asNumber(raw.createdAt),
  };
};

export function loadLocalData(): LocalDataStore {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return EMPTY_STORE;
  }

  try {
    const parsed = JSON.parse(saved) as Partial<LocalDataStore>;

    return {
      vehicles: Array.isArray(parsed.vehicles)
        ? parsed.vehicles.map(normalizeVehicle).filter((item): item is Vehicle => item !== null)
        : [],
      rides: Array.isArray(parsed.rides)
        ? parsed.rides.map(normalizeRide).filter((item): item is Ride => item !== null)
        : [],
      trails: Array.isArray(parsed.trails)
        ? parsed.trails.map(normalizeTrail).filter((item): item is Trail => item !== null)
        : [],
    };
  } catch (error) {
    console.error('Failed to read local app data:', error);
    return EMPTY_STORE;
  }
}

export function saveLocalData(store: LocalDataStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function createLocalId(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `${prefix}_${randomPart}`;
}
