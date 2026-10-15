import type { TeamQuoteReport } from './run';
import { stopWorkMinutes } from './input';

const statusLabels = {
  feasible: '기준·지연시험 충족', tight: '기본 마감 충족 · 버퍼 부족',
  infeasible: '현재 조건 마감 불가', unverified: '근거/조건 재확인', error: '계산 실패',
};
const text = (value: string) => value.replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').replace(/[<>]/g, '');
const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
const mins = (value: number) => `${Math.ceil(value)}분`;
const time = (value: string) => new Date(Math.ceil(new Date(value).getTime() / 60_000) * 60_000).toLocaleTimeString('ko-KR', {
  timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
});

export function formatTeamQuoteReport(report: TeamQuoteReport): string {
  const request = report.request;
  const day = new Date(`${request.serviceDate}T12:00:00+09:00`).toLocaleDateString('ko-KR', { weekday: 'long', timeZone: 'Asia/Seoul' });
  const lines = [
    `# ${text(request.title)}`, '',
    `운행 기준: ${request.serviceDate} ${day} · 모든 금액 VAT 제외 · 조회: ${report.generatedAt}`, '',
    `기준: 전달 완료 마감 준수 · 최대 ${request.earlyMinutes}분 조기 전달 · 별도 예약 여유 ${request.bufferMinutes}분`, '',
    '| 시나리오 | 상태 | 1회 운임 | 기존 대비 | 총거리 | 버퍼 포함 예약시간 | 청구시간 |',
    '|---|---|---:|---:|---:|---:|---:|',
  ];
  for (const item of report.cases) {
    const difference = item.difference != null ? `${item.difference > 0 ? '+' : ''}${won(item.difference)}` : '비교 보류';
    lines.push(`| ${text(item.label)} | ${statusLabels[item.status]} | ${item.price ? won(item.price.total) : '미산출'} | ${difference} | ${item.distanceKm?.toFixed(1) ?? '—'}km | ${item.reservedMinutes != null ? mins(item.reservedMinutes) : '—'} | ${item.price ? mins(item.price.billMinutes) : '—'} |`);
  }
  if (request.assumptions.length) lines.push('', '## 입력 가정', '', ...request.assumptions.map((item) => `- ${text(item)}`));
  for (const [index, item] of report.cases.entries()) {
    const route = request.cases[index];
    lines.push('', `## ${text(item.label)}`, '', `판정: **${statusLabels[item.status]}** · ${route.vehicleType}`);
    if (item.status !== 'feasible') lines.push('', '금액은 해당 조건의 참고 산출값입니다. 마감·버퍼·근거를 해결하기 전 확정 운행안으로 안내하지 마세요.');
    if (item.issues.length) lines.push('', ...item.issues.map((issue) => `- ${text(issue)}`));
    if (!item.timeline || !item.price) continue;
    lines.push('',
      `순수 주행 ${mins(item.driveMinutes!)} + 현장 작업 ${mins(item.workMinutes!)} + 대기 ${mins(item.waitMinutes!)} = 기본 총운행 ${mins(item.totalMinutes!)}.`,
      `별도 여유 ${request.bufferMinutes}분 포함 예약시간 ${mins(item.reservedMinutes!)}; ${route.pickupStart} 시작 → ${time(item.timeline.at(-1)!.finish)} 기본 종료 / ${time(item.reservedFinish!)} 예약 종료.`,
      `운임: ${mins(item.price.billMinutes)} ÷ 60 × ${won(item.price.ratePerHour)}/시간 + 유류할증 ${won(item.price.fuelSurcharge)} = **${won(item.price.total)} (VAT 제외)**.`, '',
      '| 지점 | 도착 | 작업 시작 | 전달 완료 | 맞수거 시작 | 출발/종료 | 완료 마감 | 마감 여유 | 지연시험 완료 |',
      '|---|---|---|---|---|---|---|---:|---|',
    );
    for (const [rowIndex, row] of item.timeline.entries()) {
      lines.push(`| ${text(row.name)} | ${time(row.arrival)} | ${time(row.serviceStart)} | ${row.deliveryComplete ? time(row.deliveryComplete) : '—'} | ${row.collectionStart ? time(row.collectionStart) : '—'} | ${time(row.finish)} | ${row.deadline ?? '—'} | ${row.slackMinutes != null ? `${Math.floor(row.slackMinutes)}분` : '—'} | ${time(item.bufferCheck![rowIndex].worstComplete)} |`);
      if (row.recipientCompletions.length > 1) {
        lines.push(...row.recipientCompletions.map((recipient) => `| ↳ ${text(recipient.name)} | | | ${time(recipient.complete)} | | | | | |`));
      }
    }
    lines.push('', '작업시간·주소 확인:', '', ...route.stops.map((stop) =>
      `- ${text(stop.name)}: ${text(stop.address)} · ${stop.bags != null ? `가방 ${stop.bags}개` : '수량 미입력'} · 작업 ${stopWorkMinutes(stop)}분${stop.serviceMinutes == null ? '(기본 추정)' : '(지정)'}${stop.collection ? ` + 맞수거 ${stop.collection.minutes}분${stop.collection.readyAt ? `(${stop.collection.readyAt} 이후)` : ''}` : ''}.`));
    lines.push('',
      `교통 근거: ${item.traffic!.segments}구간 중 출발시각 예측 시도 ${item.traffic!.prediction}, 호출시점 교통 대체 ${item.traffic!.fallback}. 미래 교통 실측이 아닌 예측값입니다.`,
      `운임 근거: 시간당 ${item.price.rateTable.source} / 시행 ${item.price.rateTable.effectiveFrom}; 유류 ${item.price.fuelSurchargeRateTable.source} / 시행 ${item.price.fuelSurchargeRateTable.effectiveFrom}. 계산 시점 운임표 적용.`,
    );
  }
  lines.push('', '## 안내 시 지킬 기준', '',
    '- 표시 시각·소요시간은 각각 분 단위 올림입니다. 항목별 올림 합계와 전체 올림은 다를 수 있으며, 마감 판정은 원본 초 단위로 수행합니다.',
    `- 지연시험은 각 지점 도착 직전에 ${request.bufferMinutes}분 지연이 한 번 생기는 경우를 각각 재생합니다. 조회한 구간 주행시간을 유지하며 지연 후 교통을 재조회한 결과가 아닙니다.`,
    '- 예약시간에는 버퍼를 별도 전액 포함합니다. 앞당긴 출발이 후속 지점의 지연 여유를 보장하지는 않습니다.',
    '- 주소 변경·배송시각 변경은 별도 시나리오로 비교하고 고객이 지정한 시각을 임의로 수정하지 않습니다.',
    '- 주차·통행 등 별도 실비와 차량 적재 적합성, 기사 가용성 및 실제 시작 가능일은 운영 확인 항목입니다.',
    '',
  );
  return lines.join('\n');
}
