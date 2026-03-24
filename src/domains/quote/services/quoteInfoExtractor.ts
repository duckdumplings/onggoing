// LLM 기반 견적안 정보 추출 서비스

import { ExtractedQuoteInfo, ExtractionMethod } from '../types/quoteExtraction';

export interface ChatHistoryItem {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface FollowUpQuestion {
  field: string;
  question: string;
}

const DEFAULT_QUOTE_LLM_MODEL = 'gpt-4.1-mini';

function getQuoteLlmModel(): string {
  return (
    process.env.OPENAI_QUOTE_MODEL ||
    process.env.OPENAI_MODEL ||
    DEFAULT_QUOTE_LLM_MODEL
  );
}

function normalizeTimeHHMM(value?: string): string | undefined {
  if (!value) return undefined;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) {
    return undefined;
  }
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function normalizeVehicleType(value?: string): '레이' | '스타렉스' | undefined {
  if (!value) return undefined;
  if (/스타렉스|starex/i.test(value)) return '스타렉스';
  if (/레이|ray/i.test(value)) return '레이';
  return undefined;
}

function normalizeScheduleType(value?: string): 'regular' | 'ad-hoc' | undefined {
  if (!value) return undefined;
  if (/regular|정기/i.test(value)) return 'regular';
  if (/ad-?hoc|비정기|일회성/i.test(value)) return 'ad-hoc';
  return undefined;
}

export function normalizeExtractedQuoteInfo(data: ExtractedQuoteInfo): ExtractedQuoteInfo {
  const normalizedDestinations = (data.destinations || [])
    .filter((d) => !!d?.address?.trim())
    .map((d) => ({
      ...d,
      address: d.address.trim(),
      deliveryTime: normalizeTimeHHMM(d.deliveryTime),
      dwellMinutes: Number.isFinite(d.dwellMinutes) ? Math.max(0, Number(d.dwellMinutes)) : undefined,
      isNextDay: Boolean(d.isNextDay),
    }));

  return {
    ...data,
    origin: data.origin?.address?.trim()
      ? {
        ...data.origin,
        address: data.origin.address.trim(),
      }
      : undefined,
    destinations: normalizedDestinations.length > 0 ? normalizedDestinations : undefined,
    vehicleType: normalizeVehicleType(data.vehicleType),
    scheduleType: normalizeScheduleType(data.scheduleType),
    departureTime: normalizeTimeHHMM(data.departureTime),
    totalDistance: Number.isFinite(data.totalDistance) ? Number(data.totalDistance) : undefined,
    totalTime: Number.isFinite(data.totalTime) ? Number(data.totalTime) : undefined,
    assistantResponse: data.assistantResponse || undefined,
  };
}

export function buildFollowUpQuestions(
  extractedData: ExtractedQuoteInfo,
  missingFields: string[]
): FollowUpQuestion[] {
  const questions: FollowUpQuestion[] = [];
  const has = new Set(missingFields);

  if (has.has('origin')) {
    questions.push({
      field: 'origin',
      question: '출발지 주소를 알려주세요.',
    });
  }

  if (has.has('destinations')) {
    questions.push({
      field: 'destinations',
      question: '목적지(경유지) 주소를 최소 1개 이상 알려주세요.',
    });
  }

  if (has.has('vehicleType')) {
    questions.push({
      field: 'vehicleType',
      question: '차량 타입은 레이와 스타렉스 중 어떤 것으로 진행할까요?',
    });
  }

  if (has.has('departureTime')) {
    questions.push({
      field: 'departureTime',
      question: '출발 예정 시간이 있으면 HH:mm 형식으로 알려주세요. (예: 09:30)',
    });
  }

  if (has.has('scheduleType')) {
    questions.push({
      field: 'scheduleType',
      question: '정기(regular)인지 비정기(ad-hoc)인지 알려주세요.',
    });
  }

  // 필수 누락이 없는 경우에도 품질 개선용 질문
  if (!has.has('destinations') && extractedData.destinations?.some((d) => !d.deliveryTime)) {
    questions.push({
      field: 'deliveryTimes',
      question: '각 목적지의 배송완료시간(HH:mm)이 있으면 정확도가 더 올라갑니다.',
    });
  }

  return questions;
}

/**
 * LLM을 사용하여 텍스트에서 견적안 정보 추출
 */
export async function extractQuoteInfoWithLLM(
  text: string,
  history: ChatHistoryItem[] = []
): Promise<{
  extractedData: ExtractedQuoteInfo;
  confidenceScore: number;
}> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const model = getQuoteLlmModel();

