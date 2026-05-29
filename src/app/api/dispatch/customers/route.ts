import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';

/**
 * 고객사(화주) 마스터 조회/생성 API.
 *
 * GET : 회사명 검색(q) 또는 최근 고객사 목록.
 * POST: 신규 고객사 생성.
 */

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const limit = Math.min(50, parseInt(searchParams.get('limit') || '20', 10));

    let query = supabase
      .from('customers')
      .select('id, company_name, contact_name, email, phone, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (q) query = query.ilike('company_name', `%${q}%`);

    const { data, error } = await query;
    if (error) {
      console.error('고객사 조회 실패:', error.message);
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: '조회에 실패했습니다.' } },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, data: { customers: data || [] } });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: e instanceof Error ? e.message : 'unknown' } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json();
    const companyName = String(body?.company_name || '').trim();
    if (!companyName) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: '회사명이 필요합니다.' } },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('customers')
      .insert([
        {
          company_name: companyName,
          contact_name: body?.contact_name ?? null,
          email: body?.email ?? null,
          phone: body?.phone ?? null,
          memo: body?.memo ?? null,
          created_by: body?.userId ? String(body.userId) : null,
        },
      ])
      .select('id, company_name')
      .single();

    if (error || !data) {
      console.error('고객사 생성 실패:', error?.message);
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: '고객사 생성에 실패했습니다.' } },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: e instanceof Error ? e.message : 'unknown' } },
      { status: 500 }
    );
  }
}
