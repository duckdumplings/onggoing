'use client';

import type { QuoteIssuer } from '@/domains/quote/services/chatFileGenerator';

/**
 * 견적서 발행처(공급자) 설정을 브라우저 localStorage에 보관한다.
 * MVP 단계라 서버 저장 없이 클라이언트에만 유지하며, 견적서 생성 시 GenerationInput.issuer로 주입된다.
 */
const STORAGE_KEY = 'ong.quote.issuer.v1';

export const EMPTY_ISSUER: QuoteIssuer = {
  name: '',
  email: '',
  contact: '',
  bizNumber: '',
  address: '',
  logoDataUrl: '',
};

export function loadIssuer(): QuoteIssuer {
  if (typeof window === 'undefined') return { ...EMPTY_ISSUER };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_ISSUER };
    const parsed = JSON.parse(raw) as QuoteIssuer;
    return { ...EMPTY_ISSUER, ...parsed };
  } catch {
    return { ...EMPTY_ISSUER };
  }
}

export function saveIssuer(issuer: QuoteIssuer): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(issuer));
  } catch {
    // 저장 실패는 무시(quota 등) — 견적 생성은 메모리 값으로 동작
  }
}

/** 비어있지 않은 필드만 추려 GenerationInput.issuer로 넘긴다(기본값 덮어쓰기 방지). */
export function toGenerationIssuer(issuer: QuoteIssuer): QuoteIssuer | undefined {
  const entries = Object.entries(issuer).filter(([, v]) => typeof v === 'string' && v.trim() !== '');
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as QuoteIssuer;
}
