import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/libs/supabase-client';
import { detectFileType, ALLOWED_MIME_TYPES, MAX_FILE_SIZE, DocumentFileType } from '@/domains/quote/types/quoteDocument';

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'quote-documents';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { 
          success: false,
          error: { 
            code: 'NO_FILE', 
            message: '파일이 제공되지 않았습니다' 
          } 
        },
        { status: 400 }
      );
    }

    // 파일 크기 검증
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { 
          success: false,
          error: { 
            code: 'FILE_TOO_LARGE', 
            message: `파일 크기는 ${MAX_FILE_SIZE / (1024 * 1024)}MB를 초과할 수 없습니다` 
          } 
        },
        { status: 400 }
      );
    }

    // 파일 타입 검증
    const fileType = detectFileType(file.name, file.type);
    if (!fileType) {
      return NextResponse.json(
        { 
          success: false,
          error: { 
            code: 'INVALID_FILE_TYPE', 
            message: '지원되지 않는 파일 형식입니다. PDF, Excel, Word, 이미지 파일만 업로드 가능합니다' 
          } 
        },
        { status: 400 }
      );
    }

    // MIME 타입 검증 (제공된 경우)
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { 
          success: false,
          error: { 
            code: 'INVALID_MIME_TYPE', 
            message: '지원되지 않는 MIME 타입입니다' 
          } 
        },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // 고유한 파일 이름 생성 (타임스탬프 + UUID)
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = file.name.split('.').pop();
    const uniqueFileName = `${timestamp}-${randomString}.${fileExtension}`;
    const filePath = `${timestamp}/${uniqueFileName}`;

    // 파일을 ArrayBuffer로 변환
    const fileBuffer = await file.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);

    // Supabase Storage에 파일 업로드
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, fileBytes, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('파일 업로드 실패:', uploadError);
      return NextResponse.json(
        { 
          success: false,
          error: { 
            code: 'UPLOAD_FAILED', 
            message: `파일 업로드에 실패했습니다: ${uploadError.message}` 
          } 
        },
        { status: 500 }
      );
    }

    // Public URL 생성
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    const fileUrl = urlData.publicUrl;

    // 사용자 ID 추출 (선택사항, 향후 인증 추가 시 사용)
    // const userId = request.headers.get('x-user-id'); // 예시

    // 데이터베이스에 메타데이터 저장
    const { data: dbData, error: dbError } = await supabase
      .from('quote_documents')
      .insert([
        {
          file_url: fileUrl,
          file_name: file.name,
          file_type: fileType,
          file_size: file.size,
          mime_type: file.type || null,
          uploaded_by: null, // 향후 인증 추가 시 userId 사용
        },
      ])
      .select()
      .single();

    if (dbError) {
      console.error('데이터베이스 저장 실패:', JSON.stringify(dbError, null, 2));
      console.error('입력 데이터:', {
        file_url: fileUrl,
        file_name: file.name,
        file_type: fileType,
        file_size: file.size,
        mime_type: file.type || null,
      });
      
      // 업로드된 파일 삭제 시도 (롤백)
      await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([filePath]);

      return NextResponse.json(
        { 
          success: false,
          error: { 
            code: 'DATABASE_ERROR', 
            message: `데이터베이스 저장에 실패했습니다: ${dbError.message || JSON.stringify(dbError)}` 
          } 
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: dbData.id,
        file_url: dbData.file_url,
        file_name: dbData.file_name,
        file_type: dbData.file_type as DocumentFileType,
        file_size: dbData.file_size,
      },
    });
  } catch (error) {
    console.error('문서 업로드 API 오류:', error);
    return NextResponse.json(
      { 
        success: false,
        error: { 
          code: 'INTERNAL_ERROR', 
          message: error instanceof Error ? error.message : '서버 오류가 발생했습니다' 
        } 
      },
      { status: 500 }
    );
  }
}

