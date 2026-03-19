import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';

type Params = { params: Promise<{ id: string }> };

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'quote-documents';

function extractStoragePathFromPublicUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
    const index = parsed.pathname.indexOf(marker);
    if (index < 0) return null;
    return parsed.pathname.slice(index + marker.length);
  } catch {
    return null;
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_SESSION_ID', message: 'session id가 필요합니다.' } },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data: generated } = await supabase
      .from('quote_generated_files')
      .select('storage_path')
      .eq('session_id', id);

    const { data: attachments } = await supabase
      .from('quote_chat_attachments')
      .select('file_url')
      .eq('session_id', id);

    const storagePaths = new Set<string>();
    for (const row of generated || []) {
      if (row?.storage_path) storagePaths.add(String(row.storage_path));
    }
    for (const row of attachments || []) {
      if (!row?.file_url) continue;
      const parsedPath = extractStoragePathFromPublicUrl(String(row.file_url));
      if (parsedPath) storagePaths.add(parsedPath);
    }

    if (storagePaths.size > 0) {
      await supabase.storage.from(STORAGE_BUCKET).remove(Array.from(storagePaths));
    }

    const { error } = await supabase.from('quote_chat_sessions').delete().eq('id', id);
    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DELETE_FAILED', message: error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        deletedSessionId: id,
        deletedStorageObjects: storagePaths.size,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : '대화방 삭제 실패',
        },
      },
      { status: 500 }
    );
  }
}

