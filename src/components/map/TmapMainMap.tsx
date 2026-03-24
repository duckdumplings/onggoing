'use client';

import React, { useMemo, useState, useEffect } from 'react';
import TmapMap from './TmapMap';
import { useRouteOptimization } from '@/hooks/useRouteOptimization.tsx';
import {
  STOP_FEE,
  fuelSurchargeHourlyCorrect,
  perJobBasePrice,
  perJobRegularPrice,
  pickHourlyRate,
  roundUpTo30Minutes,
} from '@/domains/quote/pricing';

// 배송원별 색상 정의
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

const formatWon = (value: number) => `₩${Math.round(value).toLocaleString('ko-KR')}`;

const toVehicleKey = (vehicleTypeLabel: string): 'ray' | 'starex' =>
  vehicleTypeLabel === '스타렉스' ? 'starex' : 'ray';

export default function TmapMainMap() {
  const { routeData, isLoading, options, origins, destinations, optimizeRouteWith, setOptions } = useRouteOptimization();
  const [multiDriverResult, setMultiDriverResult] = useState<any>(null);
  const [focusedWaypoint, setFocusedWaypoint] = useState<{ lat: number; lng: number; label?: string } | null>(null);
  const [detailTab, setDetailTab] = useState<'kpi' | 'eta'>('kpi');
  const [showRecalculateDialog, setShowRecalculateDialog] = useState(false);
  const [showTollDetailDialog, setShowTollDetailDialog] = useState(false);
  const [showQuoteDetailDialog, setShowQuoteDetailDialog] = useState(false);
  const [quoteDetailTab, setQuoteDetailTab] = useState<'pricing' | 'eta' | 'route'>('pricing');
  const [sliderExtraWaitMin, setSliderExtraWaitMin] = useState(0);
  const [sliderExtraDistancePercent, setSliderExtraDistancePercent] = useState(0);
  const [pendingRoadOption, setPendingRoadOption] = useState<'time-first' | 'toll-saving' | 'free-road-first' | null>(null);
  const [isApplyingRoadOption, setIsApplyingRoadOption] = useState(false);
  const [roadOptionApplyError, setRoadOptionApplyError] = useState<string | null>(null);

  const roadOptionLabelMap: Record<'time-first' | 'toll-saving' | 'free-road-first', string> = {
    'time-first': '시간 우선',
    'toll-saving': '통행료 절감',
    'free-road-first': '무료도로 우선',
  };

  const openRoadOptionDialog = (option: 'time-first' | 'toll-saving' | 'free-road-first') => {
    const current = ((routeData?.summary as any)?.roadOptionApplied || options?.roadOption || 'time-first') as 'time-first' | 'toll-saving' | 'free-road-first';
    if (option === current || isLoading || isApplyingRoadOption) return;
    setPendingRoadOption(option);
    setRoadOptionApplyError(null);
    setShowRecalculateDialog(true);
  };

  const applyRoadOption = async () => {
    if (!pendingRoadOption) return;
    setIsApplyingRoadOption(true);
    setRoadOptionApplyError(null);
    try {
      await optimizeRouteWith({
        options: {
          roadOption: pendingRoadOption,
        },
      });
      const latestError = (window as any)?.lastOptimizationError;
      if (latestError) {
        setRoadOptionApplyError(latestError?.details || latestError?.message || latestError?.error || '재계산에 실패했습니다.');
        return;
      }
      setOptions({ roadOption: pendingRoadOption });
      setShowRecalculateDialog(false);
      setPendingRoadOption(null);
    } catch (error) {
      setRoadOptionApplyError(error instanceof Error ? error.message : '재계산 중 오류가 발생했습니다.');
    } finally {
      setIsApplyingRoadOption(false);
    }
  };
  const formatHm = (iso?: string) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  };

  // 다중 배송원 결과 감지
  useEffect(() => {
    const checkMultiDriver = () => {
      try {
        const result = (window as any).multiDriverResult;
        if (result && result.success) {
          setMultiDriverResult(result);
        } else {
          setMultiDriverResult(null);
        }
      } catch (e) {
        // ignore
      }
    };

    checkMultiDriver();
    const interval = setInterval(checkMultiDriver, 500);
    return () => clearInterval(interval);
  }, []);
  const waypoints = useMemo(() => {
    const points: Array<{
      lat: number;
      lng: number;
      label?: string;
      icon?: string;
      color?: string;
      priority?: number;
      address?: string;
      driverId?: string;
      driverIndex?: number;
      arrivalTime?: string;
      departureTime?: string;
      dwellTime?: number;
      etaLabel?: string;
      riskColor?: string;
    }> = [];

    // 다중 배송원 모드 처리
    if (multiDriverResult && multiDriverResult.success) {
      console.log('[TmapMainMap] 다중 배송원 모드 - waypoints 생성');

      // 각 배송원별로 waypoints 생성
      multiDriverResult.drivers.forEach((driver: any, driverIndex: number) => {
        const color = DRIVER_COLORS[driverIndex % DRIVER_COLORS.length];

        // 출발지 (각 배송원 공통)
        if (driver.origin) {
          points.push({
            lat: driver.origin.latitude,
            lng: driver.origin.longitude,
            label: '출발',
            icon: '🚀',
            color: '#10B981',
            priority: 1,
            address: driver.origin.address || '',
            driverId: driver.driverId,
            driverIndex
          });
        }

        // 각 배송원의 경유지들
        driver.destinations.forEach((dest: any, index: number) => {
          const isLast = index === driver.destinations.length - 1;
          // routeData에서 waypoint 정보 가져오기
          const waypoints = driver.routeData?.waypoints || [];
          const waypoint = waypoints.find((wp: any) =>
            Math.abs(wp.latitude - dest.latitude) < 0.0001 &&
            Math.abs(wp.longitude - dest.longitude) < 0.0001
          ) || waypoints[index];

          points.push({
            lat: dest.latitude,
            lng: dest.longitude,
            label: `${driverIndex + 1}-${index + 1}`, // 배송원번호-경유지번호
            icon: isLast ? '🎯' : '📍',
            color: color,
            priority: 2,
            address: dest.address || waypoint?.address || '',
            driverId: driver.driverId,
            driverIndex,
            arrivalTime: waypoint?.arrivalTime,
            departureTime: waypoint?.departureTime,
            dwellTime: waypoint?.dwellTime,
            etaLabel: waypoint?.arrivalTime ? formatHm(waypoint.arrivalTime) : undefined,
            riskColor: '#22C55E'
          });
        });
      });

      return points;
    }

    // 단일 차량 모드
    if (routeData) {
      // 출발지 추가 (더 명확한 아이콘과 색상)
      if (origins) {
        console.log('[TmapMainMap] Adding origin pin:', { lat: origins.lat, lng: origins.lng, label: '출발' });
        points.push({
          lat: origins.lat,
          lng: origins.lng,
          label: '출발',
          icon: '🚀', // 출발 아이콘
          color: '#10B981', // 초록색
          priority: 1,
          address: (origins as any).address || ''
        });
      } else {
      }

      // 경로 계산 완료 상태의 목적지 핀
      const routeWaypoints = ((routeData as any)?.waypoints || []) as Array<{
        latitude: number;
        longitude: number;
        address?: string;
        arrivalTime?: string;
        departureTime?: string;
        dwellTime?: number;
      }>;

      destinations.forEach((dest, index) => {
        const isLastDestination = index === destinations.length - 1;
        const hasExplicitDestination = Boolean(
          (routeData.summary as any)?.useExplicitDestination ||
          (routeData.summary as any)?.finalDestinationAddress ||
          options?.useExplicitDestination
        );
        const isDestinationNode = isLastDestination && hasExplicitDestination;
        const matched = routeWaypoints.find((wp) =>
          Math.abs(wp.latitude - dest.lat) < 0.0001 &&
          Math.abs(wp.longitude - dest.lng) < 0.0001
        ) || routeWaypoints[index];

        let label, icon, color, priority;

        if (isDestinationNode) {
          // 최종 도착지
          label = '도착';
          icon = '🎯';
          color = '#EF4444'; // 빨간색
          priority = 3;
        } else {
          // 경유지들 (최적화된 순서 번호 표시)
          label = String(index + 1);
          icon = '📍';
          color = '#3B82F6'; // 파란색
          priority = 2;
        }

        points.push({
          lat: dest.lat,
          lng: dest.lng,
          label,
          icon,
          color,
          priority,
          address: (dest as any).address || matched?.address || '',
          arrivalTime: matched?.arrivalTime,
          departureTime: matched?.departureTime,
          dwellTime: matched?.dwellTime,
          etaLabel: matched?.arrivalTime ? formatHm(matched.arrivalTime) : undefined,
          riskColor: (() => {
            if (isDestinationNode) return '#2563EB';
            const deliveryTime = (matched as any)?.deliveryTime as string | undefined;
            if (!deliveryTime || !matched?.arrivalTime) return '#22C55E';
            const [dh, dm] = deliveryTime.split(':').map(Number);
            const due = dh * 60 + dm;
            const arrivalDate = new Date(matched.arrivalTime);
            const arrival = arrivalDate.getHours() * 60 + arrivalDate.getMinutes();
            if (arrival > due) return '#EF4444';
            if (due - arrival <= 20) return '#F59E0B';
            return '#22C55E';
          })()
        });
      });
    } else {
      // 경로 계산 전: 입력 확정 프리뷰 핀 렌더링
      if (origins) {
        points.push({
          lat: origins.lat,
          lng: origins.lng,
          label: '출발',
          icon: '🚀',
          color: '#10B981',
          priority: 1,
          address: (origins as any).address || ''
        });
      }

      destinations.forEach((dest, index) => {
        const isExplicitDestination = !!options?.useExplicitDestination && index === destinations.length - 1;
        points.push({
          lat: dest.lat,
          lng: dest.lng,
          label: isExplicitDestination ? '도착' : String(index + 1),
          icon: isExplicitDestination ? '🎯' : '📍',
          color: isExplicitDestination ? '#EF4444' : '#3B82F6',
          priority: 2,
          address: (dest as any).address || ''
        });
      });
    }
    return points;
  }, [origins, destinations, options?.useExplicitDestination, routeData, multiDriverResult]);

  // 경로 최적화 효과 계산
  const optimizationEffect = useMemo(() => {
    if (!routeData?.summary) return null;

    const summary = routeData.summary as any;
    if (!summary.optimizationInfo) return null;

    const { distanceSaved, originalOrder, optimizedOrder } = summary.optimizationInfo;
    const savingsPercent = originalOrder && optimizedOrder
      ? ((distanceSaved / (summary.totalDistance + distanceSaved)) * 100).toFixed(1)
      : null;

    return {
      distanceSaved,
      savingsPercent,
      hasOptimization: summary.optimizeOrder
    };
  }, [routeData]);

  const routeQuoteDetail = useMemo(() => {
    if (!routeData?.summary) return null;
    const summary = routeData.summary as any;
    const totalDistanceM = Number(summary.totalDistance || 0);
    const totalTimeSec = Number(summary.travelTime || summary.totalTime || 0);
    const destinationCount = Math.max(0, waypoints.length - 1);
    const dwellTotalMin = Math.round(Number(summary.dwellTime || 0) / 60);
    const vehicleTypeLabel = summary?.vehicleTypeCode === '2' ? '스타렉스' : '레이';
    const scheduleType: 'regular' | 'ad-hoc' = 'ad-hoc';
    const vehicleKey = toVehicleKey(vehicleTypeLabel);
    const distanceKm = totalDistanceM / 1000;
    const driveMinutes = Math.ceil(totalTimeSec / 60);
    const totalBillMinutes = driveMinutes + dwellTotalMin;

    const billMinutes = roundUpTo30Minutes(totalBillMinutes);
    const hourlyRate = pickHourlyRate(vehicleKey, billMinutes);
    const hourlyBase = Math.round((billMinutes / 60) * hourlyRate);
    const hourlyFuelSurcharge = fuelSurchargeHourlyCorrect(vehicleKey, distanceKm, billMinutes);
    const hourlyTotal = hourlyBase + hourlyFuelSurcharge;

    const perJobBase = perJobBasePrice(vehicleKey, distanceKm);
    const effectiveStopsCount = Math.max(0, destinationCount - 1);
    const perJobStopFee = effectiveStopsCount * STOP_FEE[vehicleKey];
    const perJobTotal = perJobBase + perJobStopFee;
    const recommendedPlan: 'hourly' | 'perJob' = hourlyTotal <= perJobTotal ? 'hourly' : 'perJob';
    const totalPrice = recommendedPlan === 'hourly' ? hourlyTotal : perJobTotal;
    const calculatePricing = (distance: number, billMin: number, stops: number) => {
      const roundedBillMin = roundUpTo30Minutes(Math.max(30, billMin));
      const calcHourlyRate = pickHourlyRate(vehicleKey, roundedBillMin);
      const calcHourlyBase = Math.round((roundedBillMin / 60) * calcHourlyRate);
      const calcHourlyFuel = fuelSurchargeHourlyCorrect(vehicleKey, distance, roundedBillMin);
      const calcHourlyTotal = calcHourlyBase + calcHourlyFuel;

      const calcPerJobBase = perJobBasePrice(vehicleKey, distance);
      const calcEffectiveStops = Math.max(0, stops - 1);
      const calcPerJobStopFee = calcEffectiveStops * STOP_FEE[vehicleKey];
      const calcPerJobTotal = calcPerJobBase + calcPerJobStopFee;
      const calcRecommended: 'hourly' | 'perJob' = calcHourlyTotal <= calcPerJobTotal ? 'hourly' : 'perJob';
      const calcTotal = calcRecommended === 'hourly' ? calcHourlyTotal : calcPerJobTotal;

      return {
        hourlyTotal: calcHourlyTotal,
        perJobTotal: calcPerJobTotal,
        recommendedPlan: calcRecommended,
        totalPrice: calcTotal,
      };
    };

    const basePricing = calculatePricing(distanceKm, totalBillMinutes, destinationCount);

    const interactiveDistanceKm = Number((distanceKm * (1 + sliderExtraDistancePercent / 100)).toFixed(1));
    const interactiveBillMinutes = totalBillMinutes + sliderExtraWaitMin;
    
    // 레이/스타렉스, 정기/비정기 4가지 조합 모두 계산
    const calcPricingForScenario = (veh: 'ray' | 'starex', schedule: 'regular' | 'ad-hoc') => {
      const roundedBillMin = roundUpTo30Minutes(Math.max(30, interactiveBillMinutes));
      
      // 시간당
      const calcHourlyRate = pickHourlyRate(veh, roundedBillMin);
      let calcHourlyBase = Math.round((roundedBillMin / 60) * calcHourlyRate);
      if (schedule === 'regular') {
        // 정기일 경우 시간당 단가 할인/할증 등을 여기에 적용 (현재는 동일하다고 가정하거나 로직 추가)
        // 일단은 그대로 둠
      }
      const calcHourlyFuel = fuelSurchargeHourlyCorrect(veh, interactiveDistanceKm, roundedBillMin);
      const calcHourlyTotal = calcHourlyBase + calcHourlyFuel;

      // 단건
      let calcPerJobBase = 0;
      if (schedule === 'regular') {
        calcPerJobBase = perJobRegularPrice(veh, interactiveDistanceKm);
      } else {
        calcPerJobBase = perJobBasePrice(veh, interactiveDistanceKm);
      }
      const calcEffectiveStops = Math.max(0, destinationCount - 1);
      const calcPerJobStopFee = calcEffectiveStops * STOP_FEE[veh];
      const calcPerJobTotal = calcPerJobBase + calcPerJobStopFee;
      
      const calcRecommended: 'hourly' | 'perJob' = calcHourlyTotal <= calcPerJobTotal ? 'hourly' : 'perJob';
      
      return {
        hourlyTotal: calcHourlyTotal,
        perJobTotal: calcPerJobTotal,
        recommendedPlan: calcRecommended,
        totalPrice: calcRecommended === 'hourly' ? calcHourlyTotal : calcPerJobTotal,
        hourlyBreakdown: { billMinutes: roundedBillMin, hourlyRate: calcHourlyRate, base: calcHourlyBase, fuelSurcharge: calcHourlyFuel },
        perJobBreakdown: { base: calcPerJobBase, stopFee: calcPerJobStopFee, effectiveStopsCount: calcEffectiveStops }
      };
    };

    const scenarios = {
      ray: {
        'ad-hoc': calcPricingForScenario('ray', 'ad-hoc'),
        regular: calcPricingForScenario('ray', 'regular')
      },
      starex: {
        'ad-hoc': calcPricingForScenario('starex', 'ad-hoc'),
        regular: calcPricingForScenario('starex', 'regular')
      }
    };
    
    // 현재 선택된 차량/스케줄 기준 인터랙티브 결과
    const interactivePricing = scenarios[vehicleKey][scheduleType];
    
    const savings = Math.abs(interactivePricing.hourlyTotal - interactivePricing.perJobTotal);
    const aiInsight = interactivePricing.recommendedPlan === 'hourly'
      ? `시간당 요금제가 ${formatWon(savings)} 더 유리합니다! 경유지 대기 시간이 길거나 거리가 짧을수록 시간당 요금제가 추천됩니다.`
      : `단건 요금제가 ${formatWon(savings)} 더 유리합니다! 경유지가 적고 운행 거리가 길수록 단건 요금제가 경제적입니다.`;

    const waypointRows = (((routeData as any)?.waypoints as Array<any>) || []).map((wp: any, idx: number) => ({
      order: idx + 1,
      address: wp.address || `경유지 ${idx + 1}`,
      arrival: formatHm(wp.arrivalTime),
      departure: formatHm(wp.departureTime),
      dwell: Number(wp.dwellTime || 0),
    }));
    const roadComparisons = Array.isArray(summary?.roadComparisons) ? summary.roadComparisons : [];

    return {
      vehicleTypeLabel,
      scheduleType,
      distanceKm: Number(distanceKm.toFixed(1)),
      driveMinutes,
      dwellTotalMin,
      totalBillMinutes,
      destinationCount,
      hourlyTotal,
      perJobTotal,
      hourlyBreakdown: {
        billMinutes,
        hourlyRate,
        base: hourlyBase,
        fuelSurcharge: hourlyFuelSurcharge,
      },
      perJobBreakdown: {
        base: perJobBase,
        stopFee: perJobStopFee,
        effectiveStopsCount,
      },
      totalPrice,
      recommendedPlan,
      roadOptionLabel: summary?.roadOptionApplied === 'toll-saving'
        ? '통행료 절감'
        : summary?.roadOptionApplied === 'free-road-first'
          ? '무료도로 우선'
          : '시간 우선',
      trafficLabel: summary?.usedTraffic === 'realtime' ? '실시간 반영' : '예측 교통',
      returnPolicyLabel: summary?.returnedToOrigin ? '출발지 복귀' : '마지막 경유지 종료',
      waypointRows,
      roadComparisons,
      caseVariations: [], // removed
      scenarios, // 4 combinations
      interactiveScenario: {
        distanceKm: interactiveDistanceKm,
        billMinutes: interactiveBillMinutes,
        pricing: interactivePricing,
      },
      aiInsight,
      assumptions: ['좌측 패널 계산은 비정기(ad-hoc) 기준으로 견적을 표시합니다.'],
    };
  }, [routeData, waypoints.length, sliderExtraWaitMin, sliderExtraDistancePercent]);

  // 다중 배송원 모드일 때 routeData 배열 생성
  const multiDriverRouteData = useMemo(() => {
    if (!multiDriverResult || !multiDriverResult.success) return null;

    return multiDriverResult.drivers.map((driver: any) => ({
      ...driver.routeData,
      driverId: driver.driverId,
      driverIndex: driver.driverIndex,
      color: DRIVER_COLORS[driver.driverIndex % DRIVER_COLORS.length]
    }));
  }, [multiDriverResult]);

  return (
    <div className="relative w-full map-container" style={{ height: '100vh', margin: 0, padding: 0 }}>
      <TmapMap
        routeData={multiDriverRouteData || (routeData as any)}
        waypoints={waypoints as any}
        useExplicitDestination={options?.useExplicitDestination}
        className="w-full"
        height="h-screen"
        multiDriverMode={!!multiDriverResult}
        focusedWaypoint={focusedWaypoint}
      />

      {/* 우측 사이드 패널 (Drawer) - 경로 정보 */}
      {multiDriverResult && multiDriverResult.success ? (
        <div className="absolute top-4 right-4 bottom-4 z-[1000] w-[calc(100vw-2rem)] sm:w-[440px] pointer-events-none">
          <div className="bg-white/95 backdrop-blur-xl border border-white/60 shadow-2xl shadow-indigo-500/10 rounded-2xl p-5 h-full flex flex-col pointer-events-auto">
            <div className="flex-none flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <span className="text-white text-2xl">🚛</span>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-lg">다중 배송원 최적화</h3>
                <p className="text-xs text-slate-500 font-medium">{multiDriverResult.drivers.length}명 배송원</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
              {/* 전체 통계 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">총 거리</div>
                  <div className="text-lg font-black text-slate-800">
                    {(multiDriverResult.summary.totalDistance / 1000).toFixed(1)}<span className="text-xs font-normal text-slate-500 ml-0.5">km</span>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">총 시간</div>
                  <div className="text-lg font-black text-slate-800">
                    {Math.ceil(multiDriverResult.summary.totalTime / 60)}<span className="text-xs font-normal text-slate-500 ml-0.5">분</span>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">평균 거리</div>
                  <div className="text-lg font-black text-slate-800">
                    {(multiDriverResult.summary.averageDistance / 1000).toFixed(1)}<span className="text-xs font-normal text-slate-500 ml-0.5">km</span>
                  </div>
                </div>
              </div>

              {/* 균형도 및 상세 정보 */}
              <div className="bg-indigo-50/50 rounded-xl p-4 border border-indigo-100">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-indigo-900 font-bold text-sm">작업량 균형도</span>
                    <div className="text-[10px] text-indigo-600/80 mt-0.5 font-medium">
                      배송원 간 작업량 분배 비율
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-indigo-600">
                      {(multiDriverResult.summary.balanceScore * 100).toFixed(0)}%
                    </span>
                    <div className="text-[10px] text-indigo-600/80 mt-0.5 font-bold uppercase tracking-wider">
                      {multiDriverResult.summary.balanceScore >= 0.7 ? 'Balanced' : 'Unbalanced'}
                    </div>
                  </div>
                </div>
                {/* Visual Progress Bar for Balance */}
                <div className="w-full bg-indigo-200/50 rounded-full h-2 mb-3 overflow-hidden flex">
                  {multiDriverResult.drivers.map((driver: any, idx: number) => {
                    const totalDist = multiDriverResult.summary.totalDistance;
                    const widthPercent = totalDist > 0 ? (driver.totalDistance / totalDist) * 100 : 0;
                    return (
                      <div 
                        key={`bar-${idx}`} 
                        className="h-full border-r border-white/50" 
                        style={{ width: `${widthPercent}%`, backgroundColor: DRIVER_COLORS[idx % DRIVER_COLORS.length] }}
                      ></div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-indigo-700 font-medium">
                  <div className="bg-white/60 rounded px-2 py-1">평균 거리: {(multiDriverResult.summary.averageDistance / 1000).toFixed(1)}km</div>
                  <div className="bg-white/60 rounded px-2 py-1">평균 시간: {Math.round(multiDriverResult.summary.averageTime / 60)}분</div>
                </div>
              </div>

              {/* 배송원별 상세 정보 */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">배송원별 작업량</div>
                {multiDriverResult.drivers.map((driver: any, idx: number) => {
                  const color = DRIVER_COLORS[idx % DRIVER_COLORS.length];
                  return (
                    <div
                      key={driver.driverId}
                      className="p-3 rounded-xl border transition-all hover:shadow-md bg-white hover:border-indigo-200 group"
                      style={{ borderColor: `${color}40` }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full border"
                            style={{ backgroundColor: color, borderColor: `${color}80` }}
                          ></div>
                          <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-700 transition-colors">
                            {driver.driverId.replace('driver-', '배송원 ')}
                          </span>
                        </div>
                        <div className="text-[10px] font-medium text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                          {driver.destinations.length}개 경유지
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <div className="text-[10px] text-slate-400 mb-0.5">거리</div>
                          <div className="font-bold text-slate-700">
                            {(driver.totalDistance / 1000).toFixed(1)}km
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 mb-0.5">이동</div>
                          <div className="font-bold text-slate-700">
                            {Math.round(driver.travelTime / 60)}분
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 mb-0.5">체류</div>
                          <div className="font-bold text-slate-700">
                            {Math.round(driver.dwellTime / 60)}분
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : routeData?.summary && (
        <div className="absolute top-4 right-4 bottom-4 z-[1000] w-[calc(100vw-2rem)] sm:w-[440px] pointer-events-none">
          <div className="bg-white/95 backdrop-blur-xl border border-white/60 shadow-2xl shadow-indigo-500/10 rounded-2xl p-5 h-full flex flex-col pointer-events-auto">
            <div className="flex-none flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <span className="text-white text-lg">🗺️</span>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-lg tracking-tight">경로 정보</h3>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Real-time Optimization</p>
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-1 custom-scrollbar space-y-4">
              <div className="flex-none flex p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setDetailTab('kpi')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${detailTab === 'kpi' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  KPI 요약
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('eta')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${detailTab === 'eta' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  ETA 상세
                </button>
              </div>

              {/* 주요 정보 카드 */}
              {detailTab === 'kpi' && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center hover:border-indigo-100 transition-colors group">
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1 group-hover:text-indigo-500 transition-colors">총 거리</div>
                    <div className="text-lg font-black text-slate-800">
                      {((routeData.summary as any).totalDistance / 1000).toFixed(1)}<span className="text-xs font-normal text-slate-500 ml-0.5">km</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center hover:border-indigo-100 transition-colors group">
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1 group-hover:text-indigo-500 transition-colors">이동 시간</div>
                    <div className="text-lg font-black text-slate-800">
                      {Math.ceil((routeData.summary as any).totalTime / 60)}<span className="text-xs font-normal text-slate-500 ml-0.5">분</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center hover:border-indigo-100 transition-colors group">
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1 group-hover:text-indigo-500 transition-colors">경유지</div>
                    <div className="text-lg font-black text-slate-800">
                      {waypoints?.length ? waypoints.length - 2 : 0}<span className="text-xs font-normal text-slate-500 ml-0.5">개</span>
                    </div>
                  </div>
                </div>
              )}

              {detailTab === 'kpi' && Array.isArray((routeData.summary as any)?.roadComparisons) && (
                <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100 space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">통행료 시뮬레이션 (A/B/C)</div>
                    <div className="flex items-center gap-1.5">
                      {((routeData.summary as any).roadComparisons as Array<any>).some((row: any) => row?.tollSource === 'estimated') && (
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
                          추정치 포함
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowTollDetailDialog(true)}
                        className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5 hover:bg-indigo-100 transition-colors"
                      >
                        상세
                      </button>
                    </div>
                  </div>
                  {((routeData.summary as any).roadComparisons as Array<any>).map((item, idx) => {
                    const isFreeRoadEstimated = item.option === 'free-road-first' && item.tollSource === 'estimated';
                    const isCurrent = Boolean(item.isSelected);
                    return (
                      <button
                        type="button"
                        key={`${item.option}-${idx}`}
                        onClick={() => openRoadOptionDialog(item.option)}
                        disabled={isLoading || isApplyingRoadOption || isCurrent}
                        title={isCurrent ? '현재 적용된 도로 옵션입니다.' : `${item.label} 옵션으로 재계산`}
                        className={`group relative grid grid-cols-4 gap-2 text-xs rounded-lg px-3 py-2 border transition-all duration-300 overflow-hidden ${item.isSelected
                          ? 'bg-white border-indigo-300 shadow-md ring-2 ring-indigo-500/20 z-10 scale-[1.02]'
                          : 'bg-slate-50/80 border-slate-200/60 text-slate-400 hover:bg-white hover:border-indigo-200 hover:shadow-sm hover:z-10 hover:scale-[1.01]'} ${isCurrent ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        {/* Hover Glow Effect */}
                        {!isCurrent && (
                          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/5 to-indigo-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
                        )}
                        <span className={`font-bold transition-colors ${item.isSelected ? 'text-indigo-700' : 'text-slate-500 group-hover:text-indigo-600'}`}>{item.label}</span>
                        <span className={`transition-colors ${item.isSelected ? 'text-slate-700' : 'text-slate-400 group-hover:text-slate-600'}`}>{(item.estimatedDistance / 1000).toFixed(1)}km</span>
                        <span className={`transition-colors ${item.isSelected ? 'text-slate-700' : 'text-slate-400 group-hover:text-slate-600'}`}>{Math.ceil(item.estimatedTime / 60)}분</span>
                        <span className={`font-medium text-right transition-colors ${item.isSelected ? 'text-slate-900' : 'text-slate-500 group-hover:text-slate-800'}`}>
                          {isFreeRoadEstimated ? '확인 불가' : `${item.estimatedToll.toLocaleString()}원`}
                          {item.tollSource === 'estimated' && !isFreeRoadEstimated && (
                            <span className="ml-1 text-[10px] text-amber-600 font-semibold">(추정)</span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                  <div className="text-[10px] text-slate-500 px-1">
                    * 통행료는 API 제공값을 우선 사용하며, 미제공 구간은 거리 기반 추정값으로 표시됩니다.
                  </div>
                </div>
              )}

              {detailTab === 'eta' && !!(routeData as any)?.waypoints?.length && (
                <div className="bg-slate-50/50 rounded-xl p-1 border border-slate-100 max-h-48 overflow-y-auto custom-scrollbar">
                  <div className="grid grid-cols-4 gap-2 px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200/50">
                    <span>순서</span>
                    <span>도착</span>
                    <span>출발</span>
                    <span>체류</span>
                  </div>
                  {((routeData as any).waypoints as Array<any>).map((wp: any, idx: number) => (
                    <button
                      type="button"
                      key={`${wp.latitude}-${wp.longitude}-${idx}`}
                      onClick={() => setFocusedWaypoint({ lat: wp.latitude, lng: wp.longitude, label: String(idx + 1) })}
                      className="w-full text-left text-xs text-slate-600 grid grid-cols-4 gap-2 px-3 py-2 rounded-lg hover:bg-white hover:shadow-sm transition-all group"
                    >
                      <span className="font-bold text-slate-400 group-hover:text-indigo-600 transition-colors">{idx + 1}</span>
                      <span className="font-medium">{formatHm(wp.arrivalTime)}</span>
                      <span className="font-medium text-slate-400">{formatHm(wp.departureTime)}</span>
                      <span className="text-slate-400">{wp.dwellTime ?? 0}분</span>
                    </button>
                  ))}
                </div>
              )}

              {/* 최적화 효과 표시 (개선된 디자인) */}
              {optimizationEffect?.hasOptimization && (
                <div className="bg-gradient-to-r from-violet-50 to-indigo-50 rounded-xl p-4 border border-indigo-100 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="text-4xl">✨</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2 relative z-10">
                    <span className="text-indigo-600 text-sm">⚡</span>
                    <span className="text-indigo-900 font-bold text-sm">AI 최적화 효과</span>
                  </div>
                  <div className="flex justify-between items-end relative z-10">
                    <span className="text-indigo-600/80 text-xs font-medium">절약 거리</span>
                    <div className="text-right">
                      <span className="text-2xl font-black text-indigo-600 tracking-tight">
                        +{(optimizationEffect.distanceSaved / 1000).toFixed(1)}
                        <span className="text-sm font-bold ml-0.5">km</span>
                      </span>
                    </div>
                  </div>
                  {optimizationEffect.savingsPercent && (
                    <div className="mt-2 pt-2 border-t border-indigo-200/50 flex justify-between items-center relative z-10">
                      <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">Efficiency</span>
                      <span className="text-xs font-bold text-indigo-700 bg-white/50 px-2 py-0.5 rounded-full">
                        {optimizationEffect.savingsPercent}% 향상
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* 상태 정보 */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-slate-500 font-medium text-[10px] uppercase tracking-wider">최적화</span>
                    <span className="text-slate-700 font-bold text-xs">
                      {(routeData.summary as any)?.optimizeOrder ? '자동 순서' : '수동 순서'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-slate-500 font-medium text-[10px] uppercase tracking-wider">차량</span>
                    <span className="text-slate-700 font-bold text-xs">
                      {(routeData.summary as any)?.vehicleTypeCode === '2' ? '스타렉스' : '레이'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-slate-500 font-medium text-[10px] uppercase tracking-wider">도로 옵션</span>
                  <span className="text-slate-700 font-bold text-xs flex items-center gap-1">
                    {(routeData.summary as any)?.roadOptionApplied === 'toll-saving'
                      ? <><span className="text-emerald-500">💰</span> 통행료 절감</>
                      : (routeData.summary as any)?.roadOptionApplied === 'free-road-first'
                        ? <><span className="text-emerald-500">🛣️</span> 무료도로 우선</>
                        : <><span className="text-amber-500">⚡</span> 시간 우선</>}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-slate-500 font-medium text-[10px] uppercase tracking-wider">종료 정책</span>
                  <span className="text-slate-700 font-bold text-xs flex items-center gap-1">
                    {(routeData.summary as any)?.returnedToOrigin
                      ? <><span className="text-indigo-500">↩️</span> 출발지 복귀</>
                      : <><span className="text-rose-500">🏁</span> 마지막 경유지 종료</>}
                  </span>
                </div>
              </div>
            </div>

            {/* 교통정보 상태 */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="text-[10px] font-medium text-slate-400 text-center bg-slate-50/50 rounded-lg py-2 flex items-center justify-center gap-1.5">
                {(routeData.summary as any)?.usedTraffic === 'realtime'
                  ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> 실시간 교통정보 반영됨</>
                  : <><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> 과거 데이터 기반 예측</>
                }
              </div>
            </div>
            {routeQuoteDetail && (
              <button
                type="button"
                onClick={() => {
                  setQuoteDetailTab('pricing');
                  setShowQuoteDetailDialog(true);
                }}
                className="mt-3 w-full rounded-xl border border-indigo-200 bg-indigo-50 py-2.5 text-sm font-bold text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                견적 상세 보기
              </button>
            )}
          </div>
        </div>
      )}

      {showQuoteDetailDialog && routeQuoteDetail && (
        <div className="absolute inset-0 z-[2300] bg-slate-900/35 backdrop-blur-[2px] flex items-center justify-center px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl p-5 max-h-[86vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-base font-extrabold text-slate-800">견적 상세 정보 (전체 시나리오)</h4>
              <button
                type="button"
                onClick={() => setShowQuoteDetailDialog(false)}
                className="text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                닫기
              </button>
            </div>
            
            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 mb-3">
              <div className="flex-1">
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">총 주행 거리</div>
                <div className="text-base font-black text-slate-800">{routeQuoteDetail.distanceKm} km</div>
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <div className="flex-1">
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">총 과금시간</div>
                <div className="text-base font-black text-slate-800">{routeQuoteDetail.totalBillMinutes} 분</div>
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <div className="flex-1">
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">경유지</div>
                <div className="text-base font-black text-slate-800">{routeQuoteDetail.destinationCount} 곳</div>
              </div>
            </div>

            <div className="flex p-1 bg-slate-100 rounded-lg mb-3">
              <button
                type="button"
                onClick={() => setQuoteDetailTab('pricing')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${quoteDetailTab === 'pricing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                요금 상세
              </button>
              <button
                type="button"
                onClick={() => setQuoteDetailTab('eta')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${quoteDetailTab === 'eta' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                ETA 상세
              </button>
              <button
                type="button"
                onClick={() => setQuoteDetailTab('route')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${quoteDetailTab === 'route' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                경로/옵션
              </button>
            </div>
            {quoteDetailTab === 'pricing' && (
              <>
                {/* 시나리오 매트릭스 */}
                {routeQuoteDetail.scenarios && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4 mb-3 shadow-sm">
                    <h4 className="font-bold text-slate-800 flex items-center gap-2 mb-3">
                      <span className="text-indigo-500">📊</span>
                      전체 운임 시나리오 비교
                    </h4>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[500px]">
                        <thead>
                          <tr>
                            <th className="py-2 px-3 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 rounded-tl-lg">차량 / 스케줄</th>
                            <th className="py-2 px-3 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500">시간당 요금제</th>
                            <th className="py-2 px-3 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 rounded-tr-lg">단건 요금제</th>
                          </tr>
                        </thead>
                        <tbody className="text-xs">
                          <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-semibold text-slate-700">레이 <span className="text-slate-400 font-medium text-[10px] ml-1">비정기</span></td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{formatWon(routeQuoteDetail.scenarios.ray?.['ad-hoc']?.hourlyTotal || 0)}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{formatWon(routeQuoteDetail.scenarios.ray?.['ad-hoc']?.perJobTotal || 0)}</td>
                          </tr>
                          <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-semibold text-slate-700">레이 <span className="text-slate-400 font-medium text-[10px] ml-1">정기</span></td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{formatWon(routeQuoteDetail.scenarios.ray?.regular?.hourlyTotal || 0)}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{formatWon(routeQuoteDetail.scenarios.ray?.regular?.perJobTotal || 0)}</td>
                          </tr>
                          <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-semibold text-slate-700">스타렉스 <span className="text-slate-400 font-medium text-[10px] ml-1">비정기</span></td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{formatWon(routeQuoteDetail.scenarios.starex?.['ad-hoc']?.hourlyTotal || 0)}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{formatWon(routeQuoteDetail.scenarios.starex?.['ad-hoc']?.perJobTotal || 0)}</td>
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-semibold text-slate-700 rounded-bl-lg">스타렉스 <span className="text-slate-400 font-medium text-[10px] ml-1">정기</span></td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{formatWon(routeQuoteDetail.scenarios.starex?.regular?.hourlyTotal || 0)}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-900 rounded-br-lg">{formatWon(routeQuoteDetail.scenarios.starex?.regular?.perJobTotal || 0)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 요금 변동 시뮬레이터 */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs shadow-sm mb-3">
                  <div className="flex items-center justify-between mb-4">
                    <div className="font-bold text-slate-800 text-sm">운임 시뮬레이터</div>
                    <button 
                      onClick={() => { setSliderExtraWaitMin(0); setSliderExtraDistancePercent(0); }}
                      className="text-[10px] text-slate-400 hover:text-indigo-600 bg-white border border-slate-200 px-2 py-1 rounded"
                    >
                      초기화
                    </button>
                  </div>
                  
                  <div className="space-y-5">
                    {/* 추가 대기 시간 슬라이더 */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="font-semibold text-slate-600">추가 대기/작업 시간</label>
                        <span className="font-bold text-indigo-600">+{sliderExtraWaitMin}분</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="120" 
                        step="10" 
                        value={sliderExtraWaitMin} 
                        onChange={(e) => setSliderExtraWaitMin(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                      <div className="text-[10px] text-slate-400 mt-1">상하차 또는 지연 시간 추가 시 요금 변화 확인</div>
                    </div>

                    {/* 거리 할증 슬라이더 */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="font-semibold text-slate-600">실제 운행 거리 오차</label>
                        <span className="font-bold text-indigo-600">+{sliderExtraDistancePercent}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="50" 
                        step="5" 
                        value={sliderExtraDistancePercent} 
                        onChange={(e) => setSliderExtraDistancePercent(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                      <div className="text-[10px] text-slate-400 mt-1">우회 도로 이용 등 실주행 거리 증가 시 요금 변화 확인</div>
                    </div>

                    {/* 시뮬레이션 결과 */}
                    <div className="mt-4 p-3 bg-white rounded-lg border border-indigo-100 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold mb-0.5">시뮬레이션 적용 요금</div>
                        <div className="text-xs text-slate-600">
                          {routeQuoteDetail.interactiveScenario.distanceKm}km · {routeQuoteDetail.interactiveScenario.billMinutes}분
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black text-indigo-700">{formatWon(routeQuoteDetail.interactiveScenario.pricing.totalPrice)}</div>
                        <div className="text-[10px] font-bold text-slate-500">추천: {routeQuoteDetail.interactiveScenario.pricing.recommendedPlan === 'hourly' ? '시간당' : '단건'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
                  <div>총 거리: {routeQuoteDetail.distanceKm}km</div>
                  <div>총 과금시간: {routeQuoteDetail.totalBillMinutes}분</div>
                  <div>주행시간: {routeQuoteDetail.driveMinutes}분 / 체류시간: {routeQuoteDetail.dwellTotalMin}분</div>
                  <div>목적지 수: {routeQuoteDetail.destinationCount}곳</div>
                  <div>차량: {routeQuoteDetail.vehicleTypeLabel}</div>
                  <div>스케줄: 비정기</div>
                </div>
              </>
            )}
            {quoteDetailTab === 'eta' && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="grid grid-cols-5 gap-2 px-2 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                  <span>순서</span>
                  <span>주소</span>
                  <span>도착</span>
                  <span>출발</span>
                  <span>체류</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {routeQuoteDetail.waypointRows.map((row: any) => (
                    <div key={`${row.order}-${row.address}`} className="grid grid-cols-5 gap-2 px-2 py-2 text-xs text-slate-700 border-b border-slate-100">
                      <span className="font-bold text-slate-500">{row.order}</span>
                      <span className="truncate" title={row.address}>{row.address}</span>
                      <span>{row.arrival}</span>
                      <span>{row.departure}</span>
                      <span>{row.dwell}분</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {quoteDetailTab === 'route' && (
              <>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                    <div className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">총 거리</div>
                    <div className="text-base font-black text-indigo-800 mt-1">{routeQuoteDetail.distanceKm}km</div>
                  </div>
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                    <div className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">총 과금시간</div>
                    <div className="text-base font-black text-indigo-800 mt-1">{routeQuoteDetail.totalBillMinutes}분</div>
                  </div>
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                    <div className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">경유지</div>
                    <div className="text-base font-black text-indigo-800 mt-1">{routeQuoteDetail.destinationCount}곳</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3 text-sm">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">교통정보</div>
                    <div className="font-bold text-slate-800 mt-1">{routeQuoteDetail.trafficLabel}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">도로 옵션</div>
                    <div className="font-bold text-slate-800 mt-1">{routeQuoteDetail.roadOptionLabel}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">종료 정책</div>
                    <div className="font-bold text-slate-800 mt-1">{routeQuoteDetail.returnPolicyLabel}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
                  <div className="font-semibold text-slate-700 mb-1">도로 옵션 비교</div>
                  {routeQuoteDetail.roadComparisons.length === 0 && (
                    <div>비교 데이터가 없습니다.</div>
                  )}
                  {routeQuoteDetail.roadComparisons.map((row: any, idx: number) => (
                    <div key={`${row.option}-${idx}`}>
                      {row.label}: {(row.estimatedDistance / 1000).toFixed(1)}km · {Math.ceil(row.estimatedTime / 60)}분 · {row.option === 'free-road-first' && row.tollSource === 'estimated' ? '통행료 확인 불가' : `${Number(row.estimatedToll || 0).toLocaleString()}원`}
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1 mt-3">
                  <div className="font-semibold text-slate-700 mb-1">방문 순서(주소)</div>
                  {routeQuoteDetail.waypointRows.length === 0 && <div>경유지 정보가 없습니다.</div>}
                  {routeQuoteDetail.waypointRows.map((row: any) => (
                    <div key={`route-address-${row.order}`} className="truncate" title={row.address}>
                      {row.order}. {row.address}
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="mt-3 text-[11px] text-slate-500">
              * {routeQuoteDetail.assumptions[0]}
            </div>
          </div>
        </div>
      )}

      {/* 로딩 오버레이 (개선된 디자인) */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/20 backdrop-blur-sm flex items-center justify-center z-[2000]">
          <div className="bg-white/90 backdrop-blur-xl p-8 text-center rounded-2xl shadow-2xl border border-white/60">
            <div className="relative w-16 h-16 mx-auto mb-6">
              <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div className="text-slate-800 font-black text-xl mb-2 tracking-tight">최적 경로 계산 중</div>
            <div className="text-sm text-slate-500 font-medium">AI가 실시간 교통정보를 분석하고 있습니다</div>
          </div>
        </div>
      )}

      {showRecalculateDialog && pendingRoadOption && (
        <div className="absolute inset-0 z-[2500] bg-slate-900/35 backdrop-blur-[2px] flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl p-5">
            <h4 className="text-base font-extrabold text-slate-800 mb-2">경로 재계산</h4>
            <p className="text-sm text-slate-600 leading-relaxed">
              <span className="font-bold text-indigo-700">{roadOptionLabelMap[pendingRoadOption]}</span> 옵션으로 경로를 다시 계산할까요?
              결과 경로/소요시간/통행료가 바뀔 수 있습니다.
            </p>
            {roadOptionApplyError && (
              <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {roadOptionApplyError}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isApplyingRoadOption) return;
                  setShowRecalculateDialog(false);
                  setPendingRoadOption(null);
                  setRoadOptionApplyError(null);
                }}
                className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={applyRoadOption}
                disabled={isApplyingRoadOption}
                className="px-3 py-2 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {isApplyingRoadOption ? '재계산 중...' : '재계산'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTollDetailDialog && (
        <div className="absolute inset-0 z-[2400] bg-slate-900/35 backdrop-blur-[2px] flex items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-base font-extrabold text-slate-800">통행료 상세 정보</h4>
              <button
                type="button"
                onClick={() => setShowTollDetailDialog(false)}
                className="text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                닫기
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {(((routeData?.summary as any)?.roadComparisons as Array<any>) || []).map((row: any, idx: number) => (
                <div key={`${row.option}-detail-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-extrabold text-slate-800">{row.label}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${row.tollSource === 'api' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {row.tollSource === 'api' ? '실측(API)' : '추정'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 leading-relaxed">
                    {row.tollSource === 'api'
                      ? 'Tmap 경로 응답의 통행료 필드 기반으로 계산한 값입니다.'
                      : 'Tmap 응답에 통행료 상세 필드가 없어 거리 기반으로 추정한 값입니다.'}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    거리 {(row.estimatedDistance / 1000).toFixed(1)}km · 소요 {Math.ceil(row.estimatedTime / 60)}분 · 통행료 {row.option === 'free-road-first' && row.tollSource === 'estimated' ? '확인 불가' : `${Number(row.estimatedToll || 0).toLocaleString()}원`}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[11px] text-slate-500 leading-relaxed">
              * 통행료 발생 여부는 고속도로/유료도로 진입 여부와 옵션에 따라 달라지며,
              API 제공 범위에 따라 상세 근거가 제한될 수 있습니다.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
