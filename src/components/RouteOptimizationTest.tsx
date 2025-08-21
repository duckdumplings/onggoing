'use client';

import React, { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import AddressAutocomplete, { AddressSelection } from '@/components/AddressAutocomplete';
import Card from '@/components/ui/Card';
import TmapMap from '@/components/map/TmapMap';

interface TestLocation {
  address: string;
}

interface OptimizationResult {
  routes: any[];
  summary: {
    totalDistance: number;
    totalTime: number;
    totalRoutes: number;
  };
}

export default function RouteOptimizationTest() {
  const [origins, setOrigins] = useState<(TestLocation & Partial<AddressSelection> & { name?: string })[]>([
    { address: '서울특별시 강남구 테헤란로 123', name: undefined }
  ]);
  const [destinations, setDestinations] = useState<(TestLocation & Partial<AddressSelection> & { name?: string })[]>([
    { address: '부산광역시 해운대구 해운대로 264', name: undefined },
    { address: '대구광역시 중구 동성로 789', name: undefined }
  ]);
  const [vehicleType, setVehicleType] = useState<'레이' | '스타렉스'>('레이');
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimizeOrder, setOptimizeOrder] = useState<boolean>(true);
  const [departureAtLocal, setDepartureAtLocal] = useState<string>(getNowLocalDateTime());
  const [useRealtimeTraffic, setUseRealtimeTraffic] = useState<boolean>(true);

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
          optimizeOrder,
          departureAt: toISOFromLocal(departureAtLocal),
          useRealtimeTraffic,
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
        경로 최적화 테스트
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 입력 폼 */}
        <Card variant="basic" className="p-6">
          <h2 className="text-xl font-semibold mb-4">출발지</h2>
          <div className="space-y-4">
            {origins.map((origin, index) => (
              <div key={index} className="grid grid-cols-1 gap-4">
                <AddressAutocomplete
                  label="주소"
                  value={origins[index].latitude ? {
                    name: origins[index].name || origins[index].address,
                    address: origins[index].address,
                    latitude: origins[index].latitude!,
                    longitude: origins[index].longitude!
                  } : null}
                  onSelect={(s) => {
                    if (s) {
                      const updated = [...origins]
                      updated[index] = { name: s.name, address: s.address, latitude: s.latitude, longitude: s.longitude }
                      setOrigins(updated)
                    }
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
                  <AddressAutocomplete
                    label={`목적지 ${index + 1}`}
                    value={destinations[index].latitude ? {
                      name: destinations[index].name || destinations[index].address,
                      address: destinations[index].address,
                      latitude: destinations[index].latitude!,
                      longitude: destinations[index].longitude!
                    } : null}
                    onSelect={(s) => {
                      if (s) {
                        const updated = [...destinations]
                        updated[index] = { name: s.name, address: s.address, latitude: s.latitude, longitude: s.longitude }
                        setDestinations(updated)
                      }
                    }}
                    placeholder="목적지 주소를 입력하세요"
                  />
                  {destinations.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDestination(index)}
                      className="mt-8 h-8 w-8 flex items-center justify-center rounded border border-red-300 text-red-600 hover:bg-red-50"
                      aria-label={`목적지 ${index + 1} 삭제`}
                      title="삭제"
                    >
                      ×
                    </button>
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

          <div className="mt-6 space-y-4">
            <h2 className="text-xl font-semibold">옵션</h2>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={optimizeOrder}
                onChange={(e) => setOptimizeOrder(e.target.checked)}
              />
              <span className="text-sm">경유지 순서 최적화</span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-1">출발 일시</label>
                <input
                  type="datetime-local"
                  value={departureAtLocal}
                  onChange={(e) => setDepartureAtLocal(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">오늘 ±12시간 이내는 실시간 교통 적용</p>
              </div>
              <label className="flex items-center gap-3 md:mt-6">
                <input
                  type="checkbox"
                  checked={useRealtimeTraffic}
                  onChange={(e) => setUseRealtimeTraffic(e.target.checked)}
                />
                <span className="text-sm">실시간 교통상황 반영</span>
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
                  <span>{(result.summary.totalDistance / 1000).toFixed(1)} km</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">예상 소요시간:</span>
                  <span>{Math.round(result.summary.totalTime / 60)}분</span>
                </div>
                {'usedTraffic' in result.summary && (
                  <div className="flex justify-between">
                    <span className="font-medium">교통 반영:</span>
                    <span>{(result.summary as any).usedTraffic === 'realtime' ? '실시간' : '표준'}</span>
                  </div>
                )}
                {'optimizeOrder' in result.summary && (
                  <div className="flex justify-between">
                    <span className="font-medium">순서 최적화:</span>
                    <span>{(result.summary as any).optimizeOrder ? 'ON' : 'OFF'}</span>
                  </div>
                )}
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
              routeData={result}
              waypoints={[
                ...origins
                  .filter((o) => typeof o.latitude === 'number' && typeof o.longitude === 'number')
                  .map((o) => ({ lat: o.latitude as number, lng: o.longitude as number })),
                ...destinations
                  .filter((d) => typeof d.latitude === 'number' && typeof d.longitude === 'number')
                  .map((d) => ({ lat: d.latitude as number, lng: d.longitude as number })),
              ]}
              height="h-96"
              className="w-full"
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

// YYYY-MM-DDTHH:mm 형식의 로컬 datetime 문자열 반환 (input[type=datetime-local] 기본 포맷)
function getNowLocalDateTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hour = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hour}:${min}`;
}

// datetime-local 값을 ISO 문자열로 변환
function toISOFromLocal(local: string | undefined): string | undefined {
  if (!local) return undefined;
  // Safari 호환을 위해 'YYYY-MM-DDTHH:mm' -> 'YYYY-MM-DDTHH:mm:00'
  const normalized = local.length === 16 ? `${local}:00` : local;
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}