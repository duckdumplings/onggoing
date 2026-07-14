import { describe, expect, it } from 'vitest';
import { parsePastedStops } from '@/domains/quote/services/pasteToStops';

describe('parsePastedStops', () => {
  it('(a) 탭 표를 상차/하차 페어로 파싱하고 deliveryTime/quantity 를 뽑는다', () => {
    // 상차명 \t 주소 \t 상세 \t HH:mm \t 전화 \t 수량 \t 하차명 \t 주소 \t 상세 \t HH:mm \t 전화 \t 수량
    const text = [
      '행복상회\t서울특별시 강남구 테헤란로 152\t2층\t09:30\t010-1111-2222\t20\t친절카페\t서울특별시 서초구 서초대로 77길 55\t1층\t11:00\t010-3333-4444\t15',
      '믿음마트\t서울특별시 송파구 올림픽로 300\t\t10:00\t02-555-6666\t30\t소망식당\t서울특별시 마포구 월드컵북로 400\t지하1층\t13:30\t070-8888-9999\t12',
    ].join('\n');

    const stops = parsePastedStops(text);
    expect(stops).toHaveLength(4);

    // 첫 줄: 상차 → 하차 페어
    expect(stops[0].role).toBe('pickup');
    expect(stops[0].address).toContain('테헤란로');
    expect(stops[0].deliveryTime).toBe('09:30');
    expect(stops[0].quantity).toBe(20);
    expect(stops[0].memo).toBe('행복상회');

    expect(stops[1].role).toBe('drop');
    expect(stops[1].address).toContain('서초대로');
    expect(stops[1].deliveryTime).toBe('11:00');
    expect(stops[1].quantity).toBe(15);

    // 둘째 줄: 상차 → 하차 페어
    expect(stops[2].role).toBe('pickup');
    expect(stops[2].deliveryTime).toBe('10:00');
    expect(stops[2].quantity).toBe(30);

    expect(stops[3].role).toBe('drop');
    expect(stops[3].deliveryTime).toBe('13:30');
    expect(stops[3].quantity).toBe(12);

    // 전화번호는 주소로 오인되지 않는다(주소는 상차/하차 2개뿐).
    expect(stops.filter((s) => /\d{4}-\d{4}/.test(s.address))).toHaveLength(0);
  });

  it('(b) 라벨형 메모는 parseStructuredLogisticsMemo 로 폴백한다', () => {
    const text = '상차지: 서울특별시 강남구 테헤란로 152\n배송지: 서울특별시 서초구 서초대로 77 11:30';
    const stops = parsePastedStops(text);

    expect(stops.length).toBeGreaterThanOrEqual(2);

    const pickup = stops.find((s) => s.role === 'pickup');
    expect(pickup).toBeDefined();
    expect(pickup?.address).toContain('테헤란로');
    // 라벨 기반 역할이라 role 저신뢰가 아니다.
    expect(pickup?.lowConfidence.role).toBeFalsy();

    const drop = stops.find((s) => s.role === 'drop');
    expect(drop).toBeDefined();
    expect(drop?.address).toContain('서초대로');
    expect(drop?.deliveryTime).toBe('11:30');
  });

  it('(c) 구 단위 주소는 lowConfidence.address=true', () => {
    const text = '상차\t서울특별시 강남구 테헤란로 152\t\t09:00\t\t10\t하차\t서울특별시 서초구\t\t\t\t';
    const stops = parsePastedStops(text);

    const drop = stops.find((s) => s.role === 'drop');
    expect(drop).toBeDefined();
    expect(drop?.address).toBe('서울특별시 서초구');
    expect(drop?.lowConfidence.address).toBe(true);

    // 번지가 있는 상차 주소는 저신뢰가 아니다.
    const pickup = stops.find((s) => s.role === 'pickup');
    expect(pickup?.lowConfidence.address).toBeFalsy();
  });

  it('빈 입력은 빈 배열을 반환한다', () => {
    expect(parsePastedStops('')).toEqual([]);
    expect(parsePastedStops('   \n  ')).toEqual([]);
  });

  it('상차 시각 누락은 time 저신뢰로 보지 않는다(준비시각)', () => {
    // 상차 주소만 있고 시각 없음 → pickup, time 저신뢰 아님
    const text = '상차\t서울특별시 강남구 테헤란로 152\t\t\t\t10\t하차\t서울특별시 서초구 서초대로 77\t\t\t\t5';
    const stops = parsePastedStops(text);
    const pickup = stops.find((s) => s.role === 'pickup');
    expect(pickup?.deliveryTime).toBeUndefined();
    expect(pickup?.lowConfidence.time).toBeFalsy();

    // 하차는 시각 없으면 time 저신뢰
    const drop = stops.find((s) => s.role === 'drop');
    expect(drop?.deliveryTime).toBeUndefined();
    expect(drop?.lowConfidence.time).toBe(true);
  });
});
