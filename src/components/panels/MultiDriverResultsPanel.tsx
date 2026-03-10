'use client';

import React, { useState } from 'react';
import DriverRouteDetailModal from '@/components/modals/DriverRouteDetailModal';
import { motion, AnimatePresence } from 'framer-motion';

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

interface MultiDriverResult {
  success: boolean;
  drivers: DriverRoute[];
  summary: {
    totalDistance: number;
    totalTime: number;
    averageDistance: number;
    averageTime: number;
    balanceScore: number;
  };
}

const DRIVER_COLORS = [
  { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-500', ring: 'ring-indigo-500' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500', ring: 'ring-rose-500' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', ring: 'ring-emerald-500' },
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500', ring: 'ring-amber-500' },
  { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', dot: 'bg-violet-500', ring: 'ring-violet-500' },
  { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', dot: 'bg-cyan-500', ring: 'ring-cyan-500' },
  { bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', dot: 'bg-fuchsia-500', ring: 'ring-fuchsia-500' },
  { bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700', dot: 'bg-lime-500', ring: 'ring-lime-500' },
  { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', dot: 'bg-sky-500', ring: 'ring-sky-500' },
  { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', dot: 'bg-slate-500', ring: 'ring-slate-500' },
];

type Props = {
  result: MultiDriverResult | null;
};

export default function MultiDriverResultsPanel({ result }: Props) {
  const [selectedDriver, setSelectedDriver] = useState<{ driver: DriverRoute; index: number } | null>(null);

  if (!result || !result.success) return null;

  const { drivers, summary } = result;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-5 bg-white/60 backdrop-blur-md rounded-2xl border border-white/60 shadow-xl shadow-indigo-500/5 space-y-5"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
          <span className="text-lg">📊</span>
          다중 배송원 최적화 결과
        </h3>
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
            균형도 <span className={`ml-1 font-bold ${summary.balanceScore >= 0.8 ? 'text-emerald-600' : summary.balanceScore >= 0.6 ? 'text-amber-600' : 'text-rose-600'}`}>{(summary.balanceScore * 100).toFixed(0)}%</span>
          </div>
          <div className="group relative">
            <button className="w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-[10px] text-slate-600 transition-colors">
              ?
            </button>
            <div className="absolute right-0 top-7 w-64 p-3 bg-slate-800 text-slate-200 text-xs rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl">
              <div className="font-bold text-white mb-1">균형도란?</div>
              <div className="leading-relaxed">배송원 간 작업량(거리/시간)의 균형을 나타내는 지표입니다.</div>
              <div className="mt-2 text-slate-400">100%에 가까울수록 모든 배송원의 작업량이 균등합니다.</div>
              <div className="mt-1 text-amber-400 font-medium">70% 미만이면 작업량 재분배를 권장합니다.</div>
            </div>
          </div>
        </div>
      </div>

      {/* 전체 요약 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-white rounded-xl border border-slate-100 shadow-sm text-center">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">총 거리</div>
          <div className="text-lg font-black text-slate-800">{(summary.totalDistance / 1000).toFixed(1)}<span className="text-xs font-medium text-slate-400 ml-0.5">km</span></div>
        </div>
        <div className="p-3 bg-white rounded-xl border border-slate-100 shadow-sm text-center">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">총 시간</div>
          <div className="text-lg font-black text-slate-800">{Math.round(summary.totalTime / 60)}<span className="text-xs font-medium text-slate-400 ml-0.5">분</span></div>
        </div>
        <div className="p-3 bg-white rounded-xl border border-slate-100 shadow-sm text-center">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">평균 거리</div>
          <div className="text-lg font-black text-slate-800">{(summary.averageDistance / 1000).toFixed(1)}<span className="text-xs font-medium text-slate-400 ml-0.5">km</span></div>
        </div>
      </div>

      {/* 배송원별 상세 정보 */}
      <div className="space-y-3">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">배송원별 경로</div>
        <div className="space-y-3">
          {drivers.map((driver, index) => {
            const color = DRIVER_COLORS[index % DRIVER_COLORS.length];
            return (
              <motion.div
                key={driver.driverId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.01, backgroundColor: "rgba(255, 255, 255, 0.8)" }}
                className={`p-4 rounded-xl border ${color.border} ${color.bg} space-y-3 cursor-pointer hover:shadow-md transition-all duration-200 group relative overflow-hidden`}
                onClick={() => setSelectedDriver({ driver, index })}
              >
                <div className="flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2 h-8 rounded-full ${color.dot}`}></div>
                    <div>
                      <span className={`font-bold text-sm ${color.text}`}>
                        {driver.driverId.replace('driver-', '배송원 ')}
                      </span>
                      <div className="text-[10px] text-slate-500 font-medium">
                        {driver.destinations.length}개 경유지
                      </div>
                    </div>
                  </div>
                  <div className={`w-8 h-8 rounded-full bg-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm text-lg`}>
                    👉
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs relative z-10 bg-white/50 p-2 rounded-lg border border-white/50">
                  <div>
                    <div className="text-[10px] text-slate-400">거리</div>
                    <div className={`font-bold ${color.text}`}>
                      {(driver.totalDistance / 1000).toFixed(1)}km
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">이동</div>
                    <div className={`font-bold ${color.text}`}>
                      {Math.round(driver.travelTime / 60)}분
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">대기</div>
                    <div className={`font-bold ${color.text}`}>
                      {Math.round(driver.dwellTime / 60)}분
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">합계</div>
                    <div className={`font-bold ${color.text}`}>
                      {Math.round(driver.totalTime / 60)}분
                    </div>
                  </div>
                </div>

                {/* 경유지 목록 (간단 버전) */}
                {driver.destinations.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/50 relative z-10">
                    <div className="text-[10px] font-medium text-slate-400 mb-1.5 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                      경유지 순서
                    </div>
                    <div className="space-y-1">
                      {driver.destinations.slice(0, 2).map((dest, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs text-slate-600">
                          <span className={`flex-none w-4 h-4 rounded-full ${color.bg} border ${color.border} flex items-center justify-center text-[9px] font-bold ${color.text}`}>
                            {idx + 1}
                          </span>
                          <span className="truncate opacity-80">
                            {dest.address || `위도: ${dest.latitude.toFixed(4)}, 경도: ${dest.longitude.toFixed(4)}`}
                          </span>
                        </div>
                      ))}
                      {driver.destinations.length > 2 && (
                        <div className="text-[10px] text-slate-400 pl-6">
                          ... 외 {driver.destinations.length - 2}개 경유지
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* 경로 분배 이유 설명 */}
      <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">💡</span>
          <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">경로 분배 방식</h4>
        </div>
        <div className="text-xs text-indigo-800/80 space-y-1.5 pl-1">
          <div className="flex items-start gap-1.5">
            <span className="text-indigo-400 mt-0.5">•</span>
            <span><strong>균등 분배:</strong> 경유지를 배송원 수로 나누어 균등하게 배정합니다.</span>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="text-indigo-400 mt-0.5">•</span>
            <span><strong>거리 최소화:</strong> 각 배송원의 총 이동 거리를 최소화하도록 최적화합니다.</span>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="text-indigo-400 mt-0.5">•</span>
            <span><strong>작업량 균형:</strong> 배송원 간 작업량(거리+시간)의 균형을 맞춥니다.</span>
          </div>
        </div>
        {summary.balanceScore < 0.7 && (
          <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
            <span className="text-lg">⚠️</span>
            <span className="mt-0.5">현재 균형도가 낮습니다. 배송원 수를 조정하거나 경유지를 수동으로 재배정해보세요.</span>
          </div>
        )}
        <div className="pt-3 border-t border-indigo-100">
          <button
            className="w-full text-xs font-bold px-3 py-2.5 bg-white border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition-all shadow-sm flex items-center justify-center gap-2"
            onClick={() => {
              // 대안 경로 제안 (배송원 수 조정)
              const suggestions = [];
              if (drivers.length < 10) {
                suggestions.push(`배송원 수를 ${drivers.length + 1}명으로 증가`);
              }
              if (drivers.length > 2) {
                suggestions.push(`배송원 수를 ${drivers.length - 1}명으로 감소`);
              }
              if (suggestions.length > 0) {
                alert(`대안 제안:\n${suggestions.join('\n')}\n\n배송원 수를 조정한 후 다시 계산해보세요.`);
              }
            }}
          >
            🔄 대안 경로 제안 보기
          </button>
        </div>
      </div>

      {/* 배송원별 상세 모달 */}
      <AnimatePresence>
        {selectedDriver && (
          <DriverRouteDetailModal
            isOpen={!!selectedDriver}
            onClose={() => setSelectedDriver(null)}
            driver={selectedDriver.driver}
            driverIndex={selectedDriver.index}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
