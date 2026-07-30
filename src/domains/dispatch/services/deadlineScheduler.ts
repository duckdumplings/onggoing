import type { StopSchedule } from '@/domains/dispatch/types/routePlan';
import {
  atKstTime,
  formatKstHHmm,
} from '@/domains/dispatch/utils/kstDateTime';

const DEADLINE_TYPES = new Set<StopSchedule['type']>([
  'service-start',
  'departure',
  'arrival-deadline',
  'completion-deadline',
  'appointment',
]);

export interface DeadlineTimelineEntry {
  address?: string | null;
  arrivalTime?: string | null;
  departureTime?: string | null;
  serviceStartTime?: string | null;
  schedule?: StopSchedule | null;
}

export interface DeadlineDepartureSuggestion {
  departureAt: string;
  departureLabel: string;
  pickupStartAt: string;
  pickupStartLabel: string;
  safetyMinutes: number;
  bindingDeadline: string;
  bindingAddress: string | null;
}

function nextDeadlineInstant(reference: Date, schedule: StopSchedule): Date | null {
  let target = atKstTime(reference, schedule.time, schedule.isNextDay ? 1 : 0);
  if (!target) return null;
  if (!schedule.isNextDay && target.getTime() <= reference.getTime()) {
    target = atKstTime(reference, schedule.time, 1);
  }
  return target;
}

export function buildDeadlineSeedDepartureAt(input: {
  referenceDate?: Date;
  schedules?: Array<StopSchedule | null | undefined>;
  fallbackDeadline?: string;
  leadMinutes?: number;
}): string | null {
  const reference = input.referenceDate ?? new Date();
  const schedules = (input.schedules ?? []).filter(
    (schedule): schedule is StopSchedule =>
      Boolean(schedule?.time) && DEADLINE_TYPES.has(schedule!.type),
  );
  if (input.fallbackDeadline) {
    schedules.push({ type: 'completion-deadline', time: input.fallbackDeadline });
  }
  const targets = schedules
    .map((schedule) => nextDeadlineInstant(reference, schedule))
    .filter((target): target is Date => Boolean(target));
  if (!targets.length) return null;
  const earliest = targets.reduce((min, target) =>
    target.getTime() < min.getTime() ? target : min,
  );
  const leadMinutes = Math.max(30, input.leadMinutes ?? 120);
  return new Date(earliest.getTime() - leadMinutes * 60_000).toISOString();
}

function evaluatedAt(entry: DeadlineTimelineEntry, type: StopSchedule['type']): Date | null {
  const raw =
    type === 'arrival-deadline'
      ? entry.arrivalTime
      : type === 'service-start' || type === 'appointment'
        ? entry.serviceStartTime ?? entry.arrivalTime
        : entry.departureTime;
  if (!raw) return null;
  const value = new Date(raw);
  return Number.isFinite(value.getTime()) ? value : null;
}

export function deriveDeadlineDepartureSuggestion(input: {
  seedDepartureAt: string;
  timeline: DeadlineTimelineEntry[];
  fallbackDeadline?: string;
  fallbackEvaluatedAt?: string | null;
  fallbackAddress?: string | null;
  originDwellMinutes?: number;
  safetyMinutes?: number;
}): DeadlineDepartureSuggestion | null {
  const seedDeparture = new Date(input.seedDepartureAt);
  if (!Number.isFinite(seedDeparture.getTime())) return null;
  const safetyMinutes = Math.max(0, input.safetyMinutes ?? 15);
  const candidates: Array<{
    shiftMinutes: number;
    deadline: string;
    address: string | null;
  }> = [];

  for (const entry of input.timeline) {
    const schedule = entry.schedule;
    if (!schedule || !DEADLINE_TYPES.has(schedule.type)) continue;
    const target = nextDeadlineInstant(seedDeparture, schedule);
    const evaluated = evaluatedAt(entry, schedule.type);
    if (!target || !evaluated) continue;
    candidates.push({
      shiftMinutes:
        (evaluated.getTime() - (target.getTime() - safetyMinutes * 60_000)) / 60_000,
      deadline: schedule.time,
      address: entry.address ?? null,
    });
  }

  if (input.fallbackDeadline && input.fallbackEvaluatedAt) {
    const evaluated = new Date(input.fallbackEvaluatedAt);
    const target = nextDeadlineInstant(seedDeparture, {
      type: 'completion-deadline',
      time: input.fallbackDeadline,
    });
    if (target && Number.isFinite(evaluated.getTime())) {
      candidates.push({
        shiftMinutes:
          (evaluated.getTime() - (target.getTime() - safetyMinutes * 60_000)) / 60_000,
        deadline: input.fallbackDeadline,
        address: input.fallbackAddress ?? null,
      });
    }
  }

  if (!candidates.length) return null;
  const binding = candidates.reduce((max, candidate) =>
    candidate.shiftMinutes > max.shiftMinutes ? candidate : max,
  );
  const departure = new Date(
    Math.floor(
      (seedDeparture.getTime() - binding.shiftMinutes * 60_000) / 60_000,
    ) * 60_000,
  );
  const originDwellMinutes = Math.max(0, input.originDwellMinutes ?? 15);
  const pickupStart = new Date(departure.getTime() - originDwellMinutes * 60_000);

  return {
    departureAt: departure.toISOString(),
    departureLabel: formatKstHHmm(departure),
    pickupStartAt: pickupStart.toISOString(),
    pickupStartLabel: formatKstHHmm(pickupStart),
    safetyMinutes,
    bindingDeadline: binding.deadline,
    bindingAddress: binding.address,
  };
}
