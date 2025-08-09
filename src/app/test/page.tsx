'use client';

import React from 'react';
import RouteOptimizationTest from '@/components/RouteOptimizationTest';

export default function TestPage() {
  return (
    <div className="space-y-8">
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">옹고잉 스마트 물류 플랫폼 - 테스트 페이지</h1>

        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-2">🚛 경로 최적화 테스트</h2>
          <RouteOptimizationTest />
        </div>
      </div>
    </div>
  );
} 