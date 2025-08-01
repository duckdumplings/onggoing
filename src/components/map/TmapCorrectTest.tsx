'use client';

import React, { useEffect, useRef, useState } from 'react';
import { tmapLoader } from '@/libs/tmap-loader';

export default function TmapCorrectTest() {
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

        setStatus('전역 Tmap 로더 사용 중...');
        addDebug('올바른 구조로 초기화 시작');

        // 1. 전역 로더를 통해 Tmap 로드
        addDebug('Tmap 전역 로더 호출');
        await tmapLoader.loadTmap();

        if (!isMounted) return;
        addDebug('Tmap 전역 로더 완료');

        // 2. 컨테이너 준비 확인
        if (!mapRef.current) {
          addDebug('지도 컨테이너 없음');
          return;
        }

        // 3. 기존 지도 인스턴스 정리
        if (mapInstance.current) {
          mapInstance.current = null;
          addDebug('기존 지도 인스턴스 정리');
        }

        // 4. Tmap 준비 상태 확인
        if (!window.Tmap) {
          throw new Error('Tmap이 로드되었지만 window.Tmap이 정의되지 않음');
        }

        addDebug('window.Tmap 확인됨');
        setStatus('지도 생성 중...');

        // 5. 지도 생성
        addDebug('Tmap.Map 생성 시도');

        mapInstance.current = new window.Tmap.Map(mapRef.current, {
          center: new window.Tmap.LatLng(37.5665, 126.9780),
          zoom: 10,
          width: "100%",
          height: "100%"
        });

        if (!isMounted) return;

        addDebug('지도 생성 성공');
        setStatus('지도 로드 완료!');

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
        mapInstance.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-emerald-50 p-4 rounded-lg">
        <h3 className="font-semibold text-emerald-800 mb-2">올바른 구조 Tmap 테스트</h3>
        <p className="text-emerald-600 text-sm">{status}</p>
      </div>

      <div className="w-full h-96 bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
        <div ref={mapRef} className="w-full h-full" />
      </div>

      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="font-semibold text-gray-800 mb-2">디버그 정보</h3>
        <div className="text-xs text-gray-600 space-y-1 mb-4">
          <p>API 키: {process.env.NEXT_PUBLIC_TMAP_API_KEY ? '설정됨' : '설정되지 않음'}</p>
          <p>window.Tmap: {typeof window !== 'undefined' && window.Tmap ? '로드됨' : '로드되지 않음'}</p>
          <p>전역 로더 상태: {tmapLoader.isTmapReady() ? '준비됨' : '준비되지 않음'}</p>
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

        <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded">
          <h4 className="font-semibold text-emerald-800 mb-2">✅ 올바른 구조의 장점</h4>
          <ul className="text-emerald-700 text-xs list-disc list-inside space-y-1">
            <li>전역 싱글톤 패턴으로 스크립트 중복 로드 방지</li>
            <li>React Strict Mode에서도 안정적 동작</li>
            <li>컴포넌트 간 Tmap 상태 공유</li>
            <li>비동기 처리 순서 보장</li>
            <li>메모리 누수 방지를 위한 cleanup 함수</li>
          </ul>
        </div>
      </div>
    </div>
  );
} 