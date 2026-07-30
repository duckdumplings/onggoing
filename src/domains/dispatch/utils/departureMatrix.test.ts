import { describe, expect, it } from 'vitest';
import {
  assessDeadlineFeasibility,
  resolveDeparturePresets,
} from './departureMatrix';

describe('departureMatrix KST policy', () => {
  it('요일 프리셋을 KST 달력으로 찾는다', () => {
    const now = new Date('2026-07-31T14:30:00.000Z'); // 금요일 23:30 KST
    const [preset] = resolveDeparturePresets(
      [{ id: 'weekend', label: '주말', dayType: 'weekend', hour: 10, minute: 0, trafficLabel: '한산' }],
      now,
    );
    expect(preset.iso).toBe('2026-08-01T01:00:00.000Z');
    expect(preset.dateLabel).toBe('8/1(토) 10:00');
  });

  it('도착 라벨과 같은 날 마감을 KST 기준으로 판정한다', () => {
    const result = assessDeadlineFeasibility('2026-07-31T01:00:00.000Z', 60, '11:30');
    expect(result).toMatchObject({
      arrivalLabel: '11:00',
      meetsDeadline: true,
      slackMinutes: 30,
    });
  });
});
