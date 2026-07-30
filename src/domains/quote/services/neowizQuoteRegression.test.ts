import { describe, expect, it } from 'vitest';
import { computeEarlyDeliveryWait } from '@/domains/dispatch/services/deliveryWait';
import { atKstTime } from '@/domains/dispatch/utils/kstDateTime';
import { countIntermediateStops } from '@/domains/dispatch/services/rolePayload';
import {
  calculateHourlyFuelSurcharge,
  perJobRegularPrice,
  pickHourlyRate,
  roundUpTo30Minutes,
} from '@/domains/quote/pricing';

describe('네오위즈 단일 정기 배송 회귀', () => {
  const departure = new Date('2026-07-31T01:00:00.000Z'); // 10:00 KST
  const arrival = new Date(departure.getTime() + 41 * 60 * 1000); // 10:41 KST
  const deliveryDeadline = atKstTime(departure, '11:30');

  it('단순 11:30 마감은 574분 대기를 만들지 않고 운임표·유류할증을 적용한다', () => {
    const wait = computeEarlyDeliveryWait({
      arrival,
      target: deliveryDeadline,
      earlyDeliveryForbidden: false,
      earlyToleranceMinutes: 15,
    });
    expect(wait.waitSec).toBe(0);

    const rawMinutes = 41 + 27 + wait.waitSec / 60;
    const billMinutes = roundUpTo30Minutes(rawMinutes);
    expect(rawMinutes).toBe(68);
    expect(billMinutes).toBe(120);

    const ratePerHour = pickHourlyRate('ray', billMinutes);
    const fuel = calculateHourlyFuelSurcharge('ray', 30.7, billMinutes);
    const hourlyTotal = ratePerHour * (billMinutes / 60) + fuel.total;
    expect(ratePerHour).toBe(26500);
    expect(fuel.total).toBe(4000);
    expect(hourlyTotal).toBe(57000);

    const stopsCount = countIntermediateStops({
      destinations: [{ address: '네오위즈' }],
      useExplicitDestination: true,
    });
    const perJobTotal = perJobRegularPrice('ray', 30.7) + stopsCount * 7000;
    expect(stopsCount).toBe(0);
    expect(perJobTotal).toBe(53000);
  });
});
