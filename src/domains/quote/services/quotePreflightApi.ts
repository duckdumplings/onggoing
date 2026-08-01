import type { QuotePreflightDraft } from '@/domains/quote/types/quotePreflight';

type PreflightResponse = {
  success: boolean;
  data?: QuotePreflightDraft;
  error?: { message?: string };
};

export async function fetchQuotePreflight(
  message: string,
): Promise<QuotePreflightDraft> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch('/api/quote/preflight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as PreflightResponse | null;
    if (!response.ok || !payload?.success || !payload.data) {
      throw new Error(
        payload?.error?.message ||
          '입력 확인 정보를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
    return payload.data;
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new Error('입력 해석 시간이 길어 중단했습니다. 다시 시도해 주세요.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
