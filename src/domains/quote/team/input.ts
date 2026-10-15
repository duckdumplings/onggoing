import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '시각은 HH:mm 형식입니다.');
const minutes = z.number().int().min(1).max(240);
const recipient = z.object({
  name: z.string().trim().min(1),
  minutes: minutes.default(4),
  bags: z.number().int().nonnegative().optional(),
}).strict();

const stop = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  role: z.enum(['pickup', 'drop', 'return']),
  bags: z.number().int().nonnegative().optional(),
  readyAt: time.optional(),
  deadline: time.optional(),
  serviceMinutes: minutes.optional(),
  accessMinutes: z.number().int().min(0).max(120).optional(),
  recipients: z.array(recipient).min(1).optional(),
  collection: z.object({ minutes: minutes.default(5), readyAt: time.optional() }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.role === 'drop' && !value.deadline) {
    ctx.addIssue({ code: 'custom', path: ['deadline'], message: '배송 전달 완료 마감이 필요합니다.' });
  }
  if (value.role !== 'drop' && (value.collection || value.recipients)) {
    ctx.addIssue({ code: 'custom', message: '기업별 전달·맞수거는 배송 지점에 지정하세요.' });
  }
  const access = value.accessMinutes ?? ((value.recipients?.length ?? 0) > 1 ? 8 : 6);
  const handoff = value.recipients?.reduce((sum, task) => sum + task.minutes, 0) ?? 4;
  if (value.role === 'drop' && value.serviceMinutes != null && value.serviceMinutes < access + handoff) {
    ctx.addIssue({ code: 'custom', path: ['serviceMinutes'], message: '작업시간이 건물 진입 및 기업별 전달시간 합보다 짧습니다.' });
  }
});

export const TeamQuoteRequestSchema = z.object({
  title: z.string().trim().min(1),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, '유효한 운행일을 입력하세요.'),
  bufferMinutes: z.number().int().min(0).max(120).default(20),
  earlyMinutes: z.number().int().min(0).max(15).default(15),
  assumptions: z.array(z.string().trim().min(1)).default([]),
  cases: z.array(z.object({
    label: z.string().trim().min(1),
    vehicleType: z.enum(['레이', '스타렉스']),
    scheduleType: z.enum(['regular', 'ad-hoc']).default('regular'),
    pickupStart: time,
    baseline: z.object({
      amount: z.number().nonnegative(),
      vat: z.enum(['excluded', 'included', 'unknown']),
    }).strict().optional(),
    stops: z.array(stop).min(2).max(30),
  }).strict().superRefine((value, ctx) => {
    if (value.stops[0].role !== 'pickup') {
      ctx.addIssue({ code: 'custom', path: ['stops', 0, 'role'], message: '첫 지점은 상차/수거지여야 합니다.' });
    }
  })).min(1).max(10),
}).strict();

export type TeamQuoteRequest = z.infer<typeof TeamQuoteRequestSchema>;
export type TeamQuoteCase = TeamQuoteRequest['cases'][number];
export type TeamQuoteStop = TeamQuoteCase['stops'][number];

export function parseTeamQuoteRequest(raw: unknown): TeamQuoteRequest {
  return TeamQuoteRequestSchema.parse(raw);
}

export function stopWorkMinutes(stop: TeamQuoteStop): number {
  if (stop.serviceMinutes != null) return stop.serviceMinutes;
  if (stop.role !== 'drop') return 10;
  const access = stop.accessMinutes ?? ((stop.recipients?.length ?? 0) > 1 ? 8 : 6);
  return Math.max(10, access + (stop.recipients?.reduce((sum, task) => sum + task.minutes, 0) ?? 4));
}
