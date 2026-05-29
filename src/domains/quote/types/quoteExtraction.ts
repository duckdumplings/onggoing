// 견적안 정보 추출 관련 타입 정의

import type { Frequency, StopRole } from '@/domains/dispatch/types/routePlan';

export type ExtractionMethod = 'llm' | 'heuristic';

export interface ExtractedQuoteInfo {
  // 출발지 정보
  origin?: {
    address: string;
    latitude?: number;
    longitude?: number;
  };

  // 경유지/목적지 목록
  destinations?: Array<{
    address: string;
    latitude?: number;
    longitude?: number;
    deliveryTime?: string; // HH:mm 형식
    isNextDay?: boolean; // deliveryTime이 익일 기준인지 여부
    dwellMinutes?: number; // 체류 시간 (분)
    priority?: 'high' | 'medium' | 'low';
    /** 물류 역할(수거/하차/반납). 다중 수거→단일 하차 구분에 사용. */
    role?: StopRole;
    /** 지점별 물량(kg). */
    weightKg?: number;
    memo?: string;
  }>;

  // 운임/비용 정보
  pricing?: {
    totalPrice?: number;
    baseFare?: number;
    distanceCharge?: number;
    timeCharge?: number;
    additionalFees?: number;
    currency?: string; // 기본값: KRW
  };

  // 차량 정보
  vehicleType?: '레이' | '스타렉스';

  // 스케줄 정보
  scheduleType?: 'regular' | 'ad-hoc';
  /** 정기 수거 빈도(연 N회). schedule='regular'일 때 정량화에 사용. */
  frequency?: Frequency;
  departureTime?: string; // HH:mm 형식
  estimatedDuration?: number; // 분 단위

  // 거리 및 시간 정보
  totalDistance?: number; // km
  totalTime?: number; // 분

  // AI 답변 (RAG 기반)
  assistantResponse?: string;

  // 특별 요구사항
  specialRequirements?: string[];
  notes?: string;

  // 원본 텍스트에서 추출한 기타 정보
  rawData?: Record<string, any>;
}

export interface QuoteExtraction {
  id: string;
  document_id: string;
  extracted_data: ExtractedQuoteInfo;
  confidence_score?: number | null;
  extraction_method: ExtractionMethod;
  created_at: string;
}

export interface QuoteExtractionInsert {
  document_id: string;
  extracted_data: ExtractedQuoteInfo;
  confidence_score?: number | null;
  extraction_method: ExtractionMethod;
}

export interface QuoteExtractionResult {
  success: boolean;
  data?: {
    id: string;
    extracted_data: ExtractedQuoteInfo;
    confidence_score?: number;
    extraction_method: ExtractionMethod;
  };
  error?: {
    code: string;
    message: string;
  };
}



