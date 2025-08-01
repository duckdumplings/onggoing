// Dispatch Domain Types
export interface RouteOptimizationRequest {
  drivers: Driver[];
  destinations: Destination[];
  constraints: OptimizationConstraints;
}

export interface Driver {
  id: string;
  name: string;
  vehicleType: '레이' | '스타렉스';
  capacity: number;
  currentLocation: Location;
}

export interface Destination {
  id: string;
  address: string;
  location: Location;
  estimatedTime: number; // minutes
  priority: 'high' | 'medium' | 'low';
}

export interface Location {
  latitude: number;
  longitude: number;
}

export interface OptimizationConstraints {
  maxDistance?: number;
  maxTime?: number;
  vehicleCapacity?: number;
  timeWindows?: TimeWindow[];
}

export interface TimeWindow {
  start: string; // HH:mm format
  end: string; // HH:mm format
}

export interface RouteOptimizationResult {
  routes: Route[];
  totalDistance: number;
  totalTime: number;
  optimizationScore: number;
}

export interface Route {
  driverId: string;
  destinations: Destination[];
  path: Location[];
  estimatedDistance: number;
  estimatedTime: number;
} 