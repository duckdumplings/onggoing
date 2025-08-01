'use client';

import React, { useEffect, useRef, useState } from 'react';

export default function SimpleTmapTest() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scriptStatus, setScriptStatus] = useState<string>('로딩 중...');

  useEffect(() => {
    const loadTmapScript = () => {
      return new Promise<void>((resolve, reject) => {
        if (window.Tmap) {
          setScriptStatus('스크립트 이미 로드됨');
          resolve();
          return;
        }

        const script = document.createElement('script');
        const apiKey = process.env.NEXT_PUBLIC_TMAP_API_KEY;

        if (!apiKey) {
          reject(new Error('Tmap API 키가 설정되지 않았습니다.'));
          return;
        }

        setScriptStatus('스크립트 로딩 중...');
        script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${apiKey}`;
        script.onload = () => {
          setScriptStatus('스크립트 로드 완료');
          resolve();
        };
        script.onerror = () => reject(new Error('Tmap 스크립트 로드 실패'));
        document.head.appendChild(script);
      });
    };

    const initializeMap = async () => {
      try {
        setIsLoading(true);
        setError(null);

        await loadTmapScript();

        if (!mapRef.current) {
          throw new Error('지도 컨테이너를 찾을 수 없습니다.');
        }

        console.log('Tmap 지도 초기화 시작');

        // Tmap 지도 초기화
        const map = new window.Tmap.Map(mapRef.current, {
          center: new window.Tmap.LatLng(37.5665, 126.9780),
          zoom: 10,
          width: "100%",
          height: "100%"
        });

        console.log('Tmap 지도 초기화 완료');
        setIsLoading(false);
      } catch (error) {
        console.error('Tmap 지도 초기화 실패:', error);
        setError(error instanceof Error ? error.message : '지도 로드 실패');
        setIsLoading(false);
      }
    };

    initializeMap();
  }, []);

  if (error) {
    return (
      <div className="w-full h-96 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-2">⚠️</div>
          <p className="text-red-600 text-sm">{error}</p>
          <p className="text-gray-500 text-xs mt-2">스크립트 상태: {scriptStatus}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-3 py-1 bg-blue-500 text-white rounded text-xs"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-gray-600 text-sm">지도를 불러오는 중...</p>
          <p className="text-gray-500 text-xs mt-2">스크립트 상태: {scriptStatus}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-96 rounded-lg overflow-hidden border border-gray-200">
      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
} 