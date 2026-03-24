export type ChatEvalCase = {
  id: string;
  input: string;
  expected: {
    shouldInferIntent?: 'quote' | 'route' | 'document' | 'general';
    shouldHaveOrigin?: boolean;
    shouldHaveDestination?: boolean;
    minDestinationCount?: number;
    shouldUseStructuredMemo?: boolean;
    shouldContainAddresses?: string[];
  };
};

export const CHAT_EVAL_CASES: ChatEvalCase[] = [
  {
    id: 'quote-basic',
    input: '강남역에서 역삼역 가는 정기 배송 레이로 견적내줘',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
      minDestinationCount: 1,
    },
  },
  {
    id: 'document-intent',
    input: '업로드한 견적서 파일 요약해줘',
    expected: {
      shouldInferIntent: 'document',
    },
  },
  {
    id: 'general-intent',
    input: '우리 서비스 장점 정리해줘',
    expected: {
      shouldInferIntent: 'general',
    },
  },
  {
    id: 'memo-two-pickups-four-deliveries-one-return',
    input:
      '상차지: 서울시 서초구 반포대로 21길 17\n상차지: 서울특별시 성동구 성수일로10 1층 101호\n배송지: 서울시 용산구 독서당로 71 5층\n배송지: 서울 용산구 회나무로13가길 64\n배송지: 서울특별시 용산구 이태원로 27다길 50\n배송지: 서울특별시 용산구 한남동 740-10\n반납지: 서울특별시 금천구 가마산로 96',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
      minDestinationCount: 5,
      shouldUseStructuredMemo: true,
      shouldContainAddresses: ['반포대로 21길 17', '가마산로 96'],
    },
  },
  {
    id: 'tabular-raw-schedule-line',
    input:
      '하루반상 서울특별시 성동구 성수일로10 1충 101호 10:30 주식회사 그래픽 서울 용산구 회나무로13가길 64 11:30',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
      minDestinationCount: 1,
      shouldUseStructuredMemo: true,
    },
  },
  {
    id: 'route-intent-only',
    input: '이 경로 ETA랑 교통 반영 상태만 알려줘',
    expected: {
      shouldInferIntent: 'route',
    },
  },
  {
    id: 'quote-with-vehicle-only',
    input: '출발지 강남역 목적지 판교역 레이로 계산',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
    },
  },
  {
    id: 'quote-with-schedule-regular',
    input: '서울시청에서 문정역까지 정기 배송 견적',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
    },
  },
  {
    id: 'quote-with-ad-hoc',
    input: '오늘 비정기로 성수동에서 가산동 한 건만',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
    },
  },
  {
    id: 'address-with-brand-prefix',
    input: '출발지: 나이스 샐러드 서울시 서초구 반포대로 21길 17\n배송지: 아란의원 서울시 용산구 독서당로 71',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
      shouldUseStructuredMemo: true,
      shouldContainAddresses: ['독서당로 71'],
    },
  },
  {
    id: 'duplicate-destination-in-memo',
    input:
      '출발지: 서울특별시 성동구 성수일로10\n배송지: 서울 용산구 회나무로13가길 64\n배송지: 서울 용산구 회나무로13가길 64\n반납지: 서울특별시 금천구 가마산로 96',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
      minDestinationCount: 2,
      shouldUseStructuredMemo: true,
    },
  },
  {
    id: 'minimal-addresses',
    input: '강남구 테헤란로 152 에서 마포구 월드컵북로 396',
    expected: {
      shouldInferIntent: 'general',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
    },
  },
  {
    id: 'file-and-quote-mixed',
    input: '업로드한 엑셀 참고해서 강남->판교 견적 계산해줘',
    expected: {
      shouldInferIntent: 'document',
    },
  },
  {
    id: 'return-keyword-detection',
    input:
      '상차지: 서울시 서초구 반포대로 21길 17\n배송지: 서울시 용산구 독서당로 71\n반납지: 금천구 가마산로 96',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
      minDestinationCount: 2,
      shouldUseStructuredMemo: true,
    },
  },
  {
    id: 'time-window-memo',
    input:
      '출발지: 서울시 서초구 반포대로 21길 17\n배송지: 서울시 용산구 독서당로 71 11:30\n배송지: 서울 용산구 회나무로13가길 64 11:40',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
      minDestinationCount: 2,
      shouldUseStructuredMemo: true,
    },
  },
  {
    id: 'non-address-small-talk',
    input: '고마워 오늘도 잘 부탁해',
    expected: {
      shouldInferIntent: 'general',
      shouldHaveOrigin: false,
      shouldHaveDestination: false,
    },
  },
  {
    id: 'route-compare-options',
    input: '시간우선이랑 무료도로우선 비교해줘',
    expected: {
      shouldInferIntent: 'route',
    },
  },
  {
    id: 'multi-line-logistics-plain',
    input:
      '서울시 서초구 반포대로 21길 17 상차\n서울시 용산구 독서당로 71 배송\n서울 용산구 회나무로13가길 64 배송\n서울특별시 금천구 가마산로 96 반납',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
      minDestinationCount: 2,
      shouldUseStructuredMemo: true,
    },
  },
  {
    id: 'with-typo-floor',
    input: '출발지: 서울특별시 성동구 성수일로10 1충 101호\n목적지: 서울시 용산구 독서당로 71',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
      shouldUseStructuredMemo: true,
      shouldContainAddresses: ['성수일로10'],
    },
  },
  {
    id: 'quote-pricing-question',
    input: '레이 정기 기준으로 시간당/단건 각각 얼마야?',
    expected: {
      shouldInferIntent: 'quote',
    },
  },
  {
    id: 'docx-generation-request',
    input: '현재 대화 기준으로 docx 파일 만들어줘',
    expected: {
      shouldInferIntent: 'document',
    },
  },
  {
    id: 'json-generation-request',
    input: '견적 결과를 json으로 내려줘',
    expected: {
      shouldInferIntent: 'document',
    },
  },
  {
    id: 'explicit-counts-korean',
    input: '상차지 두 곳, 배송지 네 곳, 반납지 한 곳으로 계산해줘',
    expected: {
      shouldInferIntent: 'quote',
    },
  },
  {
    id: 'address-lot-style',
    input: '출발: 서울특별시 용산구 한남동 740-10\n도착: 서울특별시 금천구 가마산로 96',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
      shouldUseStructuredMemo: true,
    },
  },
  {
    id: 'multi-scenario-like-input',
    input:
      '1. 강남 라인: 출발 강남역, 도착 판교역\n2. 용산 라인: 출발 반포대로 21길 17, 도착 독서당로 71',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
    },
  },
  {
    id: 'attachment-summary-request',
    input: '첨부 문서에서 배송지 주소만 뽑아줘',
    expected: {
      shouldInferIntent: 'document',
    },
  },
  {
    id: 'pure-general-qna',
    input: '우리 서비스 강점 3가지만 알려줘',
    expected: {
      shouldInferIntent: 'general',
    },
  },
  {
    id: 'eta-with-departure-time',
    input: '출발지: 서울시 서초구 반포대로 21길 17\n목적지: 서울시 용산구 독서당로 71\n출발시간: 10:10',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
      shouldUseStructuredMemo: true,
    },
  },
  {
    id: 'route-with-return-only-line',
    input:
      '[회수]주식회사 그래픽 서울 용산구 회나무로13가길 64\n가산 반납지 금천구 가마산로 96',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveDestination: true,
      shouldUseStructuredMemo: true,
    },
  },
  {
    id: 'pricing-without-address',
    input: '정기 레이 기준 요금 테이블만 설명해줘',
    expected: {
      shouldInferIntent: 'quote',
    },
  },
  {
    id: 'chat-feedback-question',
    input: '아까 결과가 왜 틀렸는지 알려줘',
    expected: {
      shouldInferIntent: 'general',
    },
  },
  {
    id: 'short-address-command',
    input: '반포대로21길17 -> 독서당로71',
    expected: {
      shouldInferIntent: 'general',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
    },
  },
  {
    id: 'single-stop-quick',
    input: '출발지: 서울시 강남구 테헤란로 152\n목적지: 서울시 마포구 월드컵북로 396',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
      shouldUseStructuredMemo: true,
    },
  },
  {
    id: 'complex-memo-with-notes',
    input:
      '상차지: 서울시 서초구 반포대로 21길 17 / 가방 1~2개\n배송지: 서울시 용산구 독서당로 71 5층 아란의원 / 주5회\n특이사항: 1개월 시범운영 후 정규계약시 6개월',
    expected: {
      shouldInferIntent: 'quote',
      shouldHaveOrigin: true,
      shouldHaveDestination: true,
      shouldUseStructuredMemo: true,
      shouldContainAddresses: ['독서당로 71'],
    },
  },
];

