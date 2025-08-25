'use client';

import TmapMainMap from '@/components/map/TmapMainMap';
import RouteOptimizerPanel from '@/components/panels/RouteOptimizerPanel';
import QuoteCalculatorPanel from '@/components/panels/QuoteCalculatorPanel';
import QuoteDetailModal from '@/components/modals/QuoteDetailModal';
import { useState, useCallback } from 'react';
// OptimizationHistoryPanel import 제거 - 고도화 필요로 인한 일시 중단

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [quoteData, setQuoteData] = useState({
    detail: null,
    plans: null,
    total: '₩0',
    vehicle: 'ray' as 'ray' | 'starex',
    scheduleType: 'ad-hoc' as 'ad-hoc' | 'regular',
    routeData: null,
    destinations: [],
    effectiveStopsCount: 0
  });

  const handleQuoteDataChange = useCallback((data: any) => {
    setQuoteData(data);
  }, []);

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* 좌측 패널 */}
      <aside className="hidden md:flex flex-col p-4 gap-3 bg-white/60 backdrop-blur-xl border-r border-white/40" style={{ width: '28rem' }}>
        <header className="px-2 pb-1 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900">옹고잉 물류</h1>
          <p className="text-xs text-gray-600">스마트 경로 최적화 플랫폼</p>
        </header>
        {/* 통합 기능 패널 - 스크롤 영역 */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 custom-scrollbar">
          <RouteOptimizerPanel />

          {/* 섹션 구분선 */}
          <div className="border-t-2 border-gray-200 my-4 mx-4"></div>

          <QuoteCalculatorPanel onDataChange={handleQuoteDataChange} />
        </div>

        {/* 좌측 네비게이션 최하단 - 상세보기 버튼 */}
        <div className="flex-shrink-0 pt-4 border-t border-gray-200">
          {quoteData.routeData ? (
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 px-4 rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 flex items-center justify-center gap-2 font-medium shadow-lg hover:shadow-xl"
            >
              📋 견적 상세 정보 보기
            </button>
          ) : (
            <div className="w-full bg-gray-100 text-gray-500 py-3 px-4 rounded-lg text-center text-sm">
              🚛 최적 경로 계산 후 상세 정보를 확인할 수 있습니다
            </div>
          )}
        </div>
      </aside>

      {/* 모바일 상단 패널 */}
      <div className="md:hidden w-full p-4 space-y-3">
        <RouteOptimizerPanel />
        <QuoteCalculatorPanel onDataChange={handleQuoteDataChange} />

        {/* 모바일용 상세보기 버튼 */}
        <div className="pt-4 border-t border-gray-200">
          {quoteData.routeData ? (
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 px-4 rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 flex items-center justify-center gap-2 font-medium shadow-lg hover:shadow-xl"
            >
              📋 견적 상세 정보 보기
            </button>
          ) : (
            <div className="w-full bg-gray-100 text-gray-500 py-3 px-4 rounded-lg text-center text-sm">
              🚛 최적 경로 계산 후 상세 정보를 확인할 수 있습니다
            </div>
          )}
        </div>
      </div>

      {/* 우측 지도 - 전체 화면 차지 */}
      <main className="relative" style={{ width: 'calc(100vw - 28rem)', height: '100vh' }}>
        <TmapMainMap />
      </main>

      {/* 견적 상세 정보 모달 */}
      <QuoteDetailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        detail={quoteData.detail}
        plans={quoteData.plans}
        vehicle={quoteData.vehicle}
        scheduleType={quoteData.scheduleType}
        total={quoteData.total}
        initialActiveTab="summary"
        routeData={quoteData.routeData}
        destinations={quoteData.destinations}
        effectiveStopsCount={quoteData.effectiveStopsCount}
      />
    </div>
  );
}