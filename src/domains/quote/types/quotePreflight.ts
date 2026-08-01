import { z } from 'zod';
import {
  FrequencySchema,
  RouteStopSchema,
  ScheduleTypeSchema,
  VehicleLabelSchema,
} from '@/domains/quote/agent/workingMemory';

export const QuotePreflightCaseSchema = z.object({
  label: z.string().min(1),
  vehicleType: VehicleLabelSchema.default('레이'),
  scheduleType: ScheduleTypeSchema.default('ad-hoc'),
  stops: z.array(RouteStopSchema).min(2),
  frequency: FrequencySchema.optional(),
  assumptions: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
});

export const QuotePreflightSchema = z.object({
  cases: z.array(QuotePreflightCaseSchema).min(1).max(20),
  confidence: z.enum(['high', 'medium', 'low']),
  reviewReasons: z.array(z.string()).default([]),
});

export type QuotePreflightCase = z.infer<typeof QuotePreflightCaseSchema>;
export type QuotePreflightDraft = z.infer<typeof QuotePreflightSchema> & {
  validationIssues: Array<{
    caseIndex: number;
    severity: 'error' | 'warning';
    message: string;
  }>;
};

export function buildConfirmedQuoteMessage(
  sourceText: string,
  draft: QuotePreflightDraft,
): string {
  return [
    sourceText,
    '',
    '[계산 전 사용자 확인 완료 — 아래 구조화 입력을 주소·작업·시각 의미의 최우선 근거로 사용]',
    JSON.stringify(
      {
        cases: draft.cases,
        confidence: draft.confidence,
      },
      null,
      2,
    ),
  ].join('\n');
}
