import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';
import type { ScenarioComparison } from '@/domains/dispatch/services/scenarioComparison';
import type { QuoteScenario } from '@/domains/dispatch/types/routePlan';

/**
 * 시나리오 비교 결과 저장/조회 API.
 *
 * POST: 비교 결과(+선택적 고객사)를 quote_scenario_groups / quote_scenarios에 저장.
 *       고객사는 customerId로 연결하거나 customer 객체로 신규 생성.
 * GET : 최근 시나리오 그룹과 개별 시나리오를 조회(customerId 필터 가능).
 */

interface CustomerInput {
  company_name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  memo?: string;
}

async function resolveCustomerId(
  supabase: ReturnType<typeof createServerClient>,
  customerId: string | undefined,
  customer: CustomerInput | undefined,
  userId: string | null
): Promise<string | null> {
  if (customerId) return customerId;
  if (!customer?.company_name) return null;
  const { data, error } = await supabase
    .from('customers')
    .insert([
      {
        company_name: customer.company_name,
        contact_name: customer.contact_name ?? null,
        email: customer.email ?? null,
        phone: customer.phone ?? null,
        memo: customer.memo ?? null,
        created_by: userId,
      },
    ])
    .select('id')
    .single();
  if (error) {
    console.error('고객사 생성 실패:', error.message);
    return null;
  }
  return data?.id ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json();

    const comparison = body?.comparison as ScenarioComparison | undefined;
    const scenarios = (Array.isArray(body?.scenarios) ? body.scenarios : []) as QuoteScenario[];
    if (!comparison || !Array.isArray(comparison.results) || comparison.results.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: '비교 결과가 필요합니다.' } },
        { status: 400 }
      );
    }

    const userId = body?.userId ? String(body.userId) : null;
    const customerId = await resolveCustomerId(supabase, body?.customerId, body?.customer, userId);

    const { data: group, error: groupError } = await supabase
      .from('quote_scenario_groups')
      .insert([
        {
          customer_id: customerId,
          title: body?.title ?? null,
          request_source: body?.requestSource ?? 'manual',
          sorted_by: comparison.sortedBy ?? 'annualPrice',
          recommended_label: comparison.recommendedLabel ?? null,
          created_by: userId,
        },
      ])
      .select('id')
      .single();

    if (groupError || !group) {
      console.error('시나리오 그룹 저장 실패:', groupError?.message);
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: '시나리오 그룹 저장에 실패했습니다.' } },
        { status: 500 }
      );
    }

    const stopsByLabel = new Map(scenarios.map((s) => [s.label, s]));
    const rows = comparison.results.map((r) => {
      const scenario = stopsByLabel.get(r.label);
      return {
        group_id: group.id,
        label: r.label,
        stops: scenario?.stops ?? [],
        vehicle_type: r.vehicleType,
        schedule_type: r.scheduleType,
        frequency: scenario?.frequency ?? null,
        total_km: r.metrics.km,
        drive_minutes: r.metrics.driveMinutes,
        dwell_minutes: r.metrics.dwellMinutes,
        stops_count: r.metrics.stopsCount,
        one_time_price: r.oneTimePrice,
        annual_price: r.annualPrice,
        breakdown: r.breakdown,
      };
    });

    const { error: rowsError } = await supabase.from('quote_scenarios').insert(rows);
    if (rowsError) {
      console.error('시나리오 저장 실패:', rowsError.message);
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: '시나리오 저장에 실패했습니다.' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: { groupId: group.id, customerId } });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: e instanceof Error ? e.message : 'unknown' } },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, parseInt(searchParams.get('limit') || '20', 10));
    const customerId = searchParams.get('customerId');

    let query = supabase
      .from('quote_scenario_groups')
      .select(
        `id, title, request_source, sorted_by, recommended_label, customer_id, created_at,
         quote_scenarios ( id, label, vehicle_type, schedule_type, total_km, one_time_price, annual_price, frequency )`
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (customerId) query = query.eq('customer_id', customerId);

    const { data, error } = await query;
    if (error) {
      console.error('시나리오 그룹 조회 실패:', error.message);
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: '조회에 실패했습니다.' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: { groups: data || [] } });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: e instanceof Error ? e.message : 'unknown' } },
      { status: 500 }
    );
  }
}
