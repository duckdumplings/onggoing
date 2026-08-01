import { validatePlan } from '@/domains/quote/agent/workingMemory';
import type {
  QuotePreflightCase,
  QuotePreflightDraft,
} from '@/domains/quote/types/quotePreflight';

const ARROW_RE = /\s*(?:→|->)\s*/;
const CLOCK_RE = /(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/;
const ADDRESS_HINT_RE = /(?:로|길|대로)\s*\d+|[가-힣0-9]+동\s*\d+/;
const REGION_START_RE =
  /(?:서울(?:특별시|시)?|경기(?:도)?|인천(?:광역시)?|부산(?:광역시)?|대구(?:광역시)?|광주(?:광역시)?|대전(?:광역시)?|울산(?:광역시)?|세종(?:특별자치시)?|[가-힣0-9]{2,8}(?:시|구|군))\s*/;

function normalizeTime(raw: string): string {
  const [hour, minute] = raw.split(':');
  return `${String(Number(hour)).padStart(2, '0')}:${minute}`;
}

function extractAddress(segment: string): string | null {
  const parenthesized = [...segment.matchAll(/\(([^()]+)\)/g)]
    .map((match) => match[1].trim())
    .find((value) => ADDRESS_HINT_RE.test(value));
  if (parenthesized) return parenthesized;

  const region = segment.match(REGION_START_RE);
  const start = region?.index;
  const candidate = (start == null ? segment : segment.slice(start))
    .replace(CLOCK_RE, ' ')
    .replace(
      /\b(?:상차|픽업|수거|배송|하차|반납|복귀|경유|견적|정기|비정기|완료|마감|예약|출발)\b.*$/g,
      '',
    )
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (ADDRESS_HINT_RE.test(candidate)) return candidate;
  return null;
}

function extractQuantity(text: string): number | undefined {
  const match = text.match(/(?:수량\s*[:：]?\s*(?:가방\s*)?|가방\s*)(\d+)\s*개/);
  if (!match) return undefined;
  const quantity = Number(match[1]);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : undefined;
}

function splitCaseTexts(text: string): Array<{ label: string; text: string }> {
  const lines = text.split(/\r?\n/);
  const groups: Array<{ label: string; lines: string[] }> = [];
  let current: { label: string; lines: string[] } | null = null;

  for (const line of lines) {
    const marker = line.match(
      /^\s*(?:\d+[.)]\s*)?([A-Z가-힣0-9][A-Z가-힣0-9 _-]{0,24}라인)\s*[:：]\s*(.*)$/i,
    );
    if (marker) {
      if (current) groups.push(current);
      current = { label: marker[1].trim(), lines: [marker[2]] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) groups.push(current);

  if (groups.length >= 2) {
    return groups.map((group) => ({
      label: group.label,
      text: group.lines.join('\n').trim(),
    }));
  }
  return [{ label: '배송라인 1', text }];
}

function parseCase(
  caseText: string,
  label: string,
  fullText: string,
): QuotePreflightCase | null {
  const segments = caseText
    .split(ARROW_RE)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return null;

  const globalQuantity = extractQuantity(caseText);
  const assumptions: string[] = [];
  const openQuestions: string[] = [];

  const stops = segments.flatMap((segment, index) => {
    const address = extractAddress(segment);
    if (!address) return [];

    const hasDrop = /배송|하차/.test(segment);
    const hasPickup = /상차|픽업|수거/.test(segment);
    const hasReturn = /반납|복귀/.test(segment);
    const composite = hasDrop && hasPickup;
    const role: QuotePreflightCase['stops'][number]['role'] = hasReturn
      ? 'return'
      : hasDrop
        ? 'drop'
        : hasPickup
          ? 'pickup'
          : index === 0
            ? 'pickup'
            : 'drop';
    const operations = composite
      ? [{ type: 'drop' as const }, { type: 'pickup' as const }]
      : undefined;

    const timeMatch = segment.match(CLOCK_RE);
    let schedule: QuotePreflightCase['stops'][number]['schedule'];
    if (timeMatch) {
      const time = normalizeTime(timeMatch[0]);
      if (/준비/.test(segment)) schedule = { type: 'ready', time };
      else if (/출발/.test(segment)) schedule = { type: 'departure', time };
      else if (/예약|정시/.test(segment)) schedule = { type: 'appointment', time };
      else if (/도착\s*(?:마감|까지)|까지\s*도착/.test(segment)) {
        schedule = { type: 'arrival-deadline', time };
      } else if (/완료|마감|까지/.test(segment)) {
        schedule = { type: 'completion-deadline', time };
      } else if (role === 'pickup') {
        schedule = { type: 'service-start', time };
        openQuestions.push(`${label} ${time} 상차는 물품 준비, 작업 시작, 차량 출발 중 어느 의미인가요?`);
      } else {
        schedule = { type: 'completion-deadline', time };
        openQuestions.push(`${label} ${time} ${role === 'return' ? '반납' : '배송'}은 완료 마감인가요, 정시 예약인가요?`);
      }
    }

    return [{
      address,
      role,
      ...(operations ? { operations } : {}),
      ...(index === 0 && globalQuantity ? { quantity: globalQuantity } : {}),
      ...(schedule ? { schedule } : {}),
    }];
  });

  if (stops.length < 2 || stops.length !== segments.length) return null;
  if (!/레이|스타렉스/.test(fullText)) assumptions.push('차종 미지정으로 레이를 적용했습니다.');
  if (!/정기|비정기/.test(fullText)) assumptions.push('운행 형태 미지정으로 비정기를 적용했습니다.');

  return {
    label,
    vehicleType: /스타렉스/.test(fullText) ? '스타렉스' : '레이',
    scheduleType: /정기/.test(fullText) && !/비정기/.test(fullText) ? 'regular' : 'ad-hoc',
    stops,
    assumptions,
    openQuestions,
  };
}

/**
 * 화살표·도로명 주소가 명확한 운영 메모를 네트워크 호출 없이 구조화한다.
 * 일부 구간의 주소를 확정할 수 없으면 null을 반환해 LLM 보조 경로로 넘긴다.
 */
export function createDeterministicQuotePreflight(
  message: string,
): QuotePreflightDraft | null {
  const groups = splitCaseTexts(message);
  const cases = groups.map((group) =>
    parseCase(group.text, group.label, message),
  );
  if (cases.some((item) => !item)) return null;

  const parsedCases = cases as QuotePreflightCase[];
  const validationIssues = parsedCases.flatMap((item, caseIndex) =>
    validatePlan(item.stops, item.frequency).issues.map((issue) => ({
      caseIndex,
      severity: issue.severity,
      message: issue.message,
    })),
  );
  const hasQuestions = parsedCases.some((item) => item.openQuestions.length > 0);

  return {
    cases: parsedCases,
    confidence: hasQuestions ? 'medium' : 'high',
    reviewReasons: hasQuestions
      ? ['시각의 운영 의미가 명시되지 않은 항목을 확인해 주세요.']
      : [],
    validationIssues,
  };
}