  if (!openaiKey) {
    throw new Error('OpenAI API 키가 설정되지 않았습니다');
  }

  const systemPrompt = `너는 물류 견적 입력 분석 및 상담 전문가다. 사용자와의 대화 히스토리와 현재 입력을 분석하여, '현재 시점의 유효한 전체 견적 정보'를 JSON으로 추출하고, 사용자의 질문에 대해 친절하고 자연스럽게 답변해라.

### 필수 필드 (견적 산출용)
- origin: 출발지 주소 (address 필수)
- destinations: 경유지/목적지 배열 (각각 address 필수, deliveryTime은 HH:mm, isNextDay, dwellMinutes)

### 한국 물류 메모 라벨 (반드시 준수)
- "상차지/상차/출발"에 적힌 줄 → **origin** (상차지가 여러 곳으로 적혀 있어도, 첫 번째 상차지만 origin에 넣고, 두 번째부터의 상차지는 destinations의 가장 앞부분에 추가하여 경유지로 취급할 것)
- "주소" 또는 "배송지/하차지"에 적힌 줄 → **목적지 경유 순서대로 destinations**에 추가할 것 (기업 대표 주소가 배송 방문지인 경우가 많음)
- "반납지/반납" → **destinations의 마지막**에 두는 것이 일반적 (상차 → 배송 → 반납 순)
- 사용자가 한 번에 붙여 넣은 메모이면 **그 메모 안의 라벨만** 쓰고, 예전에 나온 "동아빌라트" 등 **추측으로 주소를 덧붙이지 말 것**
- vehicleType: '레이' 또는 '스타렉스'
- scheduleType: 'regular' 또는 'ad-hoc'
- departureTime: 출발 시간 (HH:mm)

### 출력 필드
- assistantResponse: **매우 중요**: 사용자와 대화하는 메인 텍스트 필드다. 
  1. 사용자의 질문에 대한 답변.
  2. 견적 정보가 부족하면, "목록을 나열하지 말고" 대화하듯이 자연스럽게 물어봐라. (예: "네, 차량은 레이로 설정했어요. 그런데 출발지가 어디인가요?")
  3. 견적이 완료되면, 결과를 요약해서 말해줘라.
  4. 딱딱한 기계적 말투를 피하고, 상담원처럼 친절하게 응대하라.
- (나머지 견적 필드는 위와 동일)

규칙:
1. JSON 형식으로만 응답하라.
2. 'assistantResponse'는 항상 포함해야 하며, 사용자가 읽게 될 유일한 메시지라고 생각하고 작성하라.
3. 견적 정보가 변경되면 해당 필드를 업데이트하라.
4. '내일', '오후 3시' 등은 구체적인 값으로 변환하라.
5. assistantResponse가 길어질 경우 2~4개 단락으로 나누고, 필요하면 목록 형태(불릿/번호)를 사용해 가독성을 높여라.

응답 형식:
{
  "assistantResponse": "사용자 질문에 대한 답변 (없으면 null)",
  "origin": {"address": "...", ...},
  "destinations": [...],
  "vehicleType": "...",
  "scheduleType": "...",
  "departureTime": "...",
  "specialRequirements": [...],
  "notes": "..."
}`;

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({
        role: h.role === 'user' ? 'user' : 'assistant', // system role in history mapped to assistant or ignored? better map strictly valid openai roles
        content: h.content
      })).filter(m => m.role === 'user' || m.role === 'assistant'),
      { role: 'user', content: `[새로운 입력]: ${text.substring(0, 10000)}` },
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API 오류: ${response.status} - ${errorData.error?.message || '알 수 없는 오류'}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';

    let extractedData: ExtractedQuoteInfo;
    try {
      extractedData = JSON.parse(content);
    } catch (parseError) {
      // JSON 파싱 실패 시 휴리스틱 추출 시도
      return extractQuoteInfoWithHeuristic(text);
    }

    extractedData = normalizeExtractedQuoteInfo(extractedData);

    // 신뢰도 점수 계산 (간단한 휴리스틱)
    let confidenceScore = 0.5; // 기본값
    if (extractedData.origin?.address) confidenceScore += 0.1;
    if (extractedData.destinations && extractedData.destinations.length > 0) confidenceScore += 0.2;
    if (extractedData.pricing?.totalPrice) confidenceScore += 0.1;
    if (extractedData.vehicleType) confidenceScore += 0.05;
    if (extractedData.totalDistance) confidenceScore += 0.05;
    confidenceScore = Math.min(0.95, confidenceScore); // 최대 0.95

    return {
      extractedData,
      confidenceScore,
    };
  } catch (error) {
    console.error('LLM 추출 실패:', error);
    // LLM 실패 시 휴리스틱 추출 시도
    return extractQuoteInfoWithHeuristic(text);
  }
}

