'use client';

import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    Tmap: any;
    TmapCallback: () => void;
  }
}

export default function TmapCallbackTest() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string>('초기화 중...');
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  const addDebug = (info: string) => {
    setDebugInfo(prev => [...prev, `${new Date().toLocaleTimeString()}: ${info}`]);
  };

  useEffect(() => {
    const initMap = async () => {
      try {
        setStatus('API 키 확인 중...');
        addDebug('API 키 확인 시작');

        const apiKey = process.env.NEXT_PUBLIC_TMAP_API_KEY;

        if (!apiKey) {
          setStatus('API 키가 설정되지 않음');
          addDebug('API 키 없음');
          return;
        }

        addDebug(`API 키 확인됨: ${apiKey.substring(0, 10)}...`);
        setStatus('Tmap API 공식 방식으로 초기화 중...');

        // 기존 스크립트 제거
        const existingScript = document.querySelector('script[src*="tmap"]');
        if (existingScript) {
          existingScript.remove();
          addDebug('기존 Tmap 스크립트 제거');
        }

        // 방법 1: 직접 스크립트 로드 후 window.Tmap 확인
        addDebug('방법 1: 직접 스크립트 로드 시도');

        const script = document.createElement('script');
        script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${apiKey}`;
        script.async = true;

        await new Promise((resolve, reject) => {
          script.onload = () => {
            addDebug('Tmap 스크립트 로드 성공');
            resolve(null);
          };
          script.onerror = (error) => {
            addDebug(`Tmap 스크립트 로드 실패: ${error}`);
            reject(new Error('Tmap 스크립트 로드 실패'));
          };
          document.head.appendChild(script);
        });

        // 스크립트 로드 후 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 1000));

        addDebug('window.Tmap 확인 중...');
        if (window.Tmap) {
          addDebug('window.Tmap 발견! 지도 생성 시도');

          if (!mapRef.current) {
            addDebug('지도 컨테이너 없음');
            return;
          }

          try {
            addDebug('Tmap.Map 생성 시도');

            // 지도 생성
            const map = new window.Tmap.Map(mapRef.current, {
              center: new window.Tmap.LatLng(37.5665, 126.9780),
              zoom: 10,
              width: "100%",
              height: "100%"
            });

            addDebug('지도 생성 성공');
            setStatus('지도 로드 완료!');
            return;
          } catch (error) {
            addDebug(`지도 생성 실패: ${error}`);
            setStatus(`오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
            return;
          }
        }

        // 방법 2: 콜백 방식 시도
        addDebug('방법 2: 콜백 방식 시도');

        // 기존 스크립트 제거
        const existingScript2 = document.querySelector('script[src*="tmap"]');
        if (existingScript2) {
          existingScript2.remove();
          addDebug('기존 Tmap 스크립트 제거 (콜백 방식)');
        }

        // 콜백 함수 설정
        window.TmapCallback = function () {
          addDebug('Tmap 콜백 호출됨 - 초기화 완료');

          if (!mapRef.current) {
            addDebug('지도 컨테이너 없음');
            return;
          }

          try {
            addDebug('Tmap.Map 생성 시도 (콜백)');

            // 지도 생성
            const map = new window.Tmap.Map(mapRef.current, {
              center: new window.Tmap.LatLng(37.5665, 126.9780),
              zoom: 10,
              width: "100%",
              height: "100%"
            });

            addDebug('지도 생성 성공 (콜백)');
            setStatus('지도 로드 완료! (콜백 방식)');
          } catch (error) {
            addDebug(`지도 생성 실패 (콜백): ${error}`);
            setStatus(`오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
          }
        };

        addDebug('Tmap 콜백 함수 설정 완료');
        addDebug('Tmap 스크립트 로드 시작 (콜백 포함)');

        // 새로운 스크립트 로드 (콜백 포함)
        const script2 = document.createElement('script');
        script2.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${apiKey}&callback=TmapCallback`;
        script2.async = true;

        script2.onload = () => {
          addDebug('Tmap 스크립트 로드 성공 (콜백)');
        };

        script2.onerror = (error) => {
          addDebug(`Tmap 스크립트 로드 실패 (콜백): ${error}`);
          setStatus('Tmap 스크립트 로드 실패');
        };

        document.head.appendChild(script2);

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
      <div className="bg-green-50 p-4 rounded-lg">
        <h3 className="font-semibold text-green-800 mb-2">Tmap API 공식 방식 테스트</h3>
        <p className="text-green-600 text-sm">{status}</p>
      </div>

      <div className="w-full h-96 bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
        <div ref={mapRef} className="w-full h-full" />
      </div>

      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="font-semibold text-gray-800 mb-2">디버그 정보</h3>
        <div className="text-xs text-gray-600 space-y-1 mb-4">
          <p>API 키: {process.env.NEXT_PUBLIC_TMAP_API_KEY ? '설정됨' : '설정되지 않음'}</p>
          <p>window.Tmap: {typeof window !== 'undefined' && window.Tmap ? '로드됨' : '로드되지 않음'}</p>
          <p>window.TmapCallback: {typeof window !== 'undefined' && window.TmapCallback ? '설정됨' : '설정되지 않음'}</p>
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

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <h4 className="font-semibold text-blue-800 mb-2">🔍 문제 진단</h4>
          <p className="text-blue-700 text-xs mb-2">
            현재 상황: Tmap 스크립트는 로드되지만 window.Tmap 객체가 정의되지 않음
          </p>
          <ul className="text-blue-700 text-xs list-disc list-inside space-y-1">
            <li>API 키 권한 확인 필요 (JavaScript API 사용 권한)</li>
            <li>도메인 등록 확인 (localhost 허용)</li>
            <li>Tmap API 버전 호환성 확인</li>
            <li>브라우저 콘솔에서 추가 오류 메시지 확인</li>
          </ul>
        </div>
      </div>
    </div>
  );
} 