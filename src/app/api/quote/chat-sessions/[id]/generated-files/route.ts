import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';
import { generateFile, GeneratedFileType, GenerationInput } from '@/domains/quote/services/chatFileGenerator';
import { resolveUserIdFromRequest, unauthorizedResponse } from '@/app/api/quote/_auth';

type Params = { params: Promise<{ id: string }> };

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'quote-documents';

async function ensureOwnedSession(sessionId: string, userId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('quote_chat_sessions')
    .select('id, created_by')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) return { ok: false as const, status: 500 as const, message: error.message };
  if (!data) return { ok: false as const, status: 404 as const, message: '대화방을 찾을 수 없습니다.' };
  if (String(data.created_by || '') !== userId) {
    return { ok: false as const, status: 403 as const, message: '대화방 접근 권한이 없습니다.' };
  }
  return { ok: true as const };
}

const MIME_BY_TYPE: Record<GeneratedFileType, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  md: 'text/markdown',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  json: 'application/json',
};

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const userId = await resolveUserIdFromRequest(_request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_SESSION_ID', message: 'session id가 필요합니다.' } },
        { status: 400 }
      );
    }
    const ownership = await ensureOwnedSession(id, userId);
    if (!ownership.ok) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: ownership.message } },
        { status: ownership.status }
      );
    }
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('quote_generated_files')
      .select('id, session_id, message_id, file_type, file_name, file_url, mime_type, file_size, metadata, created_at')
      .eq('session_id', id)
      .order('created_at', { ascending: false });
    if (error) {
      return NextResponse.json({ success: false, error: { code: 'QUERY_FAILED', message: error.message } }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : '생성 파일 조회 실패' } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await resolveUserIdFromRequest(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_SESSION_ID', message: 'session id가 필요합니다.' } },
        { status: 400 }
      );
    }
    const ownership = await ensureOwnedSession(id, userId);
    if (!ownership.ok) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: ownership.message } },
        { status: ownership.status }
      );
    }
    const body = await request.json();
    const fileType = String(body?.fileType || '').trim() as GeneratedFileType;
    const input = (body?.input || {}) as GenerationInput;
    const messageId = body?.messageId ? String(body.messageId) : null;

    if (!['pdf', 'xlsx', 'md', 'txt', 'docx', 'json'].includes(fileType)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_FILE_TYPE', message: '지원하지 않는 생성 파일 타입입니다.' } },
        { status: 400 }
      );
    }

    const generated = await generateFile(fileType, input);
    const supabase = createServerClient();
    const path = `chat-generated/${id}/${Date.now()}-${generated.fileName}`;
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, generated.buffer, {
        contentType: MIME_BY_TYPE[fileType] || generated.mimeType,
        upsert: false,
      });
    if (uploadError) {
      return NextResponse.json(
        { success: false, error: { code: 'UPLOAD_FAILED', message: uploadError.message } },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    const fileUrl = urlData.publicUrl;

    const { data, error } = await supabase
      .from('quote_generated_files')
      .insert([
        {
          session_id: id,
          message_id: messageId,
          file_type: fileType,
          file_name: generated.fileName,
          storage_path: path,
          file_url: fileUrl,
          mime_type: generated.mimeType,
          file_size: generated.buffer.length,
          metadata: {
            inputSummary: {
              hasQuote: Boolean(input.quote),
              hasRouteSummary: Boolean(input.routeSummary),
              ragSourceCount: Array.isArray(input.ragSources) ? input.ragSources.length : 0,
            },
          },
        },
      ])
      .select('id, session_id, message_id, file_type, file_name, file_url, mime_type, file_size, metadata, created_at')
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'INSERT_FAILED', message: error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : '파일 생성 실패' } },
      { status: 500 }
    );
  }
}

