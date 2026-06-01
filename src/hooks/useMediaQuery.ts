'use client';

import { useEffect, useState } from 'react';

/**
 * CSS 미디어쿼리 매칭 여부를 반응형으로 구독한다.
 * SSR/초기 렌더에서는 false로 시작해 마운트 후 실제 값으로 동기화한다.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);

  return matches;
}

/** 데스크톱(>=1024px) 여부. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}
