import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createQuotePreflight } from '@/domains/quote/services/quotePreflightService';

const RequestSchema = z.object({
  message: z.string().trim().min(8).max(8000),
  model: z.string().trim().min(1).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: '확인할 견적 요청 내용을 입력해 주세요.',
          },
        },
        { status: 400 },
      );
    }

    const data = await createQuotePreflight(parsed.data.message, parsed.data.model);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[quote/preflight] 입력 구조화 실패:', error);
    const isTimeout =
      error instanceof Error &&
      (error.name === 'TimeoutError' || /aborted due to timeout/i.test(error.message));
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'PREFLIGHT_FAILED',
          message: isTimeout
            ? '입력 해석 시간이 길어 중단했습니다. 다시 시도해 주세요.'
            : '복잡한 입력을 자동 분리하지 못했습니다. 라인별로 ‘상차 주소 → 배송 주소’ 형식으로 정리하거나 다시 시도해 주세요.',
        },
      },
      { status: 500 },
    );
  }
}
