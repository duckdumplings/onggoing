import type {
  RouteStop,
  StopOperation,
  StopSchedule,
} from '@/domains/dispatch/types/routePlan';
import { atKstTime } from '@/domains/dispatch/utils/kstDateTime';

export function resolveStopOperations(stop: RouteStop): StopOperation[] {
  if (Array.isArray(stop.operations) && stop.operations.length > 0) {
    return stop.operations.map((operation) => ({ ...operation }));
  }
  if (stop.role !== 'pickup' && stop.role !== 'drop' && stop.role !== 'return') return [];
  return [{
    type: stop.role,
    quantity: stop.quantity,
    weightKg: stop.weightKg,
  }];
}

export function resolveStopSchedule(stop: RouteStop): StopSchedule | null {
  if (stop.schedule?.time?.trim()) {
    return { ...stop.schedule, time: stop.schedule.time.trim() };
  }
  if (!stop.deliveryTime?.trim()) return null;
  return {
    type: stop.deliveryTimeType === 'appointment' ? 'appointment' : 'arrival-deadline',
    time: stop.deliveryTime.trim(),
    isNextDay: stop.isNextDay,
  };
}

export function resolveOriginDepartureAt(
  origin: RouteStop,
  fallbackDepartureAt?: string,
): string | undefined {
  const schedule = resolveStopSchedule(origin);
  if (!schedule || !['ready', 'service-start', 'departure', 'appointment'].includes(schedule.type)) {
    return fallbackDepartureAt;
  }

  const fallback = fallbackDepartureAt ? new Date(fallbackDepartureAt) : new Date();
  if (!Number.isFinite(fallback.getTime())) return fallbackDepartureAt;
  const scheduled = atKstTime(fallback, schedule.time, schedule.isNextDay ? 1 : 0);
  if (!scheduled) return fallbackDepartureAt;

  if (schedule.type === 'departure') return scheduled.toISOString();
  const dwellMinutes = Number.isFinite(Number(origin.dwellMinutes))
    ? Math.max(0, Number(origin.dwellMinutes))
    : 15;
  return new Date(scheduled.getTime() + dwellMinutes * 60 * 1000).toISOString();
}

export function formatStopOperations(operations?: StopOperation[] | null): string {
  const types = new Set((operations ?? []).map((operation) => operation.type));
  if (types.has('drop') && types.has('pickup')) return '배송·수거';
  if (types.has('return') && types.has('pickup')) return '수거·반납';
  if (types.has('return')) return '반납';
  if (types.has('drop')) return '배송';
  if (types.has('pickup')) return '상차';
  return '경유';
}

export function formatStopSchedule(schedule?: StopSchedule | null): string | null {
  if (!schedule) return null;
  const labels: Record<StopSchedule['type'], string> = {
    ready: '물품 준비',
    'service-start': '작업 시작',
    departure: '출발',
    'arrival-deadline': '도착 마감',
    'completion-deadline': '완료 마감',
    appointment: '예약',
  };
  return `${labels[schedule.type]} ${schedule.time}${schedule.isNextDay ? ' 익일' : ''}`;
}
