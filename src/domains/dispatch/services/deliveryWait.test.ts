import { describe, expect, it } from 'vitest';
import { computeEarlyDeliveryWait } from '@/domains/dispatch/services/deliveryWait';
import { atKstTime } from '@/domains/dispatch/utils/kstDateTime';

const departure = new Date('2026-07-31T01:00:00.000Z'); // 10:00 KST
const arrival = new Date(departure.getTime() + 41 * 60 * 1000); // 10:41 KST
const target = atKstTime(departure, '11:30');

describe('computeEarlyDeliveryWait', () => {
  it('단순 배송 마감은 일찍 도착해도 대기시키지 않는다', () => {
    const result = computeEarlyDeliveryWait({
      arrival,
      target,
      earlyDeliveryForbidden: false,
      earlyToleranceMinutes: 15,
    });

    expect(result.waitSec).toBe(0);
    expect(result.serviceStart).toEqual(arrival);
  });

  it('예약 배송은 KST 예약시각 15분 전까지 34분만 대기한다', () => {
    const result = computeEarlyDeliveryWait({
      arrival,
      target,
      earlyDeliveryForbidden: true,
      earlyToleranceMinutes: 15,
    });

    expect(result.waitSec / 60).toBe(34);
    expect(result.serviceStart.toISOString()).toBe('2026-07-31T02:15:00.000Z');
  });

  it('작업 시작시각은 조기 허용 없이 해당 시각까지 대기한다', () => {
    const result = computeEarlyDeliveryWait({
      arrival,
      target,
      earlyDeliveryForbidden: true,
      earlyToleranceMinutes: 0,
    });

    expect(result.waitSec / 60).toBe(49);
    expect(result.serviceStart.toISOString()).toBe('2026-07-31T02:30:00.000Z');
  });
});
