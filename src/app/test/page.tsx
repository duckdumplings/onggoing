'use client';

import React from 'react';
import RouteOptimizationTest from '@/components/RouteOptimizationTest';
import TmapMap from '@/components/map/TmapMap';

export default function TestPage() {
  return (
    <div className="space-y-8">
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">옹고잉 스마트 물류 플랫폼 - 테스트 페이지</h1>

        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-2">🗺️ Tmap 지도 테스트</h2>
          <TmapMap
            center={{ lat: 37.5665, lng: 126.9780 }}
            zoom={10}
            className="w-full"
            height="h-96"
          />
        </div>

        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-2">🚛 경로 최적화 테스트</h2>
          <RouteOptimizationTest />
        </div>
      </div>
    </div>
  );
} 