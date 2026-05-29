/**
 * 견적 에이전트 골든셋.
 *
 * 기존 chatEvalCases가 "정규식 추출 결과"를 검증했다면, 본 셋은 추론 에이전트의
 * "최종 산출물"(시나리오 비교 구성, 견적 존재, 명확화 과용 여부)을 검증한다.
 * 형식이 제각각인 실제 요청(메일/표/줄바꿈)을 일부러 섞었다.
 */

export interface AgentEvalExpectation {
  /** compare_scenarios로 묶여야 하는 시나리오 수(다중 비교 케이스). */
  scenarioCount?: number;
  /** 라벨별 기대 pickup 수. 예: { "3개 지점": 3 }. */
  scenarioPickups?: Record<string, number>;
  /** 모든 시나리오/견적에 등장해야 하는 주소 토큰. */
  mustContainAddresses?: string[];
  /** 단일 견적이 산출돼야 하는가. */
  shouldHaveQuote?: boolean;
  /** 연 환산(정기) 비용이 제시돼야 하는가. */
  shouldBeRecurring?: boolean;
  /** 이 케이스에서 명확화 질문(ask_user)을 하지 말아야 하는가. */
  shouldNotAskUser?: boolean;
  /** 명확화 질문이 와야 하는가(정보가 정말 부족한 케이스). */
  shouldAskUser?: boolean;
}

export interface AgentEvalCase {
  id: string;
  input: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  expected: AgentEvalExpectation;
}

const TERRACYCLE_MULTI = `요청 업무

(1) 스마트흡연부스 내 수거함에서 모인 전자담배디바이스 수거 (수거량에 수거 지점 표시)
(2) 수거함 열쇠 관리
- 수거 예상물량: 1곳당 10~20kg
수거 주기
: 3개월 1회 - 연간 4회로 견적 산정 부탁드립니다.

1) 3개 지점 수거 후 지정 장소 하차
노원구청, 송파구청, 강서구청 - 문래역 하차

2) 5개 지점 수거 후 지정 장소 하차
노원구청, 송파구청, 종로구청, 마포구청 관악구청 - 문래역 하차

3) 10개 지점 수거 후 지정 장소 하차
노원구청, 강동구청, 송파구청, 종로구청, 은평구청,
마포구청, 서초구청, 강서구청, 금천구청, 구로구청 - 문래역 하차`;

export const AGENT_EVAL_CASES: AgentEvalCase[] = [
  {
    id: 'terracycle-3-5-10-quarterly',
    input: TERRACYCLE_MULTI,
    expected: {
      scenarioCount: 3,
      scenarioPickups: { '3개 지점': 3, '5개 지점': 5, '10개 지점': 10 },
      mustContainAddresses: ['문래'],
      shouldBeRecurring: true,
      shouldNotAskUser: true,
    },
  },
  {
    id: 'simple-single-quote',
    input: '강남역에서 판교역까지 레이로 한 건 견적내줘',
    expected: { shouldHaveQuote: true, shouldNotAskUser: true },
  },
  {
    id: 'multi-pickup-single-drop-plain',
    input:
      '수거지: 서울시 서초구 반포대로 21길 17, 성동구 성수일로 10, 용산구 독서당로 71\n전부 마포구 월드컵북로 396으로 하차해줘. 스타렉스로.',
    expected: { shouldHaveQuote: true, mustContainAddresses: ['월드컵북로 396'], shouldNotAskUser: true },
  },
  {
    id: 'two-scenarios-comparison',
    input:
      'A안) 강남역, 역삼역 수거 후 문정역 하차\nB안) 강남역, 역삼역, 선릉역 수거 후 문정역 하차\n둘 비교해줘',
    expected: { scenarioCount: 2, shouldNotAskUser: true },
  },
  {
    id: 'truly-ambiguous-needs-clarify',
    input: '견적 좀 내줘',
    expected: { shouldAskUser: true },
  },
  {
    id: 'weekly-recurring',
    input: '서울시청에서 문정역까지 주 2회 정기 배송 레이 견적',
    expected: { shouldHaveQuote: true, shouldBeRecurring: true, shouldNotAskUser: true },
  },
];
