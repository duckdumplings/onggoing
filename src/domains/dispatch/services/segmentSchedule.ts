import { atKstTime } from '@/domains/dispatch/utils/kstDateTime';

export type SegmentSchedule = {
  trafficDepartureTime: Date;
  targetDeliveryTime: Date | null;
  invalidDeliveryTime: boolean;
};

export function resolveSegmentSchedule(input: {
  timelineDepartureTime: Date;
  deliveryTime?: string | null;
  isNextDay?: boolean;
}): SegmentSchedule {
  const deliveryTime = (input.deliveryTime ?? '').trim();
  const targetDeliveryTime = deliveryTime
    ? atKstTime(input.timelineDepartureTime, deliveryTime, input.isNextDay ? 1 : 0)
    : null;

  return {
    // 실제 타임라인이 Tmap 교통 예측의 기준이다. 배송시각은 ETA 검증·예약 대기 판단에 별도로 사용한다.
    trafficDepartureTime: new Date(input.timelineDepartureTime.getTime()),
    targetDeliveryTime,
    invalidDeliveryTime: deliveryTime.length > 0 && targetDeliveryTime === null,
  };
}
