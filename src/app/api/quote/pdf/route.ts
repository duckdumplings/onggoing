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

    // HTML 기반 견적서 생성
    const htmlContent = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>옹고잉 물류 견적서</title>
    <style>
        @page {
            size: A4;
            margin: 1.5cm;
        }
        @media print {
            body {
                -webkit-print-color-adjust: exact !important;
                color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .total-price {
                background: #059669 !important;
                -webkit-print-color-adjust: exact !important;
            }
            .route-info {
                background: #f0f9ff !important;
                -webkit-print-color-adjust: exact !important;
            }
            .info-item {
                background: #f8fafc !important;
                -webkit-print-color-adjust: exact !important;
            }
        }
        body {
            font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 20px;
        }
        .header {
            text-align: center;
            border-bottom: 3px solid #1f2937;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .company-name {
            font-size: 28px;
            font-weight: bold;
            color: #1f2937;
            margin-bottom: 10px;
        }
        .subtitle {
            font-size: 16px;
            color: #6b7280;
        }
        .total-price {
            text-align: center;
            background: linear-gradient(135deg, #059669, #10b981);
            color: white;
            padding: 30px;
            border-radius: 15px;
            margin: 30px 0;
            font-size: 32px;
            font-weight: bold;
        }
        .section {
            margin: 25px 0;
        }
        .section-title {
            font-size: 20px;
            font-weight: bold;
            color: #1f2937;
            border-left: 4px solid #3b82f6;
            padding-left: 15px;
            margin-bottom: 15px;
        }
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin: 15px 0;
        }
        .info-item {
            background: #f8fafc;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
        }
        .info-label {
            font-weight: bold;
            color: #64748b;
            font-size: 14px;
            margin-bottom: 5px;
        }
        .info-value {
            font-size: 16px;
            color: #1f2937;
        }
        .route-info {
            background: #f0f9ff;
            padding: 20px;
            border-radius: 10px;
            border: 1px solid #bae6fd;
        }
        .route-item {
            display: flex;
            align-items: center;
            margin: 10px 0;
            padding: 10px;
            background: white;
            border-radius: 6px;
        }
        .route-icon {
            font-size: 20px;
            margin-right: 15px;
            width: 30px;
            text-align: center;
        }
        .route-text {
            flex: 1;
        }
        .breakdown-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }
        .breakdown-table th,
        .breakdown-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e5e7eb;
        }
        .breakdown-table th {
            background: #f9fafb;
            font-weight: bold;
            color: #374151;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #9ca3af;
            font-size: 12px;
        }
        .page-number {
            text-align: center;
            margin-top: 20px;
            color: #9ca3af;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="company-name">옹고잉 물류</div>
        <div class="subtitle">스마트 경로 최적화 견적서</div>
    </div>

    <div class="total-price">
        총 견적: ${totalPrice}
    </div>

    <div class="section">
        <div class="section-title">견적 요약</div>
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">차량 타입</div>
                <div class="info-value">${vehicleType || '레이'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">총 거리</div>
                <div class="info-value">${(distance / 1000).toFixed(1)}km</div>
            </div>
            <div class="info-item">
                <div class="info-label">총 시간</div>
                <div class="info-value">${Math.ceil(time / 60)}분</div>
            </div>
            <div class="info-item">
                <div class="info-label">경유지 수</div>
                <div class="info-value">${destinations?.length || 0}개</div>
            </div>
            <div class="info-item">
                <div class="info-label">스케줄 타입</div>
                <div class="info-value">${scheduleType === 'regular' ? '정기' : '비정기'}</div>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">경로 정보</div>
        <div class="route-info">
            ${origins?.[0] ? `
            <div class="route-item">
                <div class="route-icon">🚚</div>
                <div class="route-text">
                    <strong>출발지:</strong> ${origins[0].address || origins[0]}
                </div>
            </div>
            ` : ''}
            ${destinations?.map((dest: any, index: number) => `
            <div class="route-item">
                <div class="route-icon">📍</div>
                <div class="route-text">
                    <strong>경유지 ${index + 1}:</strong> ${dest.address || dest}
                </div>
            </div>
            `).join('') || ''}
        </div>
    </div>

    ${breakdown ? `
    <div class="section">
        <div class="section-title">상세 내역</div>
        <table class="breakdown-table">
            <thead>
                <tr>
                    <th>항목</th>
                    <th>금액</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>기본 요금</td>
                    <td>${breakdown.baseRate ? `₩${breakdown.baseRate.toLocaleString()}` : '-'}</td>
                </tr>
                <tr>
                    <td>거리 요금</td>
                    <td>${breakdown.distanceCharge ? `₩${breakdown.distanceCharge.toLocaleString()}` : '-'}</td>
                </tr>
                <tr>
                    <td>시간 요금</td>
                    <td>${breakdown.timeCharge ? `₩${breakdown.timeCharge.toLocaleString()}` : '-'}</td>
                </tr>
                <tr>
                    <td>체류 시간</td>
                    <td>${breakdown.dwellCharge ? `₩${breakdown.dwellCharge.toLocaleString()}` : '-'}</td>
                </tr>
                <tr>
                    <td>연료비</td>
                    <td>${breakdown.fuel?.fuelCost ? `₩${breakdown.fuel.fuelCost.toLocaleString()}` : '-'}</td>
                </tr>
            </tbody>
        </table>
    </div>
    ` : ''}

    <div class="section">
        <div class="section-title">요금제 비교</div>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <p style="margin: 8px 0; color: #64748b;">• 시간당 요금제: 기본시간 + 시간당 가중치 요금</p>
            <p style="margin: 8px 0; color: #64748b;">• 단건 요금제: 거리별 기본 요금 + 경유지 정액</p>
            <p style="margin: 8px 0; color: #64748b;">• 건당 요금제: 배송 건당 고정 요금</p>
        </div>
    </div>

    <div class="section">
        <div class="section-title">약관 및 주의사항</div>
        <div style="background: #fef3c7; padding: 20px; border-radius: 8px; border: 1px solid #fbbf24;">
            <p style="margin: 8px 0; color: #92400e;">• 본 견적은 출발 시점 기준으로 계산되었습니다.</p>
            <p style="margin: 8px 0; color: #92400e;">• 실제 요금은 교통 상황, 연료 가격 변동 등에 따라 달라질 수 있습니다.</p>
            <p style="margin: 8px 0; color: #92400e;">• 견적 유효기간은 발행일로부터 7일입니다.</p>
            <p style="margin: 8px 0; color: #92400e;">• 문의사항: 02-1234-5678 | 이메일: info@ongoing.co.kr</p>
        </div>
    </div>

    <div class="footer">
        <div>견적서 생성일시: ${new Date().toLocaleString('ko-KR')}</div>
        <div>옹고잉 물류 | 사업자등록번호: 123-45-67890 | 대표: 홍길동</div>
    </div>

    <div class="page-number">페이지 1</div>
</body>
</html>`;

    // 파일명 생성
    const now = new Date();
    const filename = `quote_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.html`;

    // HTML 파일로 반환 (브라우저에서 PDF로 변환 가능)
    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': Buffer.byteLength(htmlContent, 'utf8').toString()
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
