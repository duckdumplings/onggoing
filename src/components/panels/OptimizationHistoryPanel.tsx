'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';

interface OptimizationRun {
  id: string;
  total_distance: number;
  total_time: number;
  vehicle_type: '레이' | '스타렉스';
  optimize_order: boolean;
  used_traffic: boolean;
  departure_at: string | null;
  engine_used: string;
  fallback_used: boolean;
  created_at: string;
  request_data: any;
  result_data: any;
}

interface OptimizationStats {
  total_runs: number;
  avg_distance: number;
  avg_time: number;
  total_distance_saved: number;
  optimization_rate: number;
}

interface OptimizationHistoryData {
  runs: OptimizationRun[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
  stats: OptimizationStats | null;
}

export function OptimizationHistoryPanel() {
  const [data, setData] = useState<OptimizationHistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<OptimizationRun | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // 최적화 실행 히스토리 조회
  const fetchHistory = async (limit = 10, offset = 0) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/optimization-runs?limit=${limit}&offset=${offset}`);
      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || '데이터 조회에 실패했습니다');
      }
    } catch (err) {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  // 컴포넌트 마운트 시 데이터 조회
  useEffect(() => {
    fetchHistory();
  }, []);

  // 상세 정보 표시
  const handleShowDetails = (run: OptimizationRun) => {
    setSelectedRun(run);
    setShowDetails(true);
  };

  // 상세 정보 닫기
  const handleCloseDetails = () => {
    setShowDetails(false);
    setSelectedRun(null);
  };

  // 시간 포맷팅
  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}시간 ${mins}분` : `${mins}분`;
  };

  // 날짜 포맷팅
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 거리 포맷팅
  const formatDistance = (meters: number) => {
    const km = meters / 1000;
    return `${km.toFixed(1)}km`;
  };

  if (loading && !data) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center h-32">
          <Loading />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={() => fetchHistory()}>다시 시도</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 통계 정보 */}
      {data?.stats && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-3">최적화 통계</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">총 실행 횟수:</span>
              <span className="ml-2 font-medium">{data.stats.total_runs}회</span>
            </div>
            <div>
              <span className="text-gray-600">평균 거리:</span>
              <span className="ml-2 font-medium">{formatDistance(data.stats.avg_distance)}</span>
            </div>
            <div>
              <span className="text-gray-600">평균 시간:</span>
              <span className="ml-2 font-medium">{formatTime(data.stats.avg_time)}</span>
            </div>
            <div>
              <span className="text-gray-600">최적화율:</span>
              <span className="ml-2 font-medium">{data.stats.optimization_rate}%</span>
            </div>
            {data.stats.total_distance_saved > 0 && (
              <div className="col-span-2">
                <span className="text-gray-600">총 절약 거리:</span>
                <span className="ml-2 font-medium text-green-600">
                  {formatDistance(data.stats.total_distance_saved)}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 실행 히스토리 */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">최근 실행 기록</h3>
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => fetchHistory()}
          >
            새로고침
          </Button>
        </div>

        {data?.runs && data.runs.length > 0 ? (
          <div className="space-y-3">
            {data.runs.map((run) => (
              <div 
                key={run.id} 
                className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => handleShowDetails(run)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      run.vehicle_type === '레이' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {run.vehicle_type}
                    </span>
                    {run.optimize_order && (
                      <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">
                        순서최적화
                      </span>
                    )}
                    {run.used_traffic && (
                      <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-800">
                        실시간교통
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatDate(run.created_at)}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-600">거리:</span>
                    <span className="ml-2 font-medium">{formatDistance(run.total_distance)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">시간:</span>
                    <span className="ml-2 font-medium">{formatTime(run.total_time)}</span>
                  </div>
                </div>

                {run.departure_at && (
                  <div className="mt-2 text-xs text-gray-500">
                    출발시간: {formatDate(run.departure_at)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">
            아직 최적화 실행 기록이 없습니다
          </div>
        )}
      </Card>

      {/* 상세 정보 모달 */}
      {showDetails && selectedRun && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">최적화 실행 상세 정보</h3>
              <Button 
                size="sm" 
                variant="outline"
                onClick={handleCloseDetails}
              >
                닫기
              </Button>
            </div>

            <div className="space-y-4">
              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-gray-600">차량 타입:</span>
                  <span className="ml-2 font-medium">{selectedRun.vehicle_type}</span>
                </div>
                <div>
                  <span className="text-gray-600">총 거리:</span>
                  <span className="ml-2 font-medium">{formatDistance(selectedRun.total_distance)}</span>
                </div>
                <div>
                  <span className="text-gray-600">총 시간:</span>
                  <span className="ml-2 font-medium">{formatTime(selectedRun.total_time)}</span>
                </div>
                <div>
                  <span className="text-gray-600">엔진:</span>
                  <span className="ml-2 font-medium">{selectedRun.engine_used.toUpperCase()}</span>
                </div>
              </div>

              {/* 옵션 정보 */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">사용 옵션</h4>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input 
                      type="checkbox" 
                      checked={selectedRun.optimize_order} 
                      readOnly 
                      className="rounded"
                    />
                    <span>순서 최적화</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input 
                      type="checkbox" 
                      checked={selectedRun.used_traffic} 
                      readOnly 
                      className="rounded"
                    />
                    <span>실시간 교통정보</span>
                  </div>
                </div>
              </div>

              {/* 요청 데이터 */}
              {selectedRun.request_data && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">요청 정보</h4>
                  <div className="bg-gray-50 p-3 rounded text-sm">
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(selectedRun.request_data, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* 결과 데이터 요약 */}
              {selectedRun.result_data && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">결과 요약</h4>
                  <div className="bg-gray-50 p-3 rounded text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-gray-600">경로 수:</span>
                        <span className="ml-2">{selectedRun.result_data.features?.length || 0}개</span>
                      </div>
                      <div>
                        <span className="text-gray-600">경유지 수:</span>
                        <span className="ml-2">{selectedRun.result_data.waypoints?.length || 0}개</span>
                      </div>
                    </div>
                    
                    {selectedRun.result_data.summary?.optimizationInfo && (
                      <div className="mt-2 p-2 bg-green-50 rounded">
                        <span className="text-green-800 font-medium">최적화 정보:</span>
                        <div className="text-sm text-green-700 mt-1">
                          절약 거리: {formatDistance(selectedRun.result_data.summary.optimizationInfo.distanceSaved || 0)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
