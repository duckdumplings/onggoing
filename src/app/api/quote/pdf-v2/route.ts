import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      totalPrice,
      breakdown,
      distance,
      time,
      vehicleType,
      dwellMinutes,
      origins,
      destinations,
      scheduleType = 'ad-hoc'
    } = body;

    // 간단한 텍스트 기반 PDF 생성 (jsPDF 호환)
    const pdfContent = `
견적서 생성일시: ${new Date().toLocaleString('ko-KR')}

==========================================
           옹고잉 물류 견적서
==========================================

총 견적: ${totalPrice}

[견적 요약]
차량 타입: ${vehicleType || '레이'}
총 거리: ${(distance / 1000).toFixed(1)}km
총 시간: ${Math.ceil(time / 60)}분
경유지 수: ${destinations?.length || 0}개
스케줄 타입: ${scheduleType === 'regular' ? '정기' : '비정기'}

[경로 정보]
${origins?.[0] ? `출발지: ${origins[0].address || origins[0]}` : ''}
${destinations?.map((dest: any, index: number) => `경유지 ${index + 1}: ${dest.address || dest}`).join('\n') || ''}

${breakdown ? `
[상세 내역]
기본 요금: ${breakdown.baseRate ? `₩${breakdown.baseRate.toLocaleString()}` : '-'}
거리 요금: ${breakdown.distanceCharge ? `₩${breakdown.distanceCharge.toLocaleString()}` : '-'}
시간 요금: ${breakdown.timeCharge ? `₩${breakdown.timeCharge.toLocaleString()}` : '-'}
체류 시간: ${breakdown.dwellCharge ? `₩${breakdown.dwellCharge.toLocaleString()}` : '-'}
연료비: ${breakdown.fuel?.fuelCost ? `₩${breakdown.fuel.fuelCost.toLocaleString()}` : '-'}
` : ''}

[요금제 비교]
• 시간당 요금제: 기본시간 + 시간당 가중치 요금
• 단건 요금제: 거리별 기본 요금 + 경유지 정액
• 건당 요금제: 배송 건당 고정 요금

[약관 및 주의사항]
• 본 견적은 출발 시점 기준으로 계산되었습니다.
• 실제 요금은 교통 상황, 연료 가격 변동 등에 따라 달라질 수 있습니다.
• 견적 유효기간은 발행일로부터 7일입니다.
• 문의사항: 02-1234-5678 | 이메일: info@ongoing.co.kr

==========================================
옹고잉 물류 | 사업자등록번호: 123-45-67890 | 대표: 홍길동
==========================================
`;

    // 파일명 생성
    const now = new Date();
    const filename = `quote_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.txt`;

    // 텍스트 파일로 반환 (PDF 변환을 위한 임시 해결책)
    return new NextResponse(pdfContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': Buffer.byteLength(pdfContent, 'utf8').toString()
      }
    });

  } catch (error) {
    console.error('견적서 생성 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: '견적서 생성에 실패했습니다. 다시 시도해주세요.'
      },
      { status: 500 }
    );
  }
}
