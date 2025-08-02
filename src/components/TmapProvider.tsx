'use client';

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

interface TmapContextType {
  isLoaded: boolean;
  error: string | null;
}

const TmapContext = createContext<TmapContextType>({ isLoaded: false, error: null });
export const useTmap = () => useContext(TmapContext);

export function TmapProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 이미 로드된 경우
    if (window.Tmapv2) {
      console.log('✅ Tmapv2 이미 로드됨');
      setIsLoaded(true);
      return;
    }

    // PostScribe를 사용한 안전한 스크립트 로딩
    const loadTmapScript = async () => {
      try {
        console.log('🚀 PostScribe를 사용한 Tmap 스크립트 로드 시작');

        // PostScribe 동적 import
        const postscribe = (await import('postscribe')).default;

        // 임시 컨테이너 생성
        const tempContainer = document.createElement('div');
        tempContainer.style.display = 'none';
        document.body.appendChild(tempContainer);

        // PostScribe로 스크립트 로드
        postscribe(
          tempContainer,
          `<script src="https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${process.env.NEXT_PUBLIC_TMAP_API_KEY}"></script>`,
          {
            done: () => {
              console.log('✅ PostScribe를 통한 Tmap 스크립트 로드 완료');
              setIsLoaded(true);
              setError(null);

              // 임시 컨테이너 제거
              if (tempContainer.parentNode) {
                tempContainer.parentNode.removeChild(tempContainer);
              }
            },
            error: (error: any) => {
              console.error('❌ PostScribe 스크립트 로드 실패:', error);
              setError('Tmap 스크립트 로드에 실패했습니다');

              // 임시 컨테이너 제거
              if (tempContainer.parentNode) {
                tempContainer.parentNode.removeChild(tempContainer);
              }
            }
          }
        );

        // 타임아웃 설정 (15초)
        const timeoutId = setTimeout(() => {
          console.error('❌ PostScribe 스크립트 로드 타임아웃 (15초)');
          setError('Tmap 스크립트 로드 시간 초과 (15초)');

          // 임시 컨테이너 제거
          if (tempContainer.parentNode) {
            tempContainer.parentNode.removeChild(tempContainer);
          }
        }, 15000);

        // 클린업
        return () => {
          clearTimeout(timeoutId);
          if (tempContainer.parentNode) {
            tempContainer.parentNode.removeChild(tempContainer);
          }
        };

      } catch (error) {
        console.error('❌ PostScribe 로드 실패:', error);
        setError('PostScribe 라이브러리 로드에 실패했습니다');
      }
    };

    loadTmapScript();
  }, []);

  return (
    <TmapContext.Provider value={{ isLoaded, error }}>
      {children}
    </TmapContext.Provider>
  );
}

// 타입 선언
declare global {
  interface Window {
    Tmapv2: any;
  }
}
