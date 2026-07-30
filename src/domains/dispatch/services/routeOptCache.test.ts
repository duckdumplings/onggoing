import { describe, expect, it } from 'vitest';
import { normalizeRouteKey } from './routeOptCache';

const basePayload = {
  origins: [{ latitude: 37.48, longitude: 126.88, address: '가산' }],
  destinations: [{ latitude: 37.4, longitude: 127.1, address: '판교' }],
  vehicleType: '레이',
  roadOption: 'time-first',
  departureAt: '2026-07-30T01:00:30.000Z',
  dwellMinutes: [12],
  originDwellMinutes: 15,
  stopRoles: ['drop'],
  returnToOrigin: false,
  useExplicitDestination: true,
};

describe('normalizeRouteKey', () => {
  it('같은 분 안의 출발시각과 같은 조건은 같은 키를 만든다', () => {
    expect(normalizeRouteKey(basePayload)).toBe(
      normalizeRouteKey({
        ...basePayload,
        departureAt: '2026-07-30T01:00:59.000Z',
      }),
    );
  });

  it.each([
    ['originDwellMinutes', 30],
    ['stopRoles', ['pickup']],
    ['returnToOrigin', true],
    ['useExplicitDestination', false],
    ['earlyToleranceMinutes', 5],
    ['timeConstraintTypes', ['completion-deadline']],
    ['earlyToleranceMinutesByStop', [0]],
    ['stopOperations', [[{ type: 'drop' }, { type: 'pickup' }]]],
    ['originSchedule', { type: 'service-start', time: '10:20' }],
    ['vehicleCapacityKg', 100],
    ['loadKg', [20]],
  ])('%s 조건이 바뀌면 캐시를 분리한다', (field, value) => {
    expect(normalizeRouteKey({ ...basePayload, [field]: value })).not.toBe(
      normalizeRouteKey(basePayload),
    );
  });
});
