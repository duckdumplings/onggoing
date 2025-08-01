// Tracking Domain Types
export interface VehicleLocation {
  vehicleId: string;
  driverId: string;
  location: Location;
  timestamp: string;
  status: 'active' | 'idle' | 'offline';
  speed?: number; // km/h
  heading?: number; // degrees
}

export interface Location {
  latitude: number;
  longitude: number;
  accuracy?: number; // meters
}

export interface DeliveryStatus {
  deliveryId: string;
  vehicleId: string;
  status: 'pending' | 'in-transit' | 'delivered' | 'failed';
  currentLocation: Location;
  estimatedArrival: string;
  actualArrival?: string;
  route: RoutePoint[];
}

export interface RoutePoint {
  location: Location;
  timestamp: string;
  status: 'visited' | 'pending' | 'skipped';
}

export interface TrackingEvent {
  id: string;
  vehicleId: string;
  eventType: 'location_update' | 'status_change' | 'delivery_complete';
  timestamp: string;
  data: any;
}

export interface RealTimeTracking {
  vehicleId: string;
  currentLocation: Location;
  destination: Location;
  estimatedTime: number; // minutes
  trafficConditions: 'clear' | 'moderate' | 'heavy';
  routeOptimization: boolean;
} 