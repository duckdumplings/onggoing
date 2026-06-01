import { NextRequest, NextResponse } from 'next/server';
import { generateFile, GeneratedFileType, GenerationInput } from '@/domains/quote/services/chatFileGenerator';

/**
 * 견적서/문서 즉시 다운로드 엔드포인트.
 *
 * 저장(Storage)·인증 없이 생성된 파일 바이트를 그대로 반환한다.
 * 로그인/세션 저장이 비활성인 로컬 임시 대화에서도 견적서를 받을 수 있게 하는 것이 목적.
 * (영구 보관이 필요한 경우는 /chat-sessions/[id]/generated-files 사용)
 */
const VALID_TYPES: GeneratedFileType[] = ['pdf', 'xlsx', 'md', 'txt', 'docx', 'json'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const fileType = String(body?.fileType || '').trim() as GeneratedFileType;
    const input = (body?.input || {}) as GenerationInput;

    if (!VALID_TYPES.includes(fileType)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_FILE_TYPE', message: '지원하지 않는 생성 파일 타입입니다.' } },
        { status: 400 }
      );
    }

    const generated = await generateFile(fileType, input);

    // RFC 5987: 한글 파일명을 안전하게 전달
    const encodedName = encodeURIComponent(generated.fileName);
    return new NextResponse(new Uint8Array(generated.buffer), {
      status: 200,
      headers: {
        'Content-Type': generated.mimeType,
        'Content-Disposition': `attachment; filename="quote.${fileType}"; filename*=UTF-8''${encodedName}`,
        'Content-Length': String(generated.buffer.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : '파일 생성 실패' } },
      { status: 500 }
    );
  }
}
