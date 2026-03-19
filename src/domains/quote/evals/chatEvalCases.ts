export type ChatEvalCase = {
  id: string;
  input: string;
  expected: {
    shouldInferIntent?: 'quote' | 'route' | 'document' | 'general';
    shouldHaveOrigin?: boolean;
    shouldHaveDestination?: boolean;
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
];

