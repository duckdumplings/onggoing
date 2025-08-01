'use client';

import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    Tmap: any;
    TmapCallback: () => void;
  }
}

export default function TmapAlternativeTest() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string>('초기화 중...');
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  const addDebug = (info: string) => {
    setDebugInfo(prev => [...prev, `${new Date().toLocaleTimeString()}: ${info}`]);
  };

  useEffect(() => {
    const initMap = async () => {
      try {
        setStatus('대체 Tmap 초기화 방식 시도 중...');
        addDebug('대체 방식 시작');

        const apiKey = process.env.NEXT_PUBLIC_TMAP_API_KEY;

        if (!apiKey) {
          setStatus('API 키가 설정되지 않음');
          addDebug('API 키 없음');
          return;
        }

        addDebug(`API 키 확인됨: ${apiKey.substring(0, 10)}...`);

        // 방법 1: 동적 스크립트 로드 (setTimeout 사용)
        addDebug('방법 1: 동적 스크립트 로드 시도');

        const loadScript = () => {
          return new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${apiKey}`;
            script.async = true;

            script.onload = () => {
              addDebug('스크립트 로드 완료 (방법 1)');
              resolve();
            };

            script.onerror = () => {
              addDebug('스크립트 로드 실패 (방법 1)');
              reject(new Error('스크립트 로드 실패'));
            };

            document.head.appendChild(script);
          });
        };

        await loadScript();

        // 여러 번 window.Tmap 확인
        for (let i = 0; i < 10; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          addDebug(`window.Tmap 확인 시도 ${i + 1}/10`);

          if (window.Tmap) {
            addDebug('window.Tmap 발견!');

            if (!mapRef.current) {
              addDebug('지도 컨테이너 없음');
              return;
            }

            try {
              addDebug('Tmap.Map 생성 시도');

              const map = new window.Tmap.Map(mapRef.current, {
                center: new window.Tmap.LatLng(37.5665, 126.9780),
                zoom: 10,
                width: "100%",
                height: "100%"
              });

              addDebug('지도 생성 성공');
              setStatus('지도 로드 완료! (방법 1)');
              return;
            } catch (error) {
              addDebug(`지도 생성 실패: ${error}`);
              setStatus(`오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
              return;
            }
          }
        }

        // 방법 2: 다른 버전의 API 시도
        addDebug('방법 2: 다른 API 버전 시도');

        const loadScriptV2 = () => {
          return new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=2&appKey=${apiKey}`;
            script.async = true;

            script.onload = () => {
              addDebug('스크립트 로드 완료 (버전 2)');
              resolve();
            };

            script.onerror = () => {
              addDebug('스크립트 로드 실패 (버전 2)');
              reject(new Error('스크립트 로드 실패'));
            };

            document.head.appendChild(script);
          });
        };

        try {
          await loadScriptV2();

          for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            addDebug(`window.Tmap 확인 시도 ${i + 1}/5 (버전 2)`);

            if (window.Tmap) {
              addDebug('window.Tmap 발견! (버전 2)');

              if (!mapRef.current) {
                addDebug('지도 컨테이너 없음');
                return;
              }

              try {
                addDebug('Tmap.Map 생성 시도 (버전 2)');

                const map = new window.Tmap.Map(mapRef.current, {
                  center: new window.Tmap.LatLng(37.5665, 126.9780),
                  zoom: 10,
                  width: "100%",
                  height: "100%"
                });

                addDebug('지도 생성 성공 (버전 2)');
                setStatus('지도 로드 완료! (버전 2)');
                return;
              } catch (error) {
                addDebug(`지도 생성 실패 (버전 2): ${error}`);
                setStatus(`오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
                return;
              }
            }
          }
        } catch (error) {
          addDebug(`버전 2 시도 실패: ${error}`);
        }

        // 방법 3: 직접 DOM에 스크립트 삽입
        addDebug('방법 3: 직접 DOM 삽입 시도');

        const scriptElement = document.createElement('script');
        scriptElement.innerHTML = `
          (function() {
            var script = document.createElement('script');
            script.src = 'https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${apiKey}';
            script.onload = function() {
              console.log('Tmap 스크립트 로드 완료 (DOM 삽입)');
              if (window.Tmap) {
                console.log('window.Tmap 사용 가능');
              }
            };
            document.head.appendChild(script);
          })();
        `;

        document.head.appendChild(scriptElement);

        // 3초 대기 후 확인
        await new Promise(resolve => setTimeout(resolve, 3000));

        if (window.Tmap) {
          addDebug('window.Tmap 발견! (DOM 삽입)');

          if (!mapRef.current) {
            addDebug('지도 컨테이너 없음');
            return;
          }

          try {
            addDebug('Tmap.Map 생성 시도 (DOM 삽입)');

            const map = new window.Tmap.Map(mapRef.current, {
              center: new window.Tmap.LatLng(37.5665, 126.9780),
              zoom: 10,
              width: "100%",
              height: "100%"
            });

            addDebug('지도 생성 성공 (DOM 삽입)');
            setStatus('지도 로드 완료! (DOM 삽입)');
            return;
          } catch (error) {
            addDebug(`지도 생성 실패 (DOM 삽입): ${error}`);
            setStatus(`오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
            return;
          }
        }

        addDebug('모든 방법 실패');
        setStatus('모든 초기화 방법 실패 - API 키 또는 권한 문제 가능성');

      } catch (error) {
        console.error('지도 초기화 실패:', error);
        addDebug(`오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
        setStatus(`오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
      }
    };

    initMap();
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-purple-50 p-4 rounded-lg">
        <h3 className="font-semibold text-purple-800 mb-2">대체 Tmap 초기화 방식</h3>
        <p className="text-purple-600 text-sm">{status}</p>
      </div>

      <div className="w-full h-96 bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
        <div ref={mapRef} className="w-full h-full" />
      </div>

      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="font-semibold text-gray-800 mb-2">디버그 정보</h3>
        <div className="text-xs text-gray-600 space-y-1 mb-4">
          <p>API 키: {process.env.NEXT_PUBLIC_TMAP_API_KEY ? '설정됨' : '설정되지 않음'}</p>
          <p>window.Tmap: {typeof window !== 'undefined' && window.Tmap ? '로드됨' : '로드되지 않음'}</p>
          <p>컨테이너: {mapRef.current ? '준비됨' : '준비되지 않음'}</p>
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-gray-500">상세 로그</summary>
          <div className="mt-2 p-2 bg-white rounded text-xs max-h-32 overflow-y-auto">
            {debugInfo.map((info, index) => (
              <div key={index} className="mb-1">{info}</div>
            ))}
          </div>
        </details>

        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
          <h4 className="font-semibold text-red-800 mb-2">🚨 긴급 조치 필요</h4>
          <p className="text-red-700 text-xs mb-2">
            현재 API 키에 문제가 있을 가능성이 높습니다:
          </p>
          <ul className="text-red-700 text-xs list-disc list-inside space-y-1">
            <li>SKT Tmap 개발자 센터에서 새로운 API 키 발급</li>
            <li>JavaScript API 사용 권한 확인</li>
            <li>도메인 등록에서 localhost 추가</li>
            <li>일일 호출 한도 확인</li>
            <li>API 키 상태 확인 (활성화/비활성화)</li>
          </ul>
        </div>
      </div>
    </div>
  );
} 