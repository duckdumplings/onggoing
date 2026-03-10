'use client';

import React from 'react';
import { X } from 'lucide-react';

interface DriverRoute {
  driverId: string;
  driverIndex: number;
  origin: { latitude: number; longitude: number; address: string };
  destinations: Array<{ latitude: number; longitude: number; address: string }>;
  routeData: any;
  totalDistance: number;
  totalTime: number;
  travelTime: number;
  dwellTime: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  driver: DriverRoute;
  driverIndex: number;
}

const DRIVER_COLORS = [
  '#3B82F6', // 파란색
  '#EF4444', // 빨간색
  '#10B981', // 초록색
  '#F59E0B', // 노란색
  '#8B5CF6', // 보라색
  '#EC4899', // 핑크색
  '#06B6D4', // 청록색
  '#F97316', // 주황색
  '#14B8A6', // 틸색
  '#6366F1', // 인디고색
];

export default function DriverRouteDetailModal({ isOpen, onClose, driver, driverIndex }: Props) {
  if (!isOpen) return null;

  const color = DRIVER_COLORS[driverIndex % DRIVER_COLORS.length];
  const summary = driver.routeData?.summary || {};

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm overflow-hidden">
      <div className="bg-white w-full h-full overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200" style={{ backgroundColor: `${color}10` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: color }}>
              {driverIndex + 1}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{driver.driverId.replace('driver-', '배송원 ')} 상세 경로</h2>
              <p className="text-sm text-gray-600">{driver.destinations.length}개 경유지</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* 내용 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 통계 카드 */}
          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-xs text-gray-600 mb-1">총 거리</div>
              <div className="text-2xl font-bold text-gray-900">{(driver.totalDistance / 1000).toFixed(1)}km</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-xs text-blue-600 mb-1">이동시간</div>
              <div className="text-2xl font-bold text-blue-900">{Math.round(driver.travelTime / 60)}분</div>
              <div className="text-xs text-blue-500 mt-1">주행 시간</div>
            </div>
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="text-xs text-green-600 mb-1">체류시간</div>
              <div className="text-2xl font-bold text-green-900">{Math.round(driver.dwellTime / 60)}분</div>
              <div className="text-xs text-green-500 mt-1">대기 시간</div>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="text-xs text-purple-600 mb-1">총 시간</div>
              <div className="text-2xl font-bold text-purple-900">{Math.round(driver.totalTime / 60)}분</div>
              <div className="text-xs text-purple-500 mt-1">전체 소요</div>
            </div>
          </div>

          {/* 출발지 */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <span className="text-lg">🚀</span>
              출발지
            </h3>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="font-medium text-gray-900">{driver.origin.address}</div>
              <div className="text-xs text-gray-500 mt-1">
                위도: {driver.origin.latitude.toFixed(6)}, 경도: {driver.origin.longitude.toFixed(6)}
              </div>
            </div>
          </div>

          {/* 경유지 목록 */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <span className="text-lg">📍</span>
              경유지 순서 ({driver.destinations.length}개)
            </h3>
            <div className="space-y-3">
              {driver.destinations.map((dest, idx) => {
                // 도착 시간 계산
                const waypoints = driver.routeData?.waypoints || [];
                const waypoint = waypoints.find((wp: any) => 
                  Math.abs(wp.latitude - dest.latitude) < 0.0001 &&
                  Math.abs(wp.longitude - dest.longitude) < 0.0001
                ) || waypoints[idx];
                
                const arrivalTime = waypoint?.arrivalTime 
                  ? new Date(waypoint.arrivalTime)
                  : null;
                const departureTime = waypoint?.departureTime
                  ? new Date(waypoint.departureTime)
                  : null;
                const dwellTime = waypoint?.dwellTime || 0;
                const deliveryTime = waypoint?.deliveryTime;
                const isNextDay = waypoint?.isNextDay || false;
                
                // 배송시간 준수 여부 체크
                let timeCompliance: 'ok' | 'warning' | 'violation' = 'ok';
                let complianceMessage = '';
                
                if (deliveryTime && arrivalTime) {
                  const [hours, minutes] = deliveryTime.split(':').map(Number);
                  const targetTime = new Date(arrivalTime);
                  if (isNextDay) {
                    targetTime.setDate(targetTime.getDate() + 1);
                  }
                  targetTime.setHours(hours, minutes, 0, 0);
                  
                  const diffMinutes = (arrivalTime.getTime() - targetTime.getTime()) / (1000 * 60);
                  
                  if (diffMinutes > 0) {
                    timeCompliance = 'violation';
                    complianceMessage = `⚠️ ${Math.round(diffMinutes)}분 지각 예상`;
                  } else if (diffMinutes > -10) {
                    timeCompliance = 'warning';
                    complianceMessage = `⚠️ ${Math.round(Math.abs(diffMinutes))}분 여유`;
                  } else {
                    timeCompliance = 'ok';
                    complianceMessage = `✅ 시간 준수 가능`;
                  }
                }
                
                return (
                  <div
                    key={idx}
                    className="p-5 bg-white rounded-lg border-2 border-gray-200 hover:border-blue-300 transition-all hover:shadow-md"
                    style={{ borderLeftColor: color, borderLeftWidth: '5px' }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                            style={{ backgroundColor: color }}
                          >
                            {idx + 1}
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-gray-900 text-base">
                              {dest.address || `경유지 ${idx + 1}`}
                            </div>
                            {deliveryTime && (
                              <div className="text-xs text-gray-500 mt-1">
                                목표 배송시간: {deliveryTime} {isNextDay ? '(다음날)' : ''}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* 시간 정보 */}
                        <div className="ml-11 space-y-2 mt-3">
                          {arrivalTime && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-gray-600">예상 도착:</span>
                              <span className="font-medium text-gray-900">
                                {arrivalTime.toLocaleTimeString('ko-KR', { 
                                  hour: '2-digit', 
                                  minute: '2-digit',
                                  hour12: false
                                })}
                              </span>
                            </div>
                          )}
                          {departureTime && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-gray-600">예상 출발:</span>
                              <span className="font-medium text-gray-900">
                                {departureTime.toLocaleTimeString('ko-KR', { 
                                  hour: '2-digit', 
                                  minute: '2-digit',
                                  hour12: false
                                })}
                              </span>
                              {dwellTime > 0 && (
                                <span className="text-xs text-gray-500">
                                  (체류 {dwellTime}분)
                                </span>
                              )}
                            </div>
                          )}
                          {complianceMessage && (
                            <div className={`text-sm font-medium ${
                              timeCompliance === 'ok' ? 'text-green-600' :
                              timeCompliance === 'warning' ? 'text-amber-600' :
                              'text-red-600'
                            }`}>
                              {complianceMessage}
                            </div>
                          )}
                        </div>
                        
                        <div className="text-xs text-gray-500 ml-11 mt-2">
                          위도: {dest.latitude.toFixed(6)}, 경도: {dest.longitude.toFixed(6)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 경로 상세 정보 */}
          {summary && (
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <span className="text-lg">📊</span>
                경로 상세 정보
              </h3>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-2 text-sm">
                {summary.optimizeOrder && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">순서 최적화:</span>
                    <span className="font-medium text-gray-900">적용됨</span>
                  </div>
                )}
                {summary.usedTraffic && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">교통정보:</span>
                    <span className="font-medium text-gray-900">
                      {summary.usedTraffic === 'realtime' ? '실시간 반영' : '타임머신 모드'}
                    </span>
                  </div>
                )}
                {summary.vehicleTypeCode && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">차량 타입:</span>
                    <span className="font-medium text-gray-900">
                      {summary.vehicleTypeCode === '2' ? '🚐 스타렉스' : '🚗 레이'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-6 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium text-gray-700 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

