import { createClient } from '@supabase/supabase-js';
import { createSupabaseClient, createSupabaseServerClient } from '../../supabase/config';

// 데이터베이스 타입 정의
export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          phone: string | null;
          company_name: string | null;
          role: 'admin' | 'manager' | 'driver' | 'customer';
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          full_name?: string | null;
          phone?: string | null;
          company_name?: string | null;
          role?: 'admin' | 'manager' | 'driver' | 'customer';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          phone?: string | null;
          company_name?: string | null;
          role?: 'admin' | 'manager' | 'driver' | 'customer';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      vehicles: {
        Row: {
          id: string;
          name: string;
          vehicle_type: '레이' | '스타렉스';
          license_plate: string | null;
          capacity_weight: number | null;
          capacity_volume: number | null;
          fuel_type: 'gasoline' | 'diesel' | 'electric' | 'hybrid' | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          vehicle_type: '레이' | '스타렉스';
          license_plate?: string | null;
          capacity_weight?: number | null;
          capacity_volume?: number | null;
          fuel_type?: 'gasoline' | 'diesel' | 'electric' | 'hybrid' | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          vehicle_type?: '레이' | '스타렉스';
          license_plate?: string | null;
          capacity_weight?: number | null;
          capacity_volume?: number | null;
          fuel_type?: 'gasoline' | 'diesel' | 'electric' | 'hybrid' | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      drivers: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          phone: string | null;
          license_number: string | null;
          experience_years: number;
          is_active: boolean;
          current_location_lat: number | null;
          current_location_lng: number | null;
          last_location_update: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          phone?: string | null;
          license_number?: string | null;
          experience_years?: number;
          is_active?: boolean;
          current_location_lat?: number | null;
          current_location_lng?: number | null;
          last_location_update?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          name?: string;
          phone?: string | null;
          license_number?: string | null;
          experience_years?: number;
          is_active?: boolean;
          current_location_lat?: number | null;
          current_location_lng?: number | null;
          last_location_update?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      destinations: {
        Row: {
          id: string;
          name: string;
          address: string;
          latitude: number | null;
          longitude: number | null;
          contact_name: string | null;
          contact_phone: string | null;
          estimated_time: number | null;
          priority: 'high' | 'medium' | 'low';
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          address: string;
          latitude?: number | null;
          longitude?: number | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          estimated_time?: number | null;
          priority?: 'high' | 'medium' | 'low';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string;
          latitude?: number | null;
          longitude?: number | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          estimated_time?: number | null;
          priority?: 'high' | 'medium' | 'low';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      dispatch_routes: {
        Row: {
          id: string;
          driver_id: string | null;
          vehicle_id: string | null;
          route_name: string;
          status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
          total_distance: number | null;
          total_time: number | null;
          start_time: string | null;
          end_time: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          driver_id?: string | null;
          vehicle_id?: string | null;
          route_name: string;
          status?: 'planned' | 'in_progress' | 'completed' | 'cancelled';
          total_distance?: number | null;
          total_time?: number | null;
          start_time?: string | null;
          end_time?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          driver_id?: string | null;
          vehicle_id?: string | null;
          route_name?: string;
          status?: 'planned' | 'in_progress' | 'completed' | 'cancelled';
          total_distance?: number | null;
          total_time?: number | null;
          start_time?: string | null;
          end_time?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      quotes: {
        Row: {
          id: string;
          customer_id: string | null;
          quote_number: string;
          quote_type: 'time_based' | 'quick_single' | 'per_delivery';
          origin_address: string;
          destination_address: string;
          distance: number | null;
          estimated_time: number | null;
          base_fare: number | null;
          additional_fare: number | null;
          total_fare: number;
          vehicle_type: '레이' | '스타렉스' | null;
          status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
          valid_until: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id?: string | null;
          quote_number: string;
          quote_type: 'time_based' | 'quick_single' | 'per_delivery';
          origin_address: string;
          destination_address: string;
          distance?: number | null;
          estimated_time?: number | null;
          base_fare?: number | null;
          additional_fare?: number | null;
          total_fare: number;
          vehicle_type?: '레이' | '스타렉스' | null;
          status?: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
          valid_until?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string | null;
          quote_number?: string;
          quote_type?: 'time_based' | 'quick_single' | 'per_delivery';
          origin_address?: string;
          destination_address?: string;
          distance?: number | null;
          estimated_time?: number | null;
          base_fare?: number | null;
          additional_fare?: number | null;
          total_fare?: number;
          vehicle_type?: '레이' | '스타렉스' | null;
          status?: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
          valid_until?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_user_role: {
        Args: {
          user_id: string;
        };
        Returns: string;
      };
      has_permission: {
        Args: {
          required_role: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

// 클라이언트 사이드 Supabase 클라이언트
export const supabase = createSupabaseClient();

// 서버 사이드 Supabase 클라이언트
export const createServerClient = () => createSupabaseServerClient();

// 타입 안전한 Supabase 클라이언트
export type SupabaseClient = ReturnType<typeof createClient<Database>>;

// 테이블 타입 추출
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TableInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TableUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

// 사용자 프로필 타입
export type UserProfile = Tables<'user_profiles'>;
export type UserProfileInsert = TableInsert<'user_profiles'>;
export type UserProfileUpdate = TableUpdate<'user_profiles'>;

// 차량 타입
export type Vehicle = Tables<'vehicles'>;
export type VehicleInsert = TableInsert<'vehicles'>;
export type VehicleUpdate = TableUpdate<'vehicles'>;

// 기사 타입
export type Driver = Tables<'drivers'>;
export type DriverInsert = TableInsert<'drivers'>;
export type DriverUpdate = TableUpdate<'drivers'>;

// 배송지 타입
export type Destination = Tables<'destinations'>;
export type DestinationInsert = TableInsert<'destinations'>;
export type DestinationUpdate = TableUpdate<'destinations'>;

// 배차 경로 타입
export type DispatchRoute = Tables<'dispatch_routes'>;
export type DispatchRouteInsert = TableInsert<'dispatch_routes'>;
export type DispatchRouteUpdate = TableUpdate<'dispatch_routes'>;

// 견적 타입
export type Quote = Tables<'quotes'>;
export type QuoteInsert = TableInsert<'quotes'>;
export type QuoteUpdate = TableUpdate<'quotes'>; 