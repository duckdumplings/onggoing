export type DeliveryWaitResult = {
  waitSec: number;
  serviceStart: Date;
};

export function computeEarlyDeliveryWait(input: {
  arrival: Date;
  target: Date | null;
  earlyDeliveryForbidden: boolean;
  earlyToleranceMinutes: number;
  isNextDay?: boolean;
}): DeliveryWaitResult {
  const {
    arrival,
    target,
    earlyDeliveryForbidden,
    earlyToleranceMinutes,
    isNextDay,
  } = input;

  if (!target || !earlyDeliveryForbidden || earlyToleranceMinutes < 0 || isNextDay) {
    return { waitSec: 0, serviceStart: arrival };
  }

  const earliestMs = target.getTime() - earlyToleranceMinutes * 60 * 1000;
  if (arrival.getTime() >= earliestMs) {
    return { waitSec: 0, serviceStart: arrival };
  }

  return {
    waitSec: Math.round((earliestMs - arrival.getTime()) / 1000),
    serviceStart: new Date(earliestMs),
  };
}
