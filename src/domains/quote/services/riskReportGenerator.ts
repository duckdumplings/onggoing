// 리스크 리포트 생성 서비스

import { ExtractedQuoteInfo } from '../types/quoteExtraction';
import { RouteValidationResult, RiskItem } from './routeValidator';
import { RiskSummary } from '../types/riskReport';

/**
 * LLM을 사용하여 리스크 리포트 생성
 */
export async function generateRiskReport(
  extractedData: ExtractedQuoteInfo,
  validationResult: RouteValidationResult
): Promise<{ reportContent: string; riskSummary: RiskSummary }> {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    throw new Error('OpenAI API 키가 설정되지 않았습니다');
  }

  // 리스크 요약 생성
  const riskSummary: RiskSummary = {
    totalRisks: validationResult.risks.length,
    highRisks: validationResult.risks.filter(r => r.severity === 'high').length,
    mediumRisks: validationResult.risks.filter(r => r.severity === 'medium').length,
    lowRisks: validationResult.risks.filter(r => r.severity === 'low').length,
    riskScore: validationResult.riskScore,
    categories: {
      timeViolations: validationResult.risks.filter(r => r.type === 'TIME_VIOLATION').length,
      distanceMismatches: validationResult.risks.filter(r => r.type === 'DISTANCE_MISMATCH').length,
      scheduleUncertainties: validationResult.risks.filter(r => r.type === 'SCHEDULE_UNCERTAIN').length,
    },
  };

  const systemPrompt = `너는 물류 전문가로서 견적안 리스크 분석 리포트를 작성해줘.

다음 정보를 바탕으로 상세하고 전문적인 리스크 분석 리포트를 작성해줘:

1. **경로 검증 결과 요약**
   - 총 거리: ${(validationResult.totalDistance / 1000).toFixed(2)}km
   - 총 이동 시간: ${Math.round(validationResult.totalTime / 60)}분
   - 총 체류 시간: ${Math.round(validationResult.totalDwellTime / 60)}분
   - 총 소요 시간: ${Math.round(validationResult.totalTimeWithDwell / 60)}분

2. **리스크 항목 분석**
   - 리스크 점수: ${validationResult.riskScore}/100
   - 발견된 리스크 항목 수: ${validationResult.risks.length}개
   - 각 리스크 항목의 유형, 심각도, 세부 내용

3. **시간 일정 분석**
   - 배송 시간 목표 준수 가능성
   - 지연 위험 지역
   - 시간 여유 부족 경유지

4. **비용 적정성 검토**
   - 제시된 운임과 실제 소요 시간/거리 비교
   - 비용 대비 효율성 평가

5. **경로 효율성 평가**
   - 경로 최적화 여지
   - 개선 제안

6. **제약조건 준수 여부**
   - 시간 제약 준수
   - 차량 용량 제약
   - 특별 요구사항 준수

7. **종합 평가 및 권장사항**
   - 전체적인 견적안 평가
   - 수락/수정/거부 권장 사항
   - 개선 제안

한국어로 작성하고, 마크다운 형식을 사용해줘. 전문적이면서도 이해하기 쉽게 작성해줘.`;

  const userPrompt = `## 추출된 견적 정보

${JSON.stringify(extractedData, null, 2)}

## 경로 검증 결과

- 리스크 점수: ${validationResult.riskScore}/100
- 총 거리: ${(validationResult.totalDistance / 1000).toFixed(2)}km
- 총 이동 시간: ${Math.round(validationResult.totalTime / 60)}분
- 총 체류 시간: ${Math.round(validationResult.totalDwellTime / 60)}분
- 총 소요 시간: ${Math.round(validationResult.totalTimeWithDwell / 60)}분

## 발견된 리스크 항목

${validationResult.risks.map((risk, idx) => `
### ${idx + 1}. ${risk.message}
- 유형: ${risk.type}
- 심각도: ${risk.severity}
${risk.details ? `- 세부사항: ${JSON.stringify(risk.details, null, 2)}` : ''}
`).join('\n')}

위 정보를 바탕으로 상세한 리스크 분석 리포트를 작성해줘.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API 오류: ${response.status} - ${errorData.error?.message || '알 수 없는 오류'}`);
    }

    const data = await response.json();
    const reportContent = data.choices?.[0]?.message?.content || '';

    if (!reportContent) {
      throw new Error('리포트 내용이 생성되지 않았습니다');
    }

    return {
      reportContent,
      riskSummary,
    };
  } catch (error) {
    console.error('리스크 리포트 생성 실패:', error);
    throw error;
  }
}



