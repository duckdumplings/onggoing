import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';

interface CustomerDeliveryData {
  origin: {
    address: string;
    latitude?: number;
    longitude?: number;
  };
  destinations: Array<{
    address: string;
    latitude?: number;
    longitude?: number;
    deliveryTime?: string; // HH:mm
    dwellMinutes?: number;
  }>;
  vehicleType: '레이' | '스타렉스';
  scheduleType?: 'regular' | 'ad-hoc';
  departureTime?: string; // ISO string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerData } = body as { customerData: CustomerDeliveryData };

    if (!customerData || !customerData.origin || !customerData.destinations || customerData.destinations.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: '출발지와 목적지 정보가 필요합니다',
          },
        },
        { status: 400 }
      );
    }

    // 1. 경로 최적화 실행
    // 내부 API를 직접 호출하기 위해 Next.js의 내부 라우트를 사용
    // 프로덕션 환경에서는 내부 함수를 직접 import하여 사용하는 것을 권장
    const baseUrl = request.headers.get('host') 
      ? `${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('host')}`
      : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    
    const routeOptimizationRes = await fetch(
      `${baseUrl}/api/route-optimization`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origins: [customerData.origin.address],
          destinations: customerData.destinations.map(d => d.address),
          vehicleType: customerData.vehicleType,
          optimizeOrder: true,
          useRealtimeTraffic: true,
          departureAt: customerData.departureTime || new Date().toISOString(),
          deliveryTimes: customerData.destinations.map(d => d.deliveryTime || ''),
          isNextDayFlags: new Array(customerData.destinations.length).fill(false),
          dwellMinutes: customerData.destinations.map(d => d.dwellMinutes || 10),
        }),
      }
    );

    if (!routeOptimizationRes.ok) {
      const errorData = await routeOptimizationRes.json();
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ROUTE_OPTIMIZATION_ERROR',
            message: errorData.error || '경로 최적화에 실패했습니다',
          },
        },
        { status: 500 }
      );
    }

    const routeData = await routeOptimizationRes.json();
    if (!routeData.success || !routeData.data) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ROUTE_OPTIMIZATION_ERROR',
            message: '경로 최적화 결과가 올바르지 않습니다',
          },
        },
        { status: 500 }
      );
    }

    const routeSummary = routeData.data.summary || {};
    const totalDistance = routeSummary.totalDistance || 0; // meters
    const totalTime = routeSummary.totalTime || 0; // seconds
    const travelTime = routeSummary.travelTime || totalTime;
    const dwellTime = routeSummary.dwellTime || 0;

    // 2. 견적 계산
    const quoteCalculationRes = await fetch(
      `${baseUrl}/api/quote-calculation`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distance: totalDistance,
          time: travelTime,
          vehicleType: customerData.vehicleType,
          dwellMinutes: customerData.destinations.map(d => d.dwellMinutes || 10),
          stopsCount: customerData.destinations.length,
          scheduleType: customerData.scheduleType || 'ad-hoc',
        }),
      }
    );

    if (!quoteCalculationRes.ok) {
      const errorData = await quoteCalculationRes.json();
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'QUOTE_CALCULATION_ERROR',
            message: errorData.error?.message || '견적 계산에 실패했습니다',
          },
        },
        { status: 500 }
      );
    }

    const quoteData = await quoteCalculationRes.json();
    if (!quoteData.success || !quoteData.data) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'QUOTE_CALCULATION_ERROR',
            message: '견적 계산 결과가 올바르지 않습니다',
          },
        },
        { status: 500 }
      );
    }

    // 3. PDF 생성 (옵션)
    let pdfUrl: string | null = null;
    try {
      const pdfRes = await fetch(
        `${baseUrl}/api/quote/pdf`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            totalPrice: quoteData.data.totalPrice,
            breakdown: quoteData.data.breakdown,
            distance: totalDistance,
            time: totalTime,
            vehicleType: customerData.vehicleType,
            dwellMinutes: customerData.destinations.map(d => d.dwellMinutes || 10),
            origins: [customerData.origin],
            destinations: customerData.destinations,
            scheduleType: customerData.scheduleType || 'ad-hoc',
          }),
        }
      );

      if (pdfRes.ok) {
        const pdfBlob = await pdfRes.blob();
        // PDF를 Supabase Storage에 저장하거나 클라이언트에 반환
        // 여기서는 간단히 base64로 인코딩하여 반환
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(pdfBlob);
        });
        pdfUrl = base64;
      }
    } catch (pdfError) {
      console.warn('PDF 생성 실패 (선택사항):', pdfError);
      // PDF 생성 실패는 견적 생성 실패로 간주하지 않음
    }

    // 4. 결과를 quotes 테이블에 저장 (선택사항)
    const supabase = createServerClient();
    const quoteNumber = `Q-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;

    const { data: savedQuote, error: saveError } = await supabase
      .from('quotes')
      .insert([
        {
          quote_number: quoteNumber,
          quote_type: customerData.scheduleType === 'regular' ? 'per_delivery' : 'quick_single',
          origin_address: customerData.origin.address,
          destination_address: customerData.destinations.map(d => d.address).join(', '),
          distance: totalDistance / 1000, // km
          estimated_time: Math.round(totalTime / 60), // minutes
          base_fare: quoteData.data.breakdown?.baseRate || 0,
          additional_fare: (quoteData.data.breakdown?.distanceCharge || 0) + (quoteData.data.breakdown?.timeCharge || 0),
          total_fare: quoteData.data.totalPrice,
          vehicle_type: customerData.vehicleType,
          status: 'draft',
          valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7일 후
        },
      ])
      .select()
      .single();

    if (saveError) {
      console.warn('견적 저장 실패 (선택사항):', saveError);
      // 저장 실패는 견적 생성 실패로 간주하지 않음
    }

    return NextResponse.json({
      success: true,
      data: {
        quoteId: savedQuote?.id || null,
        quoteNumber: quoteNumber,
        totalPrice: quoteData.data.totalPrice,
        breakdown: quoteData.data.breakdown,
        routeData: routeData.data,
        distance: totalDistance,
        time: totalTime,
        pdfUrl: pdfUrl,
      },
    });
  } catch (error) {
    console.error('견적 생성 API 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : '견적 생성에 실패했습니다',
        },
      },
      { status: 500 }
    );
  }
}

