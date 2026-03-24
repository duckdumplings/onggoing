import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';
import { detectFileType, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '@/domains/quote/types/quoteDocument';
import { parseDocument } from '@/domains/quote/services/documentParser';
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

function buildTextSummary(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.slice(0, 1000);
}

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
      .from('quote_chat_attachments')
      .select('id, session_id, document_id, file_url, file_name, file_type, file_size, mime_type, parse_status, parse_error, created_at')
      .eq('session_id', id)
      .order('created_at', { ascending: true });
    if (error) {
      return NextResponse.json({ success: false, error: { code: 'QUERY_FAILED', message: error.message } }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : '첨부 조회 실패' } },
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

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_FILE', message: '업로드 파일이 필요합니다.' } },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: { code: 'FILE_TOO_LARGE', message: `파일 크기는 ${MAX_FILE_SIZE / (1024 * 1024)}MB를 초과할 수 없습니다.` } },
        { status: 400 }
      );
    }
    const fileType = detectFileType(file.name, file.type);
    if (!fileType) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_FILE_TYPE', message: '지원되지 않는 파일 형식입니다.' } },
        { status: 400 }
      );
    }
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_MIME_TYPE', message: '지원되지 않는 MIME 타입입니다.' } },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).slice(2, 10);
    const ext = file.name.split('.').pop() || 'bin';
    const storagePath = `chat-attachments/${id}/${timestamp}-${randomString}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { success: false, error: { code: 'UPLOAD_FAILED', message: uploadError.message } },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    const fileUrl = urlData.publicUrl;

    const { data: docRow, error: docError } = await supabase
      .from('quote_documents')
      .insert([
        {
          file_url: fileUrl,
          file_name: file.name,
          file_type: fileType,
          file_size: file.size,
          mime_type: file.type || null,
          uploaded_by: null,
        },
      ])
      .select('id, file_url, file_name, file_type, file_size, mime_type')
      .single();

    if (docError) {
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
      return NextResponse.json(
        { success: false, error: { code: 'DOCUMENT_INSERT_FAILED', message: docError.message } },
        { status: 500 }
      );
    }

    const { data: attachment, error: attachmentError } = await supabase
      .from('quote_chat_attachments')
      .insert([
        {
          session_id: id,
          document_id: docRow.id,
          file_url: fileUrl,
          file_name: file.name,
          file_type: fileType,
          file_size: file.size,
          mime_type: file.type || null,
          parse_status: 'pending',
        },
      ])
      .select('id, session_id, document_id, file_url, file_name, file_type, file_size, mime_type, parse_status, parse_error, created_at')
      .single();

    if (attachmentError) {
      return NextResponse.json(
        { success: false, error: { code: 'ATTACHMENT_INSERT_FAILED', message: attachmentError.message } },
        { status: 500 }
      );
    }

    let parseStatus: 'parsed' | 'failed' = 'parsed';
    let parseError: string | null = null;
    try {
      const parsed = await parseDocument(buffer, fileType, file.type || undefined);
      const summary = buildTextSummary(parsed.text);
      await supabase.from('quote_chat_attachment_parses').insert([
        {
          attachment_id: attachment.id,
          parsed_text: parsed.text || '',
          summary,
          structured_data: {},
          metadata: parsed.metadata || {},
        },
      ]);
    } catch (error) {
      parseStatus = 'failed';
      parseError = error instanceof Error ? error.message : '문서 파싱 실패';
    }

    await supabase
      .from('quote_chat_attachments')
      .update({
        parse_status: parseStatus,
        parse_error: parseError,
      })
      .eq('id', attachment.id);

    return NextResponse.json({
      success: true,
      data: {
        ...attachment,
        parse_status: parseStatus,
        parse_error: parseError,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : '첨부 업로드 실패' } },
      { status: 500 }
    );
  }
}

