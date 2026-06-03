'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Truck, Sparkles, Zap, Coins, Route, CornerUpLeft, Flag, BarChart3, Calculator } from 'lucide-react';
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
import { reportActionFailure } from '@/libs/errorReporting';
import { buildRouteQuotePrompt, buildRouteQuoteContext } from '@/domains/dispatch/utils/routeQuotePrompt';

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
  const { routeData, isLoading, options, origins, destinations, optimizeRouteWith, setOptions, multiDriverResult, vehicleType, sendChatPrompt, openWorkspace, workspaceTab, routeSlotEl } = useRouteOptimization();
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

  // 현재 지도 경로를 자연어로 정리해 견적챗에 주입한다("이 경로로 견적").
  // 자연어와 함께 구조화 컨텍스트(확정 주소)를 같이 보내 에이전트의 재파싱/재지오코딩 훼손을 막는다.
  const handleQuoteFromRoute = () => {
    const summary: any = routeData?.summary || {};
    const promptInput = {
      vehicleType,
      originAddress: (origins as any)?.address,
      destinationAddresses: (destinations || []).map((d) => (d as any)?.address),
      totalDistanceMeters: summary.totalDistance,
      totalTimeSeconds: summary.totalTime,
    };
    sendChatPrompt(buildRouteQuotePrompt(promptInput), buildRouteQuoteContext(promptInput));
  };

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
        const message = latestError?.details || latestError?.message || latestError?.error || '재계산에 실패했습니다.';
        setRoadOptionApplyError(typeof message === 'string' ? message : '재계산에 실패했습니다.');
        reportActionFailure({
          source: 'route_optimization',
          action: 'recalculate_road_option',
          error: new Error(typeof message === 'string' ? message : 'road option recalculation failed'),
          context: {
            pendingRoadOption,
            latestError,
          },
        });
        return;
      }
      setOptions({ roadOption: pendingRoadOption });
      setShowRecalculateDialog(false);
      setPendingRoadOption(null);
    } catch (error) {
      setRoadOptionApplyError(error instanceof Error ? error.message : '경로 재계산이 중단됐어요. 잠시 후 다시 시도해 주세요.');
      reportActionFailure({
        source: 'route_optimization',
        action: 'recalculate_road_option_exception',
        error,
        context: { pendingRoadOption },
      });
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

  // 다중 배송원 결과는 useRouteOptimization 컨텍스트에서 공유받는다.
  // (이전엔 전역 객체를 500ms 간격으로 폴링했음)
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

        let label, color, priority;

        if (isDestinationNode) {
          // 최종 도착지
          label = '도착';
          color = '#EF4444'; // 빨간색
          priority = 3;
        } else {
          // 경유지들 (최적화된 순서 번호 표시)
          label = String(index + 1);
          color = '#3B82F6'; // 파란색
          priority = 2;
        }

        points.push({
          lat: dest.lat,
          lng: dest.lng,
          label,
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
        <div className="absolute left-4 top-[4.75rem] z-[1000] w-[calc(100vw-2rem)] sm:w-[340px] pointer-events-none">
          <div className="glass-canvas rounded-2xl p-4 pointer-events-auto animate-in fade-in slide-in-from-left-2 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-lg flex-none">
                <Truck className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-foreground text-base leading-tight">다중 배송원 배차</h3>
                <p className="text-xs text-muted-foreground font-medium">
                  {multiDriverResult.drivers.length}명 · 균형 {(multiDriverResult.summary.balanceScore * 100).toFixed(0)}%
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-muted px-2 py-2 text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">총거리</div>
                <div className="mt-0.5 text-base font-black text-foreground">
                  {(multiDriverResult.summary.totalDistance / 1000).toFixed(1)}<span className="ml-0.5 text-[10px] font-normal text-muted-foreground">km</span>
                </div>
              </div>
              <div className="rounded-xl bg-muted px-2 py-2 text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">총시간</div>
                <div className="mt-0.5 text-base font-black text-foreground">
                  {Math.ceil(multiDriverResult.summary.totalTime / 60)}<span className="ml-0.5 text-[10px] font-normal text-muted-foreground">분</span>
                </div>
              </div>
              <div className="rounded-xl bg-muted px-2 py-2 text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">평균</div>
                <div className="mt-0.5 text-base font-black text-foreground">
                  {(multiDriverResult.summary.averageDistance / 1000).toFixed(1)}<span className="ml-0.5 text-[10px] font-normal text-muted-foreground">km</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => openWorkspace('result')}
              className="focus-ring-inset mt-3 w-full rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-[0.99]"
              title="배차 결과 상세 보기"
            >
              배송원별 상세 보기
            </button>
          </div>
        </div>
      ) : null}

      {/* 단일경로 '경로 상세' — 우측 워크스페이스 '경로' 탭으로 portal 주입(지도 의존 로직은 여기 유지) */}
      {routeSlotEl && workspaceTab === 'route' && routeData?.summary
        ? createPortal(
          <div className="flex h-full flex-col bg-muted/40 p-4">
            {(<>
            <button
              type="button"
              onClick={handleQuoteFromRoute}
              className="flex-none inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-lg hover:opacity-90 active:scale-[0.99] transition"
            >
              <Calculator className="w-4 h-4" />
              이 경로로 견적
            </button>
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-1 custom-scrollbar space-y-4 mt-4">
              <div className="flex-none flex p-1 bg-muted rounded-lg">
                <button
                  type="button"
                  onClick={() => setDetailTab('kpi')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${detailTab === 'kpi' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  KPI 요약
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('eta')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${detailTab === 'eta' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  ETA 상세
                </button>
              </div>

              {/* 주요 정보 카드 */}
              {detailTab === 'kpi' && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted rounded-xl p-3 border border-border text-center hover:border-indigo-100 transition-colors group">
                    <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1 group-hover:text-indigo-500 transition-colors">총 거리</div>
                    <div className="text-lg font-black text-foreground">
                      {((routeData.summary as any).totalDistance / 1000).toFixed(1)}<span className="text-xs font-normal text-muted-foreground ml-0.5">km</span>
                    </div>
                  </div>

                  <div className="bg-muted rounded-xl p-3 border border-border text-center hover:border-indigo-100 transition-colors group">
                    <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1 group-hover:text-indigo-500 transition-colors">이동 시간</div>
                    <div className="text-lg font-black text-foreground">
                      {Math.ceil((routeData.summary as any).totalTime / 60)}<span className="text-xs font-normal text-muted-foreground ml-0.5">분</span>
                    </div>
                  </div>

                  <div className="bg-muted rounded-xl p-3 border border-border text-center hover:border-indigo-100 transition-colors group">
                    <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1 group-hover:text-indigo-500 transition-colors">경유지</div>
                    <div className="text-lg font-black text-foreground">
                      {waypoints?.length ? waypoints.length - 2 : 0}<span className="text-xs font-normal text-muted-foreground ml-0.5">개</span>
                    </div>
                  </div>
                </div>
              )}

              {detailTab === 'kpi' && Array.isArray((routeData.summary as any)?.roadComparisons) && (() => {
                const comparisons = (routeData.summary as any).roadComparisons as Array<any>;
                const current = comparisons.find((row) => row?.isSelected) || comparisons[0];
                const formatTimeDelta = (deltaSec: number) => {
                  const min = Math.round(deltaSec / 60);
                  if (min === 0) return '동일';
                  return `${min > 0 ? '+' : ''}${min}분`;
                };
                const formatTollDelta = (deltaWon: number) => {
                  if (deltaWon === 0) return '동일';
                  const abs = Math.abs(deltaWon).toLocaleString();
                  return `${deltaWon > 0 ? '+' : '-'}${abs}원`;
                };
                return (
                  <div className="bg-slate-50/50 rounded-xl p-3 border border-border space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">옵션별 비교 (현재 적용 옵션 대비)</div>
                      <div className="flex items-center gap-1.5">
                        {comparisons.some((row: any) => row?.tollSource !== 'api') && (
                          <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5" title="일부 옵션은 Tmap 통행료 실측이 없어 실주행 하이패스 실비로 정산됩니다(추정 금액을 쓰지 않습니다).">
                            일부 실비 정산
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
                    <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3">
                      <span className="col-span-3">옵션</span>
                      <span className="col-span-2 text-right">거리</span>
                      <span className="col-span-3 text-right">시간 (Δ)</span>
                      <span className="col-span-4 text-right">통행료 (Δ)</span>
                    </div>
                    {comparisons.map((item, idx) => {
                      const isCurrent = Boolean(item.isSelected);
                      const timeDeltaSec = item.estimatedTime - (current?.estimatedTime ?? item.estimatedTime);
                      // 통행료 실측이 양쪽 다 있을 때만 Δ를 계산한다(실측 vs 미산출 비교는 의미 없음).
                      const bothTollApi = item.tollSource === 'api' && current?.tollSource === 'api';
                      const tollDeltaWon = bothTollApi
                        ? (item.estimatedToll as number) - (current?.estimatedToll as number)
                        : 0;
                      const tollUnavailable = item.tollSource !== 'api' || !Number.isFinite(item.estimatedToll);
                      return (
                        <button
                          type="button"
                          key={`${item.option}-${idx}`}
                          onClick={() => openRoadOptionDialog(item.option)}
                          disabled={isLoading || isApplyingRoadOption || isCurrent}
                          title={isCurrent ? '현재 적용된 도로 옵션입니다.' : `${item.label} 옵션으로 재계산`}
                          className={`group relative grid grid-cols-12 gap-2 items-center text-xs rounded-lg px-3 py-2 border transition-all duration-300 overflow-hidden ${item.isSelected
                            ? 'bg-card border-indigo-300 shadow-md ring-2 ring-indigo-500/20 z-10'
                            : 'bg-slate-50/80 border-slate-200/60 text-muted-foreground hover:bg-card hover:border-indigo-200 hover:shadow-sm'} ${isCurrent ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                          {!isCurrent && (
                            <div className="absolute inset-0 bg-gradient-to-r from-foreground/0 via-foreground/5 to-foreground/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
                          )}
                          <span className={`col-span-3 font-bold text-left transition-colors ${item.isSelected ? 'text-indigo-700' : 'text-muted-foreground group-hover:text-indigo-600'}`}>
                            {item.label}
                            {isCurrent && <span className="ml-1 text-[9px] font-bold text-indigo-500">●</span>}
                          </span>
                          <span className={`col-span-2 text-right transition-colors ${item.isSelected ? 'text-foreground' : 'text-muted-foreground group-hover:text-muted-foreground'}`}>
                            {(item.estimatedDistance / 1000).toFixed(1)}km
                          </span>
                          <span className={`col-span-3 text-right transition-colors ${item.isSelected ? 'text-foreground font-medium' : 'text-muted-foreground group-hover:text-foreground'}`}>
                            <span>{Math.ceil(item.estimatedTime / 60)}분</span>
                            {!isCurrent && (
                              <span className={`ml-1 text-[10px] font-semibold ${timeDeltaSec > 0 ? 'text-rose-500' : timeDeltaSec < 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                                ({formatTimeDelta(timeDeltaSec)})
                              </span>
                            )}
                          </span>
                          <span className={`col-span-4 text-right font-medium transition-colors ${item.isSelected ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>
                            {tollUnavailable ? (
                              <span className="text-muted-foreground italic" title="Tmap 통행료 실측이 없어 실주행 하이패스 실비로 정산됩니다(추정 금액 미사용).">실비 정산</span>
                            ) : (
                              <>
                                <span>{(item.estimatedToll as number) === 0 ? '무료' : `${(item.estimatedToll as number).toLocaleString()}원`}</span>
                                {!isCurrent && bothTollApi && (
                                  <span className={`ml-1 text-[10px] font-semibold ${tollDeltaWon > 0 ? 'text-rose-500' : tollDeltaWon < 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                                    ({formatTollDelta(tollDeltaWon)})
                                  </span>
                                )}
                                <span
                                  className="ml-1 text-[9px] font-semibold px-1 py-px rounded bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  title="Tmap에서 제공한 공식 통행료입니다."
                                >
                                  Tmap
                                </span>
                              </>
                            )}
                          </span>
                        </button>
                      );
                    })}
                    <div className="text-[10px] text-muted-foreground px-1 leading-snug">
                      Δ는 현재 적용 옵션 대비 변화량 · <span className="text-rose-500">붉은색</span>은 늘어남, <span className="text-emerald-600">초록색</span>은 줄어듦.
                      <span className="text-emerald-700 font-semibold ml-1">Tmap</span> 뱃지는 공식 통행료, <span className="text-amber-700 font-semibold">추정</span>은 거리 기반 추정값입니다.
                    </div>
                  </div>
                );
              })()}

              {detailTab === 'eta' && !!(routeData as any)?.waypoints?.length && (
                <div className="bg-slate-50/50 rounded-xl p-1 border border-border max-h-48 overflow-y-auto custom-scrollbar">
                  <div className="grid grid-cols-4 gap-2 px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-slate-200/50">
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
                      className="w-full text-left text-xs text-muted-foreground grid grid-cols-4 gap-2 px-3 py-2 rounded-lg hover:bg-card hover:shadow-sm transition-all group"
                    >
                      <span className="font-bold text-muted-foreground group-hover:text-indigo-600 transition-colors">{idx + 1}</span>
                      <span className="font-medium">{formatHm(wp.arrivalTime)}</span>
                      <span className="font-medium text-muted-foreground">{formatHm(wp.departureTime)}</span>
                      <span className="text-muted-foreground">{wp.dwellTime ?? 0}분</span>
                    </button>
                  ))}
                </div>
              )}

              {/* 최적화 효과 표시 (개선된 디자인) */}
              {optimizationEffect?.hasOptimization && (
                <div className="bg-muted rounded-xl p-4 border border-indigo-100 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Sparkles className="w-8 h-8 text-indigo-500" />
                  </div>
                  <div className="flex items-center gap-2 mb-2 relative z-10">
                    <Zap className="w-4 h-4 text-indigo-600" />
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
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between py-2 px-3 bg-muted rounded-lg border border-border">
                    <span className="text-muted-foreground font-medium text-[10px] uppercase tracking-wider">최적화</span>
                    <span className="text-foreground font-bold text-xs">
                      {(routeData.summary as any)?.optimizeOrder ? '자동 순서' : '수동 순서'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-2 px-3 bg-muted rounded-lg border border-border">
                    <span className="text-muted-foreground font-medium text-[10px] uppercase tracking-wider">차량</span>
                    <span className="text-foreground font-bold text-xs">
                      {(routeData.summary as any)?.vehicleTypeCode === '2' ? '스타렉스' : '레이'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 px-3 bg-muted rounded-lg border border-border">
                  <span className="text-muted-foreground font-medium text-[10px] uppercase tracking-wider">도로 옵션</span>
                  <span className="text-foreground font-bold text-xs flex items-center gap-1">
                    {(routeData.summary as any)?.roadOptionApplied === 'toll-saving'
                      ? <><Coins className="w-3.5 h-3.5 text-emerald-500" /> 통행료 절감</>
                      : (routeData.summary as any)?.roadOptionApplied === 'free-road-first'
                        ? <><Route className="w-3.5 h-3.5 text-emerald-500" /> 무료도로 우선</>
                        : <><Zap className="w-3.5 h-3.5 text-amber-500" /> 시간 우선</>}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 px-3 bg-muted rounded-lg border border-border">
                  <span className="text-muted-foreground font-medium text-[10px] uppercase tracking-wider">종료 정책</span>
                  <span className="text-foreground font-bold text-xs flex items-center gap-1">
                    {(routeData.summary as any)?.returnedToOrigin
                      ? <><CornerUpLeft className="w-3.5 h-3.5 text-indigo-500" /> 출발지 복귀</>
                      : <><Flag className="w-3.5 h-3.5 text-rose-500" /> 마지막 경유지 종료</>}
                  </span>
                </div>
              </div>
            </div>

            {/* 교통정보 상태 + 계산 기준 시각 */}
            <div className="mt-4 pt-3 border-t border-border space-y-1.5">
              <div className="text-[10px] font-medium text-muted-foreground text-center bg-slate-50/50 rounded-lg py-2 flex items-center justify-center gap-1.5">
                {(routeData.summary as any)?.usedTraffic === 'realtime'
                  ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> 실시간 교통정보 반영됨 (지금 출발 기준)</>
                  : <><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> 예측 교통 기반 (미래 출발 시각 설정됨)</>
                }
              </div>
              {(() => {
                const depAt = (routeData.summary as any)?.departureAt as string | null | undefined;
                if (!depAt) return null;
                const d = new Date(depAt);
                if (Number.isNaN(d.getTime())) return null;
                const label = d.toLocaleString('ko-KR', {
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                });
                return (
                  <div
                    className="text-[10px] text-muted-foreground text-center"
                    title="Tmap이 이 시각의 예측 교통 패턴으로 소요시간을 산출했습니다."
                  >
                    계산 기준 <span className="font-bold text-foreground">{label}</span> 출발
                  </div>
                );
              })()}
            </div>
            {routeQuoteDetail && (
              <button
                type="button"
                onClick={() => {
                  setQuoteDetailTab('pricing');
                  setShowQuoteDetailDialog(true);
                }}
                className="mt-3 w-full rounded-xl border border-primary/20 bg-primary/5 py-2.5 text-sm font-bold text-primary hover:bg-primary/10 transition-colors"
              >
                견적 상세 보기
              </button>
            )}
            </>)}
          </div>,
          routeSlotEl,
        )
        : null}

      {showQuoteDetailDialog && routeQuoteDetail && (
        <div
          className="absolute inset-0 z-[2300] glass-overlay flex items-center justify-center px-4 animate-in fade-in duration-200"
          onClick={() => setShowQuoteDetailDialog(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-border bg-card shadow-2xl p-5 max-h-[86vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-base font-extrabold text-foreground">견적 상세 정보 (전체 시나리오)</h4>
              <button
                type="button"
                onClick={() => setShowQuoteDetailDialog(false)}
                className="text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                닫기
              </button>
            </div>
            
            <div className="flex items-center gap-4 bg-muted p-4 rounded-xl border border-border mb-3">
              <div className="flex-1">
                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">총 주행 거리</div>
                <div className="text-base font-black text-foreground">{routeQuoteDetail.distanceKm} km</div>
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <div className="flex-1">
                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">총 과금시간</div>
                <div className="text-base font-black text-foreground">{routeQuoteDetail.totalBillMinutes} 분</div>
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <div className="flex-1">
                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">경유지</div>
                <div className="text-base font-black text-foreground">{routeQuoteDetail.destinationCount} 곳</div>
              </div>
            </div>

            <div className="flex p-1 bg-muted rounded-lg mb-3">
              <button
                type="button"
                onClick={() => setQuoteDetailTab('pricing')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${quoteDetailTab === 'pricing' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                요금 상세
              </button>
              <button
                type="button"
                onClick={() => setQuoteDetailTab('eta')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${quoteDetailTab === 'eta' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                ETA 상세
              </button>
              <button
                type="button"
                onClick={() => setQuoteDetailTab('route')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${quoteDetailTab === 'route' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                경로/옵션
              </button>
            </div>
            {quoteDetailTab === 'pricing' && (
              <>
                {/* 시나리오 매트릭스 */}
                {routeQuoteDetail.scenarios && (
                  <div className="rounded-lg border border-border bg-card p-4 mb-3 shadow-sm">
                    <h4 className="font-bold text-foreground flex items-center gap-2 mb-3">
                      <BarChart3 className="w-4 h-4 text-indigo-500" />
                      전체 운임 시나리오 비교
                    </h4>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[500px]">
                        <thead>
                          <tr>
                            <th className="py-2 px-3 bg-muted border-b border-border text-[11px] font-bold text-muted-foreground rounded-tl-lg">차량 / 스케줄</th>
                            <th className="py-2 px-3 bg-muted border-b border-border text-[11px] font-bold text-muted-foreground">시간당 요금제</th>
                            <th className="py-2 px-3 bg-muted border-b border-border text-[11px] font-bold text-muted-foreground rounded-tr-lg">단건 요금제</th>
                          </tr>
                        </thead>
                        <tbody className="text-xs">
                          <tr className="border-b border-border hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-semibold text-foreground">레이 <span className="text-muted-foreground font-medium text-[10px] ml-1">비정기</span></td>
                            <td className="py-2.5 px-3 font-bold text-foreground">{formatWon(routeQuoteDetail.scenarios.ray?.['ad-hoc']?.hourlyTotal || 0)}</td>
                            <td className="py-2.5 px-3 font-bold text-foreground">{formatWon(routeQuoteDetail.scenarios.ray?.['ad-hoc']?.perJobTotal || 0)}</td>
                          </tr>
                          <tr className="border-b border-border hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-semibold text-foreground">레이 <span className="text-muted-foreground font-medium text-[10px] ml-1">정기</span></td>
                            <td className="py-2.5 px-3 font-bold text-foreground">{formatWon(routeQuoteDetail.scenarios.ray?.regular?.hourlyTotal || 0)}</td>
                            <td className="py-2.5 px-3 font-bold text-foreground">{formatWon(routeQuoteDetail.scenarios.ray?.regular?.perJobTotal || 0)}</td>
                          </tr>
                          <tr className="border-b border-border hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-semibold text-foreground">스타렉스 <span className="text-muted-foreground font-medium text-[10px] ml-1">비정기</span></td>
                            <td className="py-2.5 px-3 font-bold text-foreground">{formatWon(routeQuoteDetail.scenarios.starex?.['ad-hoc']?.hourlyTotal || 0)}</td>
                            <td className="py-2.5 px-3 font-bold text-foreground">{formatWon(routeQuoteDetail.scenarios.starex?.['ad-hoc']?.perJobTotal || 0)}</td>
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-semibold text-foreground rounded-bl-lg">스타렉스 <span className="text-muted-foreground font-medium text-[10px] ml-1">정기</span></td>
                            <td className="py-2.5 px-3 font-bold text-foreground">{formatWon(routeQuoteDetail.scenarios.starex?.regular?.hourlyTotal || 0)}</td>
                            <td className="py-2.5 px-3 font-bold text-foreground rounded-br-lg">{formatWon(routeQuoteDetail.scenarios.starex?.regular?.perJobTotal || 0)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 요금 변동 시뮬레이터 */}
                <div className="rounded-lg border border-border bg-muted p-4 text-xs shadow-sm mb-3">
                  <div className="flex items-center justify-between mb-4">
                    <div className="font-bold text-foreground text-sm">운임 시뮬레이터</div>
                    <button 
                      onClick={() => { setSliderExtraWaitMin(0); setSliderExtraDistancePercent(0); }}
                      className="text-[10px] text-muted-foreground hover:text-indigo-600 bg-card border border-border px-2 py-1 rounded"
                    >
                      초기화
                    </button>
                  </div>
                  
                  <div className="space-y-5">
                    {/* 추가 대기 시간 슬라이더 */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="font-semibold text-muted-foreground">추가 대기/작업 시간</label>
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
                      <div className="text-[10px] text-muted-foreground mt-1">상하차 또는 지연 시간 추가 시 요금 변화 확인</div>
                    </div>

                    {/* 거리 할증 슬라이더 */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="font-semibold text-muted-foreground">실제 운행 거리 오차</label>
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
                      <div className="text-[10px] text-muted-foreground mt-1">우회 도로 이용 등 실주행 거리 증가 시 요금 변화 확인</div>
                    </div>

                    {/* 시뮬레이션 결과 */}
                    <div className="mt-4 p-3 bg-card rounded-lg border border-indigo-100 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-muted-foreground font-bold mb-0.5">시뮬레이션 적용 요금</div>
                        <div className="text-xs text-muted-foreground">
                          {routeQuoteDetail.interactiveScenario.distanceKm}km · {routeQuoteDetail.interactiveScenario.billMinutes}분
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black text-indigo-700">{formatWon(routeQuoteDetail.interactiveScenario.pricing.totalPrice)}</div>
                        <div className="text-[10px] font-bold text-muted-foreground">추천: {routeQuoteDetail.interactiveScenario.pricing.recommendedPlan === 'hourly' ? '시간당' : '단건'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground space-y-1">
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
              <div className="rounded-lg border border-border bg-muted p-2">
                <div className="grid grid-cols-5 gap-2 px-2 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border">
                  <span>순서</span>
                  <span>주소</span>
                  <span>도착</span>
                  <span>출발</span>
                  <span>체류</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {routeQuoteDetail.waypointRows.map((row: any) => (
                    <div key={`${row.order}-${row.address}`} className="grid grid-cols-5 gap-2 px-2 py-2 text-xs text-foreground border-b border-border">
                      <span className="font-bold text-muted-foreground">{row.order}</span>
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
                  <div className="rounded-lg border border-border bg-muted p-3">
                    <div className="text-xs text-muted-foreground">교통정보</div>
                    <div className="font-bold text-foreground mt-1">{routeQuoteDetail.trafficLabel}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted p-3">
                    <div className="text-xs text-muted-foreground">도로 옵션</div>
                    <div className="font-bold text-foreground mt-1">{routeQuoteDetail.roadOptionLabel}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted p-3">
                    <div className="text-xs text-muted-foreground">종료 정책</div>
                    <div className="font-bold text-foreground mt-1">{routeQuoteDetail.returnPolicyLabel}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground space-y-1">
                  <div className="font-semibold text-foreground mb-1">도로 옵션 비교</div>
                  {routeQuoteDetail.roadComparisons.length === 0 && (
                    <div>비교할 경로 데이터가 비어 있어요.</div>
                  )}
                  {routeQuoteDetail.roadComparisons.map((row: any, idx: number) => (
                    <div key={`${row.option}-${idx}`}>
                      {row.label}: {(row.estimatedDistance / 1000).toFixed(1)}km · {Math.ceil(row.estimatedTime / 60)}분 · {row.tollSource !== 'api' ? '통행료 실비 정산' : (Number(row.estimatedToll) === 0 ? '통행료 무료' : `${Number(row.estimatedToll || 0).toLocaleString()}원`)}
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground space-y-1 mt-3">
                  <div className="font-semibold text-foreground mb-1">방문 순서(주소)</div>
                  {routeQuoteDetail.waypointRows.length === 0 && <div>경유지 정보가 없습니다.</div>}
                  {routeQuoteDetail.waypointRows.map((row: any) => (
                    <div key={`route-address-${row.order}`} className="truncate" title={row.address}>
                      {row.order}. {row.address}
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="mt-3 text-[11px] text-muted-foreground">
              * {routeQuoteDetail.assumptions[0]}
            </div>
          </div>
        </div>
      )}

      {/* 로딩 오버레이 (개선된 디자인) */}
      {isLoading && (
        <div className="absolute inset-0 glass-overlay flex items-center justify-center z-[2000]">
          <div className="glass-canvas p-8 text-center rounded-2xl">
            <div className="relative w-16 h-16 mx-auto mb-6">
              <div className="absolute inset-0 border-4 border-border rounded-full"></div>
              <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div className="text-foreground font-black text-xl mb-2 tracking-tight">최적 경로 계산 중</div>
            <div className="text-sm text-muted-foreground font-medium">AI가 실시간 교통정보를 분석하고 있습니다</div>
          </div>
        </div>
      )}

      {showRecalculateDialog && pendingRoadOption && (
        <div className="absolute inset-0 z-[2500] glass-overlay flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl p-5">
            <h4 className="text-base font-extrabold text-foreground mb-2">경로 재계산</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
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
                className="px-3 py-2 text-xs font-bold rounded-lg border border-border text-muted-foreground hover:bg-muted"
              >
                취소
              </button>
              <button
                type="button"
                onClick={applyRoadOption}
                disabled={isApplyingRoadOption}
                className="px-3 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {isApplyingRoadOption ? '재계산 중...' : '재계산'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTollDetailDialog && (
        <div className="absolute inset-0 z-[2400] glass-overlay flex items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-base font-extrabold text-foreground">통행료 상세 정보</h4>
              <button
                type="button"
                onClick={() => setShowTollDetailDialog(false)}
                className="text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                닫기
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {(((routeData?.summary as any)?.roadComparisons as Array<any>) || []).map((row: any, idx: number) => (
                <div key={`${row.option}-detail-${idx}`} className="rounded-xl border border-border bg-muted px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-extrabold text-foreground">{row.label}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${row.tollSource === 'api' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {row.tollSource === 'api' ? '실측(API)' : '실비 정산'}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    {row.tollSource === 'api'
                      ? 'Tmap 경로 응답의 통행료 필드 기반 실측값입니다(무료도로는 0원).'
                      : 'Tmap 통행료 실측이 없어 실주행 하이패스 실비로 정산됩니다(추정 금액을 쓰지 않습니다).'}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    거리 {(row.estimatedDistance / 1000).toFixed(1)}km · 소요 {Math.ceil(row.estimatedTime / 60)}분 · 통행료 {row.tollSource !== 'api' ? '실비 정산' : (Number(row.estimatedToll) === 0 ? '무료' : `${Number(row.estimatedToll || 0).toLocaleString()}원`)}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
              * 통행료 발생 여부는 고속도로/유료도로 진입 여부와 옵션에 따라 달라지며,
              API 제공 범위에 따라 상세 근거가 제한될 수 있습니다.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
