import { describe, expect, it } from 'vitest';
import { parseTeamQuoteRequest, stopWorkMinutes } from './input';
import { checkBuffer, instant, processStop, replayTimeline } from './timeline';

function fixture() {
  return parseTeamQuoteRequest({ title: '테스트', serviceDate: '2026-10-16', cases: [{
    label: '라인', vehicleType: '레이', pickupStart: '10:00', stops: [
      { name: '상차', address: '예시구 상차로 1', role: 'pickup' },
      { name: '고객', address: '예시구 배송로 2', role: 'drop', bags: 2, deadline: '11:30' },
    ],
  }] });
}

describe('팀 견적 입력과 완료 시각', () => {
  it('잘못된 날짜·시각과 알 수 없는 필드를 거부한다', () => {
    const request = fixture();
    expect(() => parseTeamQuoteRequest({ ...request, serviceDate: '2026-02-30' })).toThrow();
    expect(() => parseTeamQuoteRequest({ ...request, vat: 'included' })).toThrow();
    request.cases[0].pickupStart = '25:00';
    expect(() => parseTeamQuoteRequest(request)).toThrow();
  });

  it('11:27 도착했어도 11:37 전달 완료라면 11:30 마감 위반이다', () => {
    const request = fixture();
    const row = processStop(request.cases[0].stops[1], instant(request.serviceDate, '11:27'), request);
    expect(row.deliveryComplete).toBe('2026-10-16T02:37:00.000Z');
    expect(row.slackMinutes).toBe(-7);
  });

  it('일찍 도착해도 기업 전달은 15분 허용 범위에서만 수행한다', () => {
    const request = fixture();
    const row = processStop(request.cases[0].stops[1], instant(request.serviceDate, '10:30'), request);
    expect(row.serviceStart).toBe('2026-10-16T02:09:00.000Z');
    expect(row.deliveryComplete).toBe('2026-10-16T02:19:00.000Z');
    expect(row.waitMinutes).toBe(39);
  });

  it('동일 건물 5개 기업 전달시간을 합하고 개별 완료를 남긴다', () => {
    const request = fixture();
    const stop = request.cases[0].stops[1];
    stop.recipients = ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name, minutes: 4 }));
    expect(stopWorkMinutes(stop)).toBe(28);
    const row = processStop(stop, instant(request.serviceDate, '10:30'), request);
    expect(row.recipientCompletions).toHaveLength(5);
    expect(row.recipientCompletions[0].complete).toBe('2026-10-16T02:19:00.000Z');
    expect(row.slackMinutes).toBe(-5);
    stop.serviceMinutes = 10;
    expect(() => parseTeamQuoteRequest(request)).toThrow();
  });

  it('배송 완료와 12:31 수거 가능 시각을 분리하여 대기를 반영한다', () => {
    const request = fixture();
    const stop = request.cases[0].stops[1];
    stop.deadline = '12:00';
    stop.collection = { minutes: 5, readyAt: '12:31' };
    const row = processStop(stop, instant(request.serviceDate, '11:45'), request);
    expect(row.deliveryComplete).toBe('2026-10-16T02:55:00.000Z');
    expect(row.collectionStart).toBe('2026-10-16T03:31:00.000Z');
    expect(row.finish).toBe('2026-10-16T03:36:00.000Z');
    expect(row.waitMinutes).toBe(36);
    expect(row.slackMinutes).toBe(5);
  });

  it('첫 지점에서 확보한 대기를 뒤 지점 지연 여유로 오인하지 않는다', () => {
    const request = fixture();
    request.cases[0].stops.push({ name: '다음 고객', address: '예시구 배송로 3', role: 'drop', deadline: '12:00', bags: 1 });
    const route = request.cases[0];
    const nominal = replayTimeline(request, route, [1800, 1500]);
    expect(nominal.every((row) => row.slackMinutes == null || row.slackMinutes >= 0)).toBe(true);
    const stressed = checkBuffer(request, route, [1800, 1500]);
    expect(stressed[2].slackMinutes).toBe(-14);
  });

  it('수거 후 반납 완료가 마감보다 늦으면 위반이다', () => {
    const request = fixture();
    const row = processStop({ name: '반납', address: '가산', role: 'return', deadline: '13:00' }, instant(request.serviceDate, '12:55'), request);
    expect(row.slackMinutes).toBe(-5);
  });
});
