'use client';

import { useEffect, useState } from 'react';

interface Props {
  appKey: string;
}

// 동기적으로 document.write를 허용하기 위해 DOM에 임시 컨테이너를 만들고
// innerHTML로 script를 삽입해 즉시 파싱되도록 처리
export default function TmapScriptLoader({ appKey }: Props) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).Tmapv2) return; // 이미 로드됨

    try {
      const container = document.createElement('div');
      // body 최상단에 두어 파서 차단 영향 최소화
      document.body.insertBefore(container, document.body.firstChild);
      container.innerHTML = `
        <script src="https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${appKey}"><\/script>
      `;
    } catch (e: any) {
      setError(e?.message || 'Tmap SDK 로드 실패');
    }
  }, [appKey]);

  if (error) {
    return (
      <div className="w-full p-2 text-xs text-red-600">{error}</div>
    );
  }
  return null;
}