/**
 * 휴리스틱 방법으로 견적안 정보 추출 (폴백)
 */
export function extractQuoteInfoWithHeuristic(text: string): {
  extractedData: ExtractedQuoteInfo;
  confidenceScore: number;
} {
  const extractedData: ExtractedQuoteInfo = {};
  let confidenceScore = 0.3; // 기본 낮은 신뢰도

  // 주소 패턴 찾기 (한국 주소 형식)
  const addressPattern = /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[\s\S]*?(시|도|구|군|동|로|길|번지|아파트|빌라|건물)/g;
  const addresses = text.match(addressPattern) || [];

  if (addresses.length > 0 && addresses[0]) {
    extractedData.origin = { address: addresses[0] };
    if (addresses.length > 1) {
      extractedData.destinations = addresses.slice(1).map(addr => ({
        address: addr.trim(),
      }));
    }
    confidenceScore += 0.2;
  }

  // 시간 패턴 찾기 (HH:mm 형식)
  const timePattern = /\b([01]?[0-9]|2[0-3]):([0-5][0-9])\b/g;
  const times = text.match(timePattern) || [];
  if (times.length > 0) {
    extractedData.departureTime = times[0];
    confidenceScore += 0.1;
  }

  // 금액 패턴 찾기 (숫자 + 원, 만원, 천원 등)
  const pricePattern = /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(원|만원|천원|만|천)/gi;
  const prices = text.match(pricePattern) || [];
  if (prices.length > 0 && prices[0]) {
    const priceStr = prices[0].replace(/[^0-9]/g, '');
    const price = parseInt(priceStr, 10);
    if (!isNaN(price)) {
      extractedData.pricing = { totalPrice: price };
      confidenceScore += 0.1;
    }
  }

  // 차량 타입 찾기
  if (/레이|RAY/i.test(text)) {
    extractedData.vehicleType = '레이';
    confidenceScore += 0.05;
  } else if (/스타렉스|STAREX/i.test(text)) {
    extractedData.vehicleType = '스타렉스';
    confidenceScore += 0.05;
  }

  // 거리 패턴 찾기 (km)
  const distancePattern = /(\d+(?:\.\d+)?)\s*(km|킬로미터|키로)/gi;
  const distances = text.match(distancePattern);
  if (distances && distances.length > 0) {
    const distStr = distances[0].replace(/[^0-9.]/g, '');
    const distance = parseFloat(distStr);
    if (!isNaN(distance)) {
      extractedData.totalDistance = distance;
      confidenceScore += 0.05;
    }
  }

  confidenceScore = Math.min(0.7, confidenceScore); // 휴리스틱 최대 0.7

  return {
    extractedData: normalizeExtractedQuoteInfo(extractedData),
    confidenceScore,
  };
}

/**
 * 텍스트에서 견적안 정보 추출 (LLM 우선, 실패 시 휴리스틱)
 */
export async function extractQuoteInfo(
  text: string,
  preferLLM: boolean = true,
  history: ChatHistoryItem[] = []
): Promise<{
  extractedData: ExtractedQuoteInfo;
  confidenceScore: number;
  method: ExtractionMethod;
}> {
  if (preferLLM) {
    try {
      const result = await extractQuoteInfoWithLLM(text, history);
      return {
        ...result,
        extractedData: normalizeExtractedQuoteInfo(result.extractedData),
        method: 'llm',
      };
    } catch (error) {
      console.warn('LLM 추출 실패, 휴리스틱으로 폴백:', error);
      const result = extractQuoteInfoWithHeuristic(text);
      return {
        ...result,
        extractedData: normalizeExtractedQuoteInfo(result.extractedData),
        method: 'heuristic',
      };
    }
  } else {
    const result = extractQuoteInfoWithHeuristic(text);
    return {
      ...result,
      extractedData: normalizeExtractedQuoteInfo(result.extractedData),
      method: 'heuristic',
    };
  }
}

