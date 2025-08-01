// Quote Domain Types
export interface QuoteRequest {
  serviceType: '시간당' | '단건퀵' | '건당';
  vehicleType: '레이' | '스타렉스';
  distance: number; // km
  estimatedTime: number; // minutes
  destinations: QuoteDestination[];
  additionalServices?: string[];
}

export interface QuoteDestination {
  address: string;
  estimatedTime: number; // minutes
  priority: 'high' | 'medium' | 'low';
}

export interface PricingPlan {
  id: string;
  name: '시간당' | '단건퀵' | '건당';
  basePrice: number;
  distanceMultiplier?: number;
  timeMultiplier?: number;
  vehicleMultipliers: {
    레이: number;
    스타렉스: number;
  };
}

export interface QuoteResult {
  id: string;
  totalPrice: number;
  breakdown: PriceBreakdown;
  estimatedDeliveryTime: string;
  validUntil: string;
  terms: string[];
}

export interface PriceBreakdown {
  basePrice: number;
  distanceCharge: number;
  timeCharge: number;
  vehicleMultiplier: number;
  additionalServices: number;
  total: number;
}

export interface QuoteHistory {
  id: string;
  createdAt: string;
  quoteRequest: QuoteRequest;
  quoteResult: QuoteResult;
  status: 'pending' | 'accepted' | 'rejected';
} 