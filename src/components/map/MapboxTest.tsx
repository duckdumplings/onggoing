'use client';

import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    mapboxgl: any;
  }
}

export default function MapboxTest() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const [status, setStatus] = useState<string>('초기화 중...');
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  const addDebug = (info: string) => {
    setDebugInfo(prev => [...prev, `${new Date().toLocaleTimeString()}: ${info}`]);
  };

  useEffect(() => {
    let isMounted = true;

    const initMap = async () => {
      try {
        if (!isMounted) return;

        setStatus('Mapbox GL 초기화 중...');
        addDebug('Mapbox GL 초기화 시작');

        // Mapbox GL 스크립트 로드
        const loadMapboxScript = () => {
          return new Promise<void>((resolve, reject) => {
            if (window.mapboxgl) {
              addDebug('Mapbox GL 이미 로드됨');
              resolve();
              return;
            }

            const script = document.createElement('script');
            script.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';
            script.async = true;

            script.onload = () => {
              addDebug('Mapbox GL 스크립트 로드 완료');
              resolve();
            };

            script.onerror = () => {
              addDebug('Mapbox GL 스크립트 로드 실패');
              reject(new Error('Mapbox GL 스크립트 로드 실패'));
            };

            document.head.appendChild(script);
          });
        };

        await loadMapboxScript();

        if (!isMounted) return;
        addDebug('Mapbox GL 스크립트 로드 완료');

        // 컨테이너 확인
        if (!mapRef.current) {
          addDebug('지도 컨테이너 없음');
          return;
        }

        // 기존 지도 인스턴스 정리
        if (mapInstance.current) {
          mapInstance.current.remove();
          mapInstance.current = null;
          addDebug('기존 지도 인스턴스 정리');
        }

        // Mapbox GL 지도 생성
        addDebug('Mapbox GL 지도 생성 시도');

        mapInstance.current = new window.mapboxgl.Map({
          container: mapRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [126.9780, 37.5665], // 서울
          zoom: 10
        });

        if (!isMounted) return;

        addDebug('Mapbox GL 지도 생성 성공');
        setStatus('지도 로드 완료! (Mapbox GL)');

      } catch (error) {
        if (!isMounted) return;

        console.error('지도 초기화 실패:', error);
        addDebug(`오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
        setStatus(`오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
      }
    };

    initMap();

    // Cleanup 함수
    return () => {
      isMounted = false;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-semibold text-blue-800 mb-2">Mapbox GL 테스트 (구조 검증용)</h3>
        <p className="text-blue-600 text-sm">{status}</p>
      </div>

      <div className="w-full h-96 bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
        <div ref={mapRef} className="w-full h-full" />
      </div>

      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="font-semibold text-gray-800 mb-2">디버그 정보</h3>
        <div className="text-xs text-gray-600 space-y-1 mb-4">
          <p>window.mapboxgl: {typeof window !== 'undefined' && window.mapboxgl ? '로드됨' : '로드되지 않음'}</p>
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
          <h4 className="font-semibold text-blue-800 mb-2">🔍 구조 검증 목적</h4>
          <p className="text-blue-700 text-xs mb-2">
            이 테스트는 우리의 React 컴포넌트 구조가 올바른지 확인하기 위한 것입니다.
          </p>
          <ul className="text-blue-700 text-xs list-disc list-inside space-y-1">
            <li>스크립트 로드 방식 검증</li>
            <li>컴포넌트 생명주기 관리</li>
            <li>메모리 누수 방지</li>
            <li>비동기 처리 순서</li>
          </ul>
        </div>
      </div>
    </div>
  );
} 