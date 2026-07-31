import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveUserIdFromRequest, unauthorizedResponse } from '@/app/api/quote/_auth';
import {
  createSavedQuote,
  getSavedQuote,
  listSavedQuotes,
  SaveQuoteInputSchema,
} from '@/domains/quote/services/savedQuoteService';

const SavedQuoteIdSchema = z.string().uuid();

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(request);
    if (!userId) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (id) {
      const parsedId = SavedQuoteIdSchema.safeParse(id);
      if (!parsedId.success) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: '견적 기록 ID가 올바르지 않습니다.' } },
          { status: 400 },
        );
      }
      const quote = await getSavedQuote(parsedId.data);
      if (!quote) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: '견적 기록을 찾을 수 없습니다.' } },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true, data: quote });
    }

    const rawLimit = Number(searchParams.get('limit') || 50);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 100) : 50;
    return NextResponse.json({ success: true, data: await listSavedQuotes(limit) });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'QUERY_FAILED',
          message: error instanceof Error ? error.message : '견적 기록 조회에 실패했습니다.',
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(request);
    if (!userId) return unauthorizedResponse();

    const parsed = SaveQuoteInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message || '저장할 견적을 확인해 주세요.',
          },
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: true, data: await createSavedQuote(parsed.data) },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INSERT_FAILED',
          message: error instanceof Error ? error.message : '견적 기록 저장에 실패했습니다.',
        },
      },
      { status: 500 },
    );
  }
}
