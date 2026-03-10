import { NextRequest, NextResponse } from 'next/server';
import { ExtractedQuoteInfo } from '@/domains/quote/types/quoteExtraction';

interface CompareQuotesRequest {
  customerQuote: ExtractedQuoteInfo; // 화주사 견적안
  ourQuote: {
    totalPrice: number;
    distance: number;
    time: number;
    breakdown?: {
      baseRate?: number;
      distanceCharge?: number;
      timeCharge?: number;
    };
  }; // 우리 견적안
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerQuote, ourQuote } = body as CompareQuotesRequest;

    if (!customerQuote || !ourQuote) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: '비교할 두 견적안이 필요합니다',
          },
        },
        { status: 400 }
      );
    }

    // 비용 비교
    const customerPrice = customerQuote.pricing?.totalPrice || 0;
    const ourPrice = ourQuote.totalPrice || 0;
    const priceDifference = ourPrice - customerPrice;
    const priceDifferencePercent = customerPrice > 0 
      ? (priceDifference / customerPrice) * 100 
      : 0;

    // 거리 비교
    const customerDistance = customerQuote.totalDistance || 0;
    const ourDistance = ourQuote.distance ? ourQuote.distance / 1000 : 0; // meters to km
    const distanceDifference = ourDistance - customerDistance;
    const distanceDifferencePercent = customerDistance > 0
      ? (distanceDifference / customerDistance) * 100
      : 0;

    // 시간 비교
    const customerTime = customerQuote.totalTime || 0; // minutes
    const ourTime = ourQuote.time ? Math.round(ourQuote.time / 60) : 0; // seconds to minutes
    const timeDifference = ourTime - customerTime;
    const timeDifferencePercent = customerTime > 0
      ? (timeDifference / customerTime) * 100
      : 0;

    // 차이점 하이라이트
    const differences = [];

    if (Math.abs(priceDifferencePercent) > 5) {
      differences.push({
        category: 'cost',
        label: '비용',
        customerValue: customerPrice,
        ourValue: ourPrice,
        difference: priceDifference,
        differencePercent: priceDifferencePercent,
        severity: Math.abs(priceDifferencePercent) > 20 ? 'high' : 'medium',
      });
    }

    if (Math.abs(distanceDifferencePercent) > 10) {
      differences.push({
        category: 'distance',
        label: '거리',
        customerValue: customerDistance,
        ourValue: ourDistance,
        difference: distanceDifference,
        differencePercent: distanceDifferencePercent,
        severity: Math.abs(distanceDifferencePercent) > 30 ? 'high' : 'medium',
      });
    }

    if (Math.abs(timeDifferencePercent) > 10) {
      differences.push({
        category: 'time',
        label: '시간',
        customerValue: customerTime,
        ourValue: ourTime,
        difference: timeDifference,
        differencePercent: timeDifferencePercent,
        severity: Math.abs(timeDifferencePercent) > 30 ? 'high' : 'medium',
      });
    }

    // 종합 평가
    const overallAssessment = {
      recommendation: priceDifferencePercent < -5 ? 'accept' : priceDifferencePercent > 20 ? 'reject' : 'review',
      confidence: differences.length === 0 ? 'high' : differences.filter(d => d.severity === 'high').length > 0 ? 'low' : 'medium',
      summary: differences.length === 0
        ? '두 견적안이 유사합니다'
        : priceDifferencePercent < 0
        ? `우리 견적이 약 ${Math.abs(priceDifferencePercent).toFixed(1)}% 더 저렴합니다`
        : `우리 견적이 약 ${priceDifferencePercent.toFixed(1)}% 더 비쌉니다`,
    };

    return NextResponse.json({
      success: true,
      data: {
        comparison: {
          price: {
            customer: customerPrice,
            ours: ourPrice,
            difference: priceDifference,
            differencePercent: priceDifferencePercent,
          },
          distance: {
            customer: customerDistance,
            ours: ourDistance,
            difference: distanceDifference,
            differencePercent: distanceDifferencePercent,
          },
          time: {
            customer: customerTime,
            ours: ourTime,
            difference: timeDifference,
            differencePercent: timeDifferencePercent,
          },
        },
        differences,
        overallAssessment,
      },
    });
  } catch (error) {
    console.error('견적 비교 API 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'COMPARISON_ERROR',
          message: error instanceof Error ? error.message : '견적 비교에 실패했습니다',
        },
      },
      { status: 500 }
    );
  }
}



