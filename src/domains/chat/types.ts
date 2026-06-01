import type { ScenarioComparison } from '@/domains/dispatch/services/scenarioComparison';

/** 출발시간 매트릭스 한 행(compare_departure_times 결과). 누락 필드는 계산 실패. */
export type DepartureMatrixRow = {
  id: string;
  label: string;
  dayType?: 'weekday' | 'weekend' | string;
  trafficLabel?: string;
  dateLabel?: string;
  departureAt?: string;
  km?: number;
  driveMinutes?: number;
  dwellMinutes?: number;
  totalMinutes?: number;
  oneTimePrice?: number;
  formattedOneTime?: string;
  annualPrice?: number;
  formattedAnnual?: string;
  arrivalLabel?: string;
  meetsDeadline?: boolean;
  deadlineSlackMinutes?: number;
  error?: string;
};

/** 출발시간 매트릭스 결과 전체. */
export type DepartureMatrixResult = {
  matrix: DepartureMatrixRow[];
  recommendedId: string | null;
  frequencyLabel?: string | null;
  deadline?: string | null;
  deadlineInfeasible?: boolean;
  deadlineNote?: string | null;
  basis?: string;
};

/**
 * 어시스턴트 답변에 동반되는 구조화 결과 페이로드.
 * 마크다운 본문과 함께 카드/지도로 렌더하고, 메시지 metadata에 영속해 재진입 시 복원한다.
 */
export type ChatStructuredPayload = {
  quote?: unknown;
  scenarioComparison?: ScenarioComparison;
  scenarioRoutes?: Array<{ label: string; routeRequest: unknown }>;
  scenarioRouteErrors?: Array<{ label: string; message: string }>;
  routeRequest?: unknown;
  departureMatrix?: DepartureMatrixResult | null;
  departureAt?: string;
  realtimeTraffic?: boolean;
};

export type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  kind?: 'normal' | 'system' | 'result';
  timestamp: Date;
  evidence?: AIQuoteResponse['evidence'];
  sourceUserText?: string;
  /** 구조화 결과(시나리오 비교/출발매트릭스/경로). 있으면 버블에 카드 인라인 렌더. */
  structured?: ChatStructuredPayload;
  /** 실패 응답 — 버블에 "다시 시도" 버튼을 노출한다(sourceUserText로 재전송). */
  retryable?: boolean;
};

export type AIQuoteResponse = {
  success: boolean;
  assistantMessage?: string;
  suggestedPrompts?: string[];
  evidence?: {
    basis?: string[];
    sources?: Array<{ type: 'internal' | 'attachment' | 'web'; label: string; url?: string }>;
    fetchedAt?: string;
  };
  extracted?: any;
  missingFields?: string[];
  followUpQuestions?: Array<{ field: string; question: string }>;
  quote?: any;
  routeSummary?: any;
  scenarioComparison?: ScenarioComparison;
  scenarioRouteErrors?: Array<{ label: string; message: string }>;
  scenarioRoutes?: Array<{ label: string; routeRequest: any }>;
  departureMatrix?: DepartureMatrixResult | null;
  departureAt?: string | null;
  assumptions?: string[];
  routeRequest?: any;
  routeRequestMeta?: {
    usedSanitizedPayload?: boolean;
  };
  pipeline?: {
    stageState?: 'blocked' | 'need-input' | 'completed';
    readiness?: { score?: number; isReady?: boolean; reasons?: string[] };
  };
  rag?: { sources?: string[]; attachmentIds?: string[] };
  error?: { code: string; message: string };
};

export type ChatSession = {
  id: string;
  title: string;
  last_summary?: string | null;
  created_at: string;
  updated_at: string;
};

export type PersistedChatMessage = {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type ChatAttachment = {
  id: string;
  session_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
  parse_status: 'pending' | 'parsed' | 'failed';
  parse_error?: string | null;
  created_at: string;
};

export type GeneratedFile = {
  id: string;
  session_id: string;
  file_type: 'pdf' | 'xlsx' | 'md' | 'txt' | 'docx' | 'json';
  file_name: string;
  file_url: string;
  file_size: number;
  created_at: string;
};

export type AgentStep = { name: string; label: string; phase: 'start' | 'done' | 'error' };
