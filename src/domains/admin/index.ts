// Admin Domain Types
export interface DashboardStats {
  totalDeliveries: number;
  activeVehicles: number;
  totalRevenue: number;
  averageDeliveryTime: number;
  customerSatisfaction: number;
}

export interface DeliveryMetrics {
  date: string;
  completed: number;
  inProgress: number;
  failed: number;
  revenue: number;
}

export interface VehicleMetrics {
  vehicleId: string;
  driverName: string;
  totalDeliveries: number;
  totalDistance: number;
  averageDeliveryTime: number;
  fuelEfficiency: number;
  status: 'active' | 'maintenance' | 'offline';
}

export interface CustomerMetrics {
  customerId: string;
  customerName: string;
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  lastOrderDate: string;
  satisfactionScore: number;
}

export interface SystemHealth {
  apiResponseTime: number;
  databaseConnections: number;
  activeUsers: number;
  errorRate: number;
  uptime: number;
}

export interface AdminReport {
  id: string;
  type: 'daily' | 'weekly' | 'monthly';
  period: string;
  data: DashboardStats;
  generatedAt: string;
  generatedBy: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'analyst';
  permissions: string[];
  lastActivity: string;
} 