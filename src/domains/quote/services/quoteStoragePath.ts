export const QUOTE_STORAGE_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET || 'quote-documents';

export type QuoteStorageRow = {
  storage_path?: unknown;
  file_url?: unknown;
};

/**
 * 신규 행의 객체 키와 과거 공개/서명 URL을 모두 Storage 경로로 정규화한다.
 */
export function extractQuoteStoragePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  if (!/^https?:\/\//i.test(raw)) {
    const prefix = `storage://${QUOTE_STORAGE_BUCKET}/`;
    return decodeURIComponent(raw.startsWith(prefix) ? raw.slice(prefix.length) : raw)
      .replace(/^\/+/, '') || null;
  }

  try {
    const parsed = new URL(raw);
    const markers = [
      `/storage/v1/object/public/${QUOTE_STORAGE_BUCKET}/`,
      `/storage/v1/object/sign/${QUOTE_STORAGE_BUCKET}/`,
      `/storage/v1/object/authenticated/${QUOTE_STORAGE_BUCKET}/`,
    ];
    const marker = markers.find((candidate) => parsed.pathname.includes(candidate));
    if (!marker) return null;
    return decodeURIComponent(parsed.pathname.slice(parsed.pathname.indexOf(marker) + marker.length))
      .replace(/^\/+/, '') || null;
  } catch {
    return null;
  }
}

export function resolveQuoteStoragePath(row: QuoteStorageRow): string | null {
  return (
    extractQuoteStoragePath(row.storage_path) ??
    extractQuoteStoragePath(row.file_url)
  );
}
