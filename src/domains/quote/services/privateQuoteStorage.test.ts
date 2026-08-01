import { describe, expect, it } from 'vitest';
import {
  extractQuoteStoragePath,
  resolveQuoteStoragePath,
} from '@/domains/quote/services/quoteStoragePath';

describe('privateQuoteStorage', () => {
  it('신규 객체 키를 그대로 사용한다', () => {
    expect(extractQuoteStoragePath('chat-generated/session/quote.pdf')).toBe(
      'chat-generated/session/quote.pdf',
    );
  });

  it('과거 공개 URL에서 객체 키를 복원한다', () => {
    expect(
      extractQuoteStoragePath(
        'https://example.supabase.co/storage/v1/object/public/quote-documents/chat-attachments/a/%EA%B2%AC%EC%A0%81.pdf',
      ),
    ).toBe('chat-attachments/a/견적.pdf');
  });

  it('서명 URL에서도 쿼리를 제외한 객체 키를 복원한다', () => {
    expect(
      extractQuoteStoragePath(
        'https://example.supabase.co/storage/v1/object/sign/quote-documents/chat-generated/a/quote.pdf?token=secret',
      ),
    ).toBe('chat-generated/a/quote.pdf');
  });

  it('storage_path를 file_url보다 우선한다', () => {
    expect(
      resolveQuoteStoragePath({
        storage_path: 'new/path.pdf',
        file_url:
          'https://example.supabase.co/storage/v1/object/public/quote-documents/old/path.pdf',
      }),
    ).toBe('new/path.pdf');
  });
});
