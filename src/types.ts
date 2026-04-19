export type VehicleType = 'bike' | 'onewheel' | 'ebike' | 'hiker' | 'other';

export interface PathPoint {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy?: number;
}

export interface Vehicle {
  id: string;
  name: string;
  type: VehicleType;
  totalMileage: number;
  tripMileage: number;
  userId: string;
  createdAt: number;
}

export interface Ride {
  id: string;
  vehicleId: string;
  userId: string;
  distance: number;
  path: PathPoint[];
  startTime: number;
  endTime?: number;
  duration?: number;
}

export interface Trail {
  id: string;
  name: string;
  userId: string;
  path: PathPoint[];
  distance: number;
  createdAt: number;
}
