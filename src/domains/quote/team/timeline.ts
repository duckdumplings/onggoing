import { stopWorkMinutes, type TeamQuoteCase, type TeamQuoteRequest, type TeamQuoteStop } from './input';

export interface TeamTimelineRow {
  name: string;
  address: string;
  role: TeamQuoteStop['role'];
  arrival: string;
  serviceStart: string;
  deliveryComplete?: string;
  collectionStart?: string;
  finish: string;
  workMinutes: number;
  waitMinutes: number;
  deadline?: string;
  slackMinutes?: number;
  recipientCompletions: Array<{ name: string; complete: string }>;
}

export function instant(date: string, hhmm: string): number {
  return new Date(`${date}T${hhmm}:00+09:00`).getTime();
}

export function processStop(stop: TeamQuoteStop, arrival: number, request: TeamQuoteRequest): TeamTimelineRow {
  const workMinutes = stopWorkMinutes(stop);
  const ready = stop.readyAt ? instant(request.serviceDate, stop.readyAt) : arrival;
  const deadline = stop.deadline ? instant(request.serviceDate, stop.deadline) : undefined;
  const access = stop.role === 'drop'
    ? stop.accessMinutes ?? ((stop.recipients?.length ?? 0) > 1 ? 8 : 6)
    : 0;
  // 주차·입관은 먼저 할 수 있지만 기업별 전달 작업은 허용 시각부터 시작한다.
  const earliestService = stop.role === 'drop' && deadline != null
    ? deadline - (request.earlyMinutes + access) * 60_000
    : arrival;
  const serviceStart = Math.max(arrival, ready, earliestService);
  const workFinish = serviceStart + workMinutes * 60_000;
  const recipientCompletions: TeamTimelineRow['recipientCompletions'] = [];
  let handoff = serviceStart + access * 60_000;
  if (stop.role === 'drop') {
    for (const task of stop.recipients ?? [{ name: stop.name, minutes: workMinutes - access }]) {
      handoff += task.minutes * 60_000;
      recipientCompletions.push({ name: task.name, complete: new Date(handoff).toISOString() });
    }
  }
  const collectionStart = stop.collection
    ? Math.max(workFinish, stop.collection.readyAt ? instant(request.serviceDate, stop.collection.readyAt) : workFinish)
    : undefined;
  const finish = collectionStart != null ? collectionStart + stop.collection!.minutes * 60_000 : workFinish;
  const deadlineSubject = stop.role === 'drop' ? workFinish : finish;
  if (finish >= instant(request.serviceDate, '23:59') + 60_000) {
    throw new Error('자정을 넘는 운행입니다. 날짜별로 분리하여 입력하세요.');
  }
  return {
    name: stop.name, address: stop.address, role: stop.role,
    arrival: new Date(arrival).toISOString(), serviceStart: new Date(serviceStart).toISOString(),
    deliveryComplete: stop.role === 'drop' ? new Date(workFinish).toISOString() : undefined,
    collectionStart: collectionStart != null ? new Date(collectionStart).toISOString() : undefined,
    finish: new Date(finish).toISOString(),
    workMinutes: workMinutes + (stop.collection?.minutes ?? 0),
    waitMinutes: (serviceStart - arrival + (collectionStart != null ? collectionStart - workFinish : 0)) / 60_000,
    deadline: stop.deadline,
    slackMinutes: deadline != null ? (deadline - deadlineSubject) / 60_000 : undefined,
    recipientCompletions,
  };
}

export function replayTimeline(request: TeamQuoteRequest, route: TeamQuoteCase, driveSeconds: number[], delayedStop = -1) {
  let current = instant(request.serviceDate, route.pickupStart);
  return route.stops.map((stop, index) => {
    if (index > 0) current += driveSeconds[index - 1] * 1000;
    if (index === delayedStop) current += request.bufferMinutes * 60_000;
    const row = processStop(stop, current, request);
    current = new Date(row.finish).getTime();
    return row;
  });
}

export function checkBuffer(request: TeamQuoteRequest, route: TeamQuoteCase, driveSeconds: number[]) {
  const trials = route.stops.map((_, index) => replayTimeline(request, route, driveSeconds, index));
  return route.stops.map((stop, index) => {
    const worst = trials.reduce((latest, rows) => {
      const row = rows[index];
      return Math.max(latest, new Date(row.deliveryComplete ?? row.finish).getTime());
    }, 0);
    return {
      name: stop.name,
      worstComplete: new Date(worst).toISOString(),
      slackMinutes: stop.deadline ? (instant(request.serviceDate, stop.deadline) - worst) / 60_000 : undefined,
    };
  });
}
