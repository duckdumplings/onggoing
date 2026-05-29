import type { ScenarioComparison } from '@/domains/dispatch/services/scenarioComparison';

export type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  kind?: 'normal' | 'system' | 'result';
  timestamp: Date;
  evidence?: AIQuoteResponse['evidence'];
  sourceUserText?: string;
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
