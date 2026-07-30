import { describe, expect, it } from 'vitest';
import { applyExplicitReturnHints } from '@/domains/dispatch/services/explicitRoleHints';
import type { RouteStop } from '@/domains/dispatch/types/routePlan';

describe('applyExplicitReturnHints', () => {
  it('원문에서 반납으로 명시한 마지막 주소의 모델 오분류를 보정한다', () => {
    const stops: RouteStop[] = [
      {
        address: '서울 중구 퇴계로 19',
        role: 'drop',
        operations: [{ type: 'drop' }, { type: 'pickup' }],
      },
      {
        address: '서울 금천구 가마산로 96',
        role: 'drop',
        operations: [{ type: 'drop' }],
      },
    ];
    const result = applyExplicitReturnHints(
      stops,
      '퇴계로 19 배송 및 빈 가방 수거 → 가산반납지: 금천구 가마산로 96',
    );

    expect(result[0]).toEqual(stops[0]);
    expect(result[1].role).toBe('return');
    expect(result[1].operations).toEqual([
      { type: 'return', quantity: undefined, weightKg: undefined },
    ]);
  });

  it('배송지 수거 문구는 반납으로 오인하지 않는다', () => {
    const stops: RouteStop[] = [
      {
        address: '서울 중구 퇴계로 19',
        role: 'drop',
        operations: [{ type: 'drop' }, { type: 'pickup' }],
      },
    ];
    expect(applyExplicitReturnHints(
      stops,
      '퇴계로 19 배송 및 빈 가방 수거',
    )).toEqual(stops);
  });

  it('같은 줄의 다른 주소에 붙은 반납 힌트를 앞 주소에 전파하지 않는다', () => {
    const stops: RouteStop[] = [
      { address: '서울 중구 퇴계로 19', role: 'drop' },
      { address: '서울 금천구 가마산로 96', role: 'drop' },
    ];
    const result = applyExplicitReturnHints(
      stops,
      '퇴계로 19 배송, 가마산로 96 반납',
    );

    expect(result[0].role).toBe('drop');
    expect(result[1].role).toBe('return');
  });
});
