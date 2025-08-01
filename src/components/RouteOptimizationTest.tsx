'use client';

import React, { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import TmapMap from '@/components/map/TmapMap';

interface TestLocation {
  address: string;
}

interface OptimizationResult {
  route: any;
  totalDistance: number;
  totalTime: number;
  optimizedOrder: number[];
}

export default function RouteOptimizationTest() {
  const [origins, setOrigins] = useState<TestLocation[]>([
    { address: '서울특별시 강남구 테헤란로 123' }
  ]);
  const [destinations, setDestinations] = useState<TestLocation[]>([
    { address: '부산광역시 해운대구 해운대로 264' },
    { address: '대구광역시 중구 동성로 789' }
  ]);
  const [vehicleType, setVehicleType] = useState<'레이' | '스타렉스'>('레이');
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOptimizeRoute = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/route-optimization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          origins,
          destinations,
          vehicleType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Route optimization failed');
      }

      if (data.success) {
        setResult(data.data);
      } else {
        throw new Error(data.error || 'Route optimization failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const addDestination = () => {
    setDestinations([...destinations, { address: '' }]);
  };

  const removeDestination = (index: number) => {
    setDestinations(destinations.filter((_, i) => i !== index));
  };

  const updateDestination = (index: number, address: string) => {
    const updated = [...destinations];
    updated[index] = { ...updated[index], address };
    setDestinations(updated);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold text-center mb-8">
        Tmap API 경로 최적화 테스트
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 입력 폼 */}
        <Card variant="basic" className="p-6">
          <h2 className="text-xl font-semibold mb-4">출발지</h2>
          <div className="space-y-4">
            {origins.map((origin, index) => (
              <div key={index} className="grid grid-cols-1 gap-4">
                <Input
                  label="주소"
                  value={origin.address}
                  onChange={(e) => {
                    const updated = [...origins];
                    updated[index] = { ...updated[index], address: e.target.value };
                    setOrigins(updated);
                  }}
                  placeholder="출발지 주소를 입력하세요"
                />
              </div>
            ))}
          </div>

          <h2 className="text-xl font-semibold mb-4 mt-6">목적지</h2>
          <div className="space-y-4">
            {destinations.map((destination, index) => (
              <div key={index} className="grid grid-cols-1 gap-4">
                <div className="flex gap-2">
                  <Input
                    label={`목적지 ${index + 1}`}
                    value={destination.address}
                    onChange={(e) => updateDestination(index, e.target.value)}
                    placeholder="목적지 주소를 입력하세요"
                  />
                  {destinations.length > 1 && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => removeDestination(index)}
                      className="mt-8"
                    >
                      삭제
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={addDestination}
              className="w-full"
            >
              목적지 추가
            </Button>
          </div>

          <div className="mt-6">
            <h2 className="text-xl font-semibold mb-4">차량 타입</h2>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="vehicleType"
                  value="레이"
                  checked={vehicleType === '레이'}
                  onChange={(e) => setVehicleType(e.target.value as '레이' | '스타렉스')}
                  className="mr-2"
                />
                레이
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="vehicleType"
                  value="스타렉스"
                  checked={vehicleType === '스타렉스'}
                  onChange={(e) => setVehicleType(e.target.value as '레이' | '스타렉스')}
                  className="mr-2"
                />
                스타렉스
              </label>
            </div>
          </div>

          <Button
            onClick={handleOptimizeRoute}
            isLoading={loading}
            className="w-full mt-6"
            disabled={loading}
          >
            경로 최적화 실행
          </Button>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
        </Card>

        {/* 결과 및 지도 */}
        <div className="space-y-6">
          {result && (
            <Card variant="basic" className="p-6">
              <h2 className="text-xl font-semibold mb-4">최적화 결과</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="font-medium">총 거리:</span>
                  <span>{(result.totalDistance / 1000).toFixed(1)} km</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">예상 소요시간:</span>
                  <span>{Math.round(result.totalTime / 60)}분</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">차량 타입:</span>
                  <span>{vehicleType}</span>
                </div>
              </div>
            </Card>
          )}

          {/* Tmap 지도 */}
          <Card variant="basic" className="p-6">
            <h2 className="text-xl font-semibold mb-4">경로 지도</h2>
            <TmapMap
              routeData={result?.route}
              height="h-96"
              className="w-full"
            />
          </Card>
        </div>
      </div>
    </div>
  );
} 