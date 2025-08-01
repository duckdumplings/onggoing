// Auth Domain Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operator' | 'driver' | 'customer';
  organization?: string;
  phone?: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  organization?: string;
  phone?: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operator' | 'driver' | 'customer';
  organization?: string;
  phone?: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  language: 'ko' | 'en';
  theme: 'light' | 'dark' | 'auto';
  notifications: NotificationSettings;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
  deliveryUpdates: boolean;
  quoteUpdates: boolean;
} 