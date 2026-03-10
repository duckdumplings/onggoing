'use client';

import React, { useState, useCallback } from 'react';
import { FileText, Download, Loader2, CheckCircle } from 'lucide-react';
import AddressAutocomplete, { type AddressSelection } from '@/components/AddressAutocomplete';
import WaypointList, { type Waypoint } from './WaypointList';

export default function QuoteFromCustomerDataPanel() {
  const [originSelection, setOriginSelection] = useState<AddressSelection | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [vehicleType, setVehicleType] = useState<'레이' | '스타렉스'>('레이');
  const [scheduleType, setScheduleType] = useState<'regular' | 'ad-hoc'>('ad-hoc');
  const [isLoading, setIsLoading] = useState(false);
  const [quoteResult, setQuoteResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateQuote = useCallback(async () => {
    if (!originSelection) {
      setError('출발지를 입력해주세요');
      return;
    }

    if (waypoints.length === 0) {
      setError('최소 1개의 경유지를 입력해주세요');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/quote/generate-from-customer-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerData: {
            origin: {
              address: originSelection.address,
              latitude: originSelection.latitude,
              longitude: originSelection.longitude,
            },
            destinations: waypoints.map(wp => ({
              address: wp.selection?.address || '',
              latitude: wp.selection?.latitude,
              longitude: wp.selection?.longitude,
              deliveryTime: wp.deliveryTime,
              dwellMinutes: wp.dwellTime,
            })),
            vehicleType,
            scheduleType,
          },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || '견적 생성에 실패했습니다');
      }

      const data = await res.json();
      if (!data.success || !data.data) {
        throw new Error('견적 생성 응답이 올바르지 않습니다');
      }

      setQuoteResult(data.data);
    } catch (err) {
      console.error('견적 생성 오류:', err);
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다');
    } finally {
      setIsLoading(false);
    }
  }, [originSelection, waypoints, vehicleType, scheduleType]);

  const handleDownloadPDF = useCallback(() => {
    if (!quoteResult?.pdfUrl) return;

    const link = document.createElement('a');
    link.href = quoteResult.pdfUrl;
    link.download = `견적서-${quoteResult.quoteNumber || Date.now()}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [quoteResult]);

  return (
    <div className="glass-panel p-6 space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">화주사 배송정보 기반 견적 생성</h2>

      {/* 입력 폼 */}
      <div className="space-y-4">
        {/* 출발지 */}
        <AddressAutocomplete
          label="출발지"
          placeholder="출발지 주소를 검색하세요"
          value={originSelection}
          onSelect={setOriginSelection}
        />

        {/* 경유지 목록 */}
        <WaypointList
          waypoints={waypoints}
          onWaypointsChange={setWaypoints}
          hasAnyDeliveryTime={waypoints.some(wp => !!wp.deliveryTime)}
        />

        {/* 차량 타입 */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">차량 타입</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVehicleType('레이')}
              className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all ${vehicleType === '레이'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
            >
              레이
            </button>
            <button
              type="button"
              onClick={() => setVehicleType('스타렉스')}
              className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all ${vehicleType === '스타렉스'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
            >
              스타렉스
            </button>
          </div>
        </div>

        {/* 스케줄 타입 */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">스케줄 타입</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setScheduleType('ad-hoc')}
              className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all ${scheduleType === 'ad-hoc'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
            >
              비정기
            </button>
            <button
              type="button"
              onClick={() => setScheduleType('regular')}
              className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all ${scheduleType === 'regular'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
            >
              정기
            </button>
          </div>
        </div>

        {/* 견적 생성 버튼 */}
        <button
          onClick={handleGenerateQuote}
          disabled={isLoading || !originSelection || waypoints.length === 0}
          className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              견적 생성 중...
            </>
          ) : (
            <>
              <FileText className="w-5 h-5" />
              견적 생성
            </>
          )}
        </button>

        {/* 오류 표시 */}
        {error && (
          <div className="border border-red-300 rounded-lg p-4 bg-red-50 text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* 견적 결과 */}
      {quoteResult && (
        <div className="border border-gray-200 rounded-lg p-6 bg-gradient-to-br from-green-50 to-emerald-50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <h3 className="text-xl font-bold text-gray-900">견적 생성 완료</h3>
            </div>
            {quoteResult.pdfUrl && (
              <button
                onClick={handleDownloadPDF}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                PDF 다운로드
              </button>
            )}
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">견적 번호</p>
                <p className="text-lg font-semibold text-gray-900">{quoteResult.quoteNumber}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">총 견적 금액</p>
                <p className="text-2xl font-bold text-blue-600">
                  ₩{quoteResult.totalPrice?.toLocaleString('ko-KR')}
                </p>
              </div>
            </div>

            {quoteResult.breakdown && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm font-medium text-gray-700 mb-2">상세 내역</p>
                <div className="space-y-1 text-sm text-gray-600">
                  {quoteResult.breakdown.baseRate && (
                    <div className="flex justify-between">
                      <span>기본 요금:</span>
                      <span>₩{quoteResult.breakdown.baseRate.toLocaleString('ko-KR')}</span>
                    </div>
                  )}
                  {quoteResult.breakdown.distanceCharge && (
                    <div className="flex justify-between">
                      <span>거리 요금:</span>
                      <span>₩{quoteResult.breakdown.distanceCharge.toLocaleString('ko-KR')}</span>
                    </div>
                  )}
                  {quoteResult.breakdown.timeCharge && (
                    <div className="flex justify-between">
                      <span>시간 요금:</span>
                      <span>₩{quoteResult.breakdown.timeCharge.toLocaleString('ko-KR')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {quoteResult.distance && (
              <div className="mt-2 text-sm text-gray-600">
                총 거리: {(quoteResult.distance / 1000).toFixed(2)}km ·
                총 시간: {Math.round(quoteResult.time / 60)}분
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}



