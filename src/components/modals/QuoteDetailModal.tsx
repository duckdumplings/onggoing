'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { perJobBasePrice, perJobRegularPrice, STOP_FEE, PER_JOB_TABLE, HOURLY_RATE_TABLE } from '@/domains/quote/pricing';

interface QuoteDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  detail: any;
  plans: any;
  total: string;
  vehicle: string;
  scheduleType: string;
  routeData: any;
  destinations: any[];
  effectiveStopsCount: number;
  initialActiveTab?: 'summary' | 'hourly' | 'perjob' | 'analysis' | 'export' | 'rate';
}

export default function QuoteDetailModal({
  isOpen,
  onClose,
  detail,
  plans,
  vehicle,
  scheduleType,
  total,
  routeData,
  destinations,
  effectiveStopsCount,
  initialActiveTab
}: QuoteDetailModalProps) {
  // 안전한 기본값 설정
  const safeDetail = detail || {};
  const safePlans = plans || {};
  const safeRouteData = routeData || {};
  const safeDestinations = destinations || [];

  // 모달 내부에서 탭 상태 관리
  const [activeTab, setActiveTab] = useState<'summary' | 'hourly' | 'perjob' | 'analysis' | 'export' | 'rate'>(
    initialActiveTab || 'summary'
  );

  // 시간당 요금제 구간표(레이/스타렉스) 병합 뷰
  const hourlyRows = (HOURLY_RATE_TABLE && HOURLY_RATE_TABLE.ray ? HOURLY_RATE_TABLE.ray : []).map((r, idx) => {
    const starexTable = HOURLY_RATE_TABLE && HOURLY_RATE_TABLE.starex ? HOURLY_RATE_TABLE.starex : [];
    const starexRate = (starexTable[idx] && starexTable[idx].ratePerHour) != null
      ? starexTable[idx].ratePerHour
      : (starexTable.length > 0 ? starexTable[starexTable.length - 1].ratePerHour : r.ratePerHour);
    return {
      maxMinutes: r.maxMinutes,
      ray: r.ratePerHour,
      starex: starexRate,
    };
  });

  // initialActiveTab이 변경되면 activeTab도 업데이트
  useEffect(() => {
    if (initialActiveTab) {
      setActiveTab(initialActiveTab);
    }
  }, [initialActiveTab]);

  if (!isOpen) return null;

  const stopsCount = safeDestinations?.length || 0;
  // effectiveStopsCount를 props에서 받아서 사용
  const displayEffectiveStopsCount = effectiveStopsCount || Math.max(0, stopsCount - 2);

  const generateQuoteNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const time = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
    return `Q-${year}${month}${day}-${time}`;
  };

  // 비용 절감 계산 함수
  const calculateCostSavings = () => {
    if (!plans?.hourly?.total || !plans?.perJob?.total) return '—';

    const hourlyTotal = parseInt(plans.hourly.total.replace(/[^\d]/g, ''));
    const perJobTotal = parseInt(plans.perJob.total.replace(/[^\d]/g, ''));

    if (hourlyTotal > perJobTotal) {
      return `₩${(hourlyTotal - perJobTotal).toLocaleString()}`;
    } else {
      return `₩${(perJobTotal - hourlyTotal).toLocaleString()}`;
    }
  };

  // 추천 요금제 계산 함수
  const getRecommendedPlan = () => {
    if (!plans?.hourly?.total || !plans?.perJob?.total) return '—';

    const hourlyTotal = parseInt(plans.hourly.total.replace(/[^\d]/g, ''));
    const perJobTotal = parseInt(plans.perJob.total.replace(/[^\d]/g, ''));

    return hourlyTotal > perJobTotal ? '단건 요금제' : '시간당 요금제';
  };

  // 차량 타입별 요금 계산 함수들
  const calculateHourlyRate = (vehicleType: 'ray' | 'starex', billMinutes: number) => {
    const hourlyRate = vehicleType === 'ray' ? 15000 : 18000;
    return Math.round((billMinutes / 60) * hourlyRate);
  };

  const calculatePerJobBase = (vehicleType: 'ray' | 'starex', distanceKm: number, isRegular: boolean) => {
    return isRegular
      ? perJobRegularPrice(vehicleType, distanceKm)
      : perJobBasePrice(vehicleType, distanceKm);
  };

  const calculatePerJobStopFee = (vehicleType: 'ray' | 'starex', stopsCount: number, isRegular: boolean) => {
    if (isRegular) {
      if (vehicleType === 'ray') {
        return stopsCount * STOP_FEE.starex;
      } else {
        return stopsCount * Math.round(STOP_FEE.starex * 1.2);
      }
    } else {
      return stopsCount * STOP_FEE[vehicleType];
    }
  };

  // 자동견적 카드와 동일한 시간당 요금 계산 함수
  const calculateHourlyRateCorrect = (vehicleType: 'ray' | 'starex', billMinutes: number) => {
    const table = vehicleType === 'ray' ? [
      { maxMinutes: 120, ratePerHour: 26500 },
      { maxMinutes: 150, ratePerHour: 26500 },
      { maxMinutes: 180, ratePerHour: 23000 },
      { maxMinutes: 210, ratePerHour: 23000 },
      { maxMinutes: 240, ratePerHour: 22000 },
      { maxMinutes: 270, ratePerHour: 22000 },
      { maxMinutes: 300, ratePerHour: 21000 },
      { maxMinutes: 330, ratePerHour: 21000 },
      { maxMinutes: 360, ratePerHour: 21000 },
      { maxMinutes: 390, ratePerHour: 21000 },
      { maxMinutes: 420, ratePerHour: 21000 },
      { maxMinutes: 450, ratePerHour: 21000 },
      { maxMinutes: 480, ratePerHour: 21000 },
    ] : [
      { maxMinutes: 120, ratePerHour: 35000 },
      { maxMinutes: 150, ratePerHour: 35000 },
      { maxMinutes: 180, ratePerHour: 29000 },
      { maxMinutes: 210, ratePerHour: 29000 },
      { maxMinutes: 240, ratePerHour: 26500 },
      { maxMinutes: 270, ratePerHour: 26500 },
      { maxMinutes: 300, ratePerHour: 25000 },
      { maxMinutes: 330, ratePerHour: 25000 },
      { maxMinutes: 360, ratePerHour: 24500 },
      { maxMinutes: 390, ratePerHour: 24500 },
      { maxMinutes: 420, ratePerHour: 24500 },
      { maxMinutes: 450, ratePerHour: 24500 },
      { maxMinutes: 480, ratePerHour: 24500 },
    ];

    for (const row of table) {
      if (billMinutes <= row.maxMinutes) return row.ratePerHour;
    }
    return table[table.length - 1].ratePerHour;
  };

  // 자동견적 카드와 동일한 시간당 총액 계산 함수 (올림 제거)
  const calculateHourlyTotal = (vehicleType: 'ray' | 'starex', billMinutes: number, distanceKm: number) => {
    const hourlyRate = calculateHourlyRateCorrect(vehicleType, billMinutes);
    const base = Math.round((billMinutes / 60) * hourlyRate);
    // 동일 파일 내 단순화된 계산식 사용: 과금시간 기준 기본거리 초과분 10km 당 가산
    const baseDistance = (billMinutes / 60) * 10;
    let fuel = 0;
    if (distanceKm > baseDistance) {
      const extraKm = distanceKm - baseDistance;
      fuel = Math.ceil(extraKm / 10) * (vehicleType === 'ray' ? 2000 : 2800);
    }
    return base + fuel;
  };

  const downloadHTML = (tab: string) => {
    const quoteData = {
      quoteNumber: generateQuoteNumber(),
      date: new Date().toLocaleString('ko-KR'),
      total: total,
      vehicle: vehicle,
      scheduleType: scheduleType,
      routeData: safeRouteData,
      destinations: safeDestinations,
      effectiveStopsCount: effectiveStopsCount,
      plans: plans,
      detail: detail,
    };

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>견적서 - ${quoteData.quoteNumber}</title>
        <style>
          body { font-family: 'Arial', sans-serif; line-height: 1.6; margin: 20px; }
          h1, h2, h3 { color: #333; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .total { font-weight: bold; color: #007bff; }
          .highlight { background-color: #e9ecef; }
        </style>
      </head>
      <body>
        <h1>견적서 - ${quoteData.quoteNumber}</h1>
        <p>생성일시: ${quoteData.date}</p>

        <h2>기본 정보</h2>
        <p>차종: ${quoteData.vehicle}</p>
        <p>스케줄: ${quoteData.scheduleType}</p>
        <p>총 거리: ${quoteData.routeData.summary.totalDistance ? ((quoteData.routeData.summary.totalDistance / 1000).toFixed(1)) : '0.0'}km</p>
        <p>경유지: ${quoteData.destinations.length}개</p>

        <h2>시간 정보</h2>
        <p>주행 시간: ${quoteData.detail.driveMinutes || 0}분</p>
        <p>체류 시간: ${quoteData.detail.dwellTotalMinutes || 0}분</p>
        <p>총 운행시간: ${quoteData.detail.driveMinutes + quoteData.detail.dwellTotalMinutes}분</p>
        <p>과금시간: ${((quoteData.detail.billMinutes || 0) / 60).toFixed(1)}시간</p>

        <h2>요금 상세</h2>
        ${getRecommendedPlan() === '시간당 요금제' ? `
          <h3>시간당 요금제</h3>
          <p>과금시간: ${((quoteData.plans.hourly.billMinutes || 0) / 60).toFixed(1)}시간</p>
          <p>시간당 단가: ₩${(quoteData.plans.hourly.ratePerHour ?? 0).toLocaleString('ko-KR')}</p>
          <p>기본 요금: ${quoteData.plans.hourly.formatted}</p>
          <p>유류비 할증: ₩${(quoteData.plans.hourly.fuelCost ?? 0).toLocaleString('ko-KR')}</p>
          <p>기본거리: ${quoteData.detail.billMinutes ? (quoteData.detail.billMinutes / 60 * 10).toFixed(1) : '0.0'}km</p>
          <p>초과거리: ${quoteData.detail.km > (quoteData.detail.billMinutes / 60 * 10) ? (quoteData.detail.km - quoteData.detail.billMinutes / 60 * 10).toFixed(1) : '0.0'}km</p>
          <p>시간당 총액: ${quoteData.plans.hourly.total}</p>
        ` : `
          <h3>단건 요금제</h3>
          <p>스케줄 타입: ${quoteData.scheduleType}</p>
          <p>기본요금(구간): ₩${(quoteData.plans.perJob.base ?? 0).toLocaleString('ko-KR')}</p>
          <p>경유지 추가(${displayEffectiveStopsCount}개): ₩${(quoteData.plans.perJob.stopFee ?? 0).toLocaleString('ko-KR')}</p>
          <p>단건 총액: ${quoteData.plans.perJob.total}</p>
        `}

        <h2>추가 비용</h2>
        ${quoteData.detail.estimatedFuelCost ? `
          <p>예상 유류비: ₩${quoteData.detail.estimatedFuelCost.toLocaleString('ko-KR')}</p>
          <p>차종: ${quoteData.vehicle}</p>
          <p>연료비: ${quoteData.vehicle === 'ray' ? '레이 (8km/L)' : '스타렉스 (6km/L)'}</p>
        ` : ''}
        ${quoteData.detail.highwayTollCost ? `
          <p>하이패스 비용: ₩${quoteData.detail.highwayTollCost.toLocaleString('ko-KR')}</p>
          <p>고속도로 이용률: 70% (km당 60원)</p>
        ` : ''}

        <h2>상세분석</h2>
        <h3>경로 효율성 분석</h3>
        <p>총 거리: ${quoteData.routeData.summary.totalDistance ? ((quoteData.routeData.summary.totalDistance / 1000).toFixed(1)) : '0.0'}km</p>
        <p>편도 시간: ${quoteData.routeData.summary.totalTime ? Math.ceil(quoteData.routeData.summary.totalTime / 60) : 0}분</p>
        <p>최적화 상태: ${quoteData.routeData.summary.optimizeOrder ? '최적화됨' : '수동 설정'}</p>

        <h3>비용 절감 포인트</h3>
        <p>시간당 요금제: ${quoteData.plans.hourly?.total || '—'}</p>
        <p>단건 요금제: ${quoteData.plans.perJob?.total || '—'}</p>
        <p>더 저렴한 요금제: ${getRecommendedPlan()}</p>
        <p>비용 절감: ${calculateCostSavings()}</p>

        <h3>경쟁력 분석</h3>
        <p>차종별 효율성: ${quoteData.vehicle === 'starex' ? '스타렉스' : '레이'}</p>
        <p>스케줄 최적화: ${quoteData.scheduleType === 'regular' ? '정기' : '비정기'}</p>
        <p>비용 효율성 팁: ${getRecommendedPlan() === '시간당 요금제' ?
        '시간당 요금제는 커스텀 배송(세팅/케이터링/회수 등)이 가능하고, 경유지가 많을 때 단건 요금제보다 비용적으로 유리합니다. 또한 안정적인 정규직 인력과 자사 TMS/배송앱으로 효율적인 배송관제가 가능하여 오배송 등 이슈를 방지할 수 있습니다.' :
        '단건 요금제는 짧은 배송에도 최소 시간 요금을 적용하지 않아 비용이 절약됩니다. 계약서 없이 바로 이용할 수 있어 간편하고, 예상치 못한 추가 비용 걱정이 없습니다.'
      }</p>

        <h2>생성일시</h2>
        <p>견적 생성일시: ${quoteData.date}</p>
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quoteData.quoteNumber}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    const quoteData = {
      quoteNumber: generateQuoteNumber(),
      date: new Date().toLocaleString('ko-KR'),
      total: total,
      vehicle: vehicle,
      scheduleType: scheduleType,
      routeData: safeRouteData,
      destinations: safeDestinations,
      effectiveStopsCount: effectiveStopsCount,
      plans: plans,
      detail: detail,
    };

    const jsonContent = JSON.stringify(quoteData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quoteData.quoteNumber}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadCSV = () => {
    const quoteData = {
      quoteNumber: generateQuoteNumber(),
      date: new Date().toLocaleString('ko-KR'),
      total: total,
      vehicle: vehicle,
      scheduleType: scheduleType,
      routeData: safeRouteData,
      destinations: safeDestinations,
      effectiveStopsCount: effectiveStopsCount,
      plans: plans,
      detail: detail,
    };

    const csvContent = [
      ['견적서 번호', '생성일시', '총 요금', '차종', '스케줄 타입', '총 거리 (km)', '총 시간 (분)', '최적화 상태'],
      [quoteData.quoteNumber, quoteData.date, quoteData.total, quoteData.vehicle, quoteData.scheduleType, quoteData.routeData.summary.totalDistance ? ((quoteData.routeData.summary.totalDistance / 1000).toFixed(1)) : '0.0', quoteData.routeData.summary.totalTime ? Math.ceil(quoteData.routeData.summary.totalTime / 60) : 0, quoteData.routeData.summary.optimizeOrder ? '최적화됨' : '수동 설정'],
      ['', '', '', '기본 정보', '', '', '', ''],
      ['차종', '스케줄', '총 거리', '경유지 수'],
      [quoteData.vehicle, quoteData.scheduleType, quoteData.routeData.summary.totalDistance ? ((quoteData.routeData.summary.totalDistance / 1000).toFixed(1)) : '0.0', quoteData.destinations.length],
      ['', '', '', '시간 정보'],
      ['주행 시간(분)', '체류 시간(분)', '과금시간(시간)', '총 운행시간(분)'],
      [quoteData.detail.driveMinutes || 0, quoteData.detail.dwellTotalMinutes || 0, quoteData.detail.billMinutes || 0, (quoteData.detail.billMinutes ?? 0) + (quoteData.detail.driveMinutes ?? 0) + (quoteData.detail.dwellTotalMinutes ?? 0)],
      ['', '', '', '요금 상세'],
      ['요금제', '과금시간', '단가', '기본 요금', '유류비 할증', '총액'],
      [activeTab === 'hourly' ? '시간당' : '단건', quoteData.plans[activeTab === 'hourly' ? 'hourly' : 'perJob'].billMinutes || 0, (quoteData.plans[activeTab === 'hourly' ? 'hourly' : 'perJob'].ratePerHour ?? 0).toLocaleString('ko-KR'), quoteData.plans[activeTab === 'hourly' ? 'hourly' : 'perJob'].formatted, (quoteData.plans[activeTab === 'hourly' ? 'hourly' : 'perJob'].fuelCost ?? 0).toLocaleString('ko-KR'), quoteData.plans[activeTab === 'hourly' ? 'hourly' : 'perJob'].total],
      ['', '', '', '추가 비용'],
      ['유류비', '하이패스 비용'],
      [quoteData.detail.estimatedFuelCost ? quoteData.detail.estimatedFuelCost.toLocaleString('ko-KR') : '0', quoteData.detail.highwayTollCost ? quoteData.detail.highwayTollCost.toLocaleString('ko-KR') : '0'],
      ['', '', '', '상세분석'],
      ['분석 항목', '값'],
      [activeTab === 'analysis' ? '경로 효율성 분석' : '비용 절감 포인트', activeTab === 'analysis' ? '총 거리' : '시간당 요금제', activeTab === 'analysis' ? '총 거리' : '단건 요금제', activeTab === 'analysis' ? '더 저렴한 요금제' : '—', activeTab === 'analysis' ? calculateCostSavings() : '—', activeTab === 'analysis' ? '경쟁력 분석' : '경쟁력 분석', '차종별 효율성', '스케줄 최적화', '비용 효율성 팁'],
      [activeTab === 'analysis' ? '총 거리' : (quoteData.plans.hourly?.total || '—'), activeTab === 'analysis' ? '총 거리' : (quoteData.plans.perJob?.total || '—'), activeTab === 'analysis' ? getRecommendedPlan() : '—', activeTab === 'analysis' ? calculateCostSavings() : '—', activeTab === 'analysis' ? '경쟁력 분석' : '경쟁력 분석', quoteData.vehicle === 'starex' ? '스타렉스' : '레이', quoteData.scheduleType === 'regular' ? '정기' : '비정기', getRecommendedPlan() === '시간당 요금제' ? '시간당 요금제는 커스텀 배송이 가능하고 경유지가 많을 때 비용적으로 유리합니다' : '단건 요금제는 최소 운행시간 제약이 없어 유연한 운영이 가능합니다'],
      ['', '', '', '생성일시'],
      ['견적 생성일시', quoteData.date],
    ];

    const csvString = csvContent.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quoteData.quoteNumber}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const printQuote = () => {
    const printContent = document.getElementById('printContent');
    if (printContent) {
      const newWindow = window.open('', '_blank');
      if (newWindow) {
        newWindow.document.write(printContent.innerHTML);
        newWindow.document.close();
        newWindow.focus();
        newWindow.print();
        newWindow.close();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 모달 컨테이너 */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-6xl w-full mx-4 max-h-[95vh] overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">견적 상세 정보</h2>
            <p className="text-sm text-gray-600 mt-1">견적 번호: {generateQuoteNumber()}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* 탭 네비게이션 - 상단에 고정 */}
        <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50">
          <div className="flex px-6 py-3">
            <button
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === 'summary'
                ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              onClick={() => setActiveTab('summary')}
            >
              📊 요약
            </button>
            <button
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === 'hourly'
                ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              onClick={() => setActiveTab('hourly')}
            >
              ⏰ 시간당
            </button>
            <button
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === 'perjob'
                ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              onClick={() => setActiveTab('perjob')}
            >
              📦 단건
            </button>
            <button
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === 'analysis'
                ? 'bg-white text-purple-600 border-b-2 border-purple-600'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              onClick={() => setActiveTab('analysis')}
            >
              🔍 상세분석
            </button>
            <button
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === 'export'
                ? 'bg-white text-teal-600 border-b-2 border-teal-600'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              onClick={() => setActiveTab('export')}
            >
              💾 자료추출
            </button>
            <button
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === 'rate'
                ? 'bg-white text-slate-700 border-b-2 border-slate-700'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              onClick={() => setActiveTab('rate')}
            >
              📑 운임표
            </button>
          </div>
        </div>

        {/* 탭 내용 - 스크롤 가능한 영역 */}
        <div className="flex-1 overflow-y-auto p-6 max-h-[calc(90vh-200px)]">
          {/* 견적 요약 카드 - 요약 탭에서만 표시 */}
          {activeTab === 'summary' && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 mb-6 border border-blue-200">
              <div className="text-center">
                <div className="text-sm text-blue-600 font-medium mb-2">추천 요금제</div>
                <div className="text-4xl font-bold text-gray-900 mb-2">{total}</div>
                <div className="text-lg text-blue-600 font-semibold">
                  {safePlans?.hourly?.total && safePlans?.perJob?.total
                    ? (safePlans.hourly.total > safePlans.perJob.total ? '시간당 요금제' : '단건 요금제')
                    : '—'}
                </div>
              </div>
            </div>
          )}

          {/* 요금 상세 정보 */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">요금 상세 정보</h3>

            {/* 시간당 요금제 상세 - 시간당 탭에서만 표시 */}
            {activeTab === 'hourly' && safePlans?.hourly && (
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-3">시간당 요금제</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">과금시간:</span>
                    <span className="font-medium">{((safePlans.hourly.billMinutes || 0) / 60).toFixed(1)}시간</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">시간당 단가:</span>
                    <span className="font-medium">₩{calculateHourlyRateCorrect('ray', safePlans.hourly.billMinutes || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">기본 요금:</span>
                    <span className="font-medium">₩{Math.round(((safePlans.hourly.billMinutes || 0) / 60) * calculateHourlyRateCorrect('ray', safePlans.hourly.billMinutes || 0)).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">유류비 할증:</span>
                    <span className="font-medium">₩{(safePlans.hourly.fuelCost ?? 0).toLocaleString('ko-KR')}</span>
                  </div>
                  <div className="md:col-span-2 border-t border-blue-200 pt-2 flex justify-between font-semibold text-lg">
                    <span>시간당 총액:</span>
                    <span className="text-blue-600">{safePlans.hourly.total}</span>
                  </div>
                </div>

                {/* 차량 타입 비교 섹션 */}
                <div className="mt-4 pt-4 border-t border-blue-200">
                  <h5 className="font-medium text-blue-900 mb-3">차량 타입별 비교</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 레이 */}
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <div className="text-center mb-2">
                        <span className="text-sm font-medium text-blue-700">레이</span>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span>시간당 단가:</span>
                          <span>₩{calculateHourlyRateCorrect('ray', safePlans.hourly.billMinutes || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>기본 요금:</span>
                          <span>₩{Math.round(((safePlans.hourly.billMinutes || 0) / 60) * calculateHourlyRateCorrect('ray', safePlans.hourly.billMinutes || 0)).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between font-medium text-blue-600">
                          <span>총액:</span>
                          <span>₩{calculateHourlyTotal('ray', safePlans.hourly.billMinutes || 0, safeDetail?.km || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* 스타렉스 */}
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <div className="text-center mb-2">
                        <span className="text-sm font-medium text-blue-700">스타렉스</span>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span>시간당 단가:</span>
                          <span>₩{calculateHourlyRateCorrect('starex', safePlans.hourly.billMinutes || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>기본 요금:</span>
                          <span>₩{Math.round(((safePlans.hourly.billMinutes || 0) / 60) * calculateHourlyRateCorrect('starex', safePlans.hourly.billMinutes || 0)).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between font-medium text-blue-600">
                          <span>총액:</span>
                          <span>₩{calculateHourlyTotal('starex', safePlans.hourly.billMinutes || 0, safeDetail?.km || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-blue-900 bg-white/40 border border-blue-100 rounded p-2">
                  <div className="font-medium mb-1">유류비 할증 계산식</div>
                  <div>기본거리 = 과금시간(시간) × 10km, 총거리 ≤ 기본거리 ⇒ 할증 0원</div>
                  <div>초과거리 = 총거리 − 기본거리 · 레이: 10km당 +2,000원 · 스타렉스: 10km당 +2,800원</div>
                </div>
              </div>
            )}

            {/* 단건 요금제 상세 - 단건 탭에서만 표시 */}
            {activeTab === 'perjob' && safePlans?.perJob && (
              <div className="space-y-4">
                {/* 현재 선택된 스케줄 타입 */}
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <h4 className="font-medium text-green-900 mb-3">
                    단건 요금제 - {scheduleType === 'regular' ? '정기' : '비정기'}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">스케줄 타입:</span>
                      <span className="font-medium">{scheduleType === 'regular' ? '정기' : '비정기'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">기본요금(구간):</span>
                      <span className="font-medium">
                        ₩{(safePlans.perJob.base ?? 0).toLocaleString('ko-KR')}
                        {safePlans.perJob.bracketLabel && (
                          <span className="ml-1 text-gray-400">({safePlans.perJob.bracketLabel})</span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">경유지 추가({displayEffectiveStopsCount}개):</span>
                      <span className="font-medium">₩{(safePlans.perJob.stopFee ?? 0).toLocaleString('ko-KR')}</span>
                    </div>
                    {scheduleType === 'regular' && safePlans?.perJob?.regularStopFee && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">정기 할증:</span>
                        <span className="font-medium text-green-700">
                          +₩{(safePlans.perJob.regularStopFee - (safePlans.perJob.stopFee || 0)).toLocaleString()}
                        </span>
                      </div>
                    )}
                    <div className="md:col-span-2 border-t border-green-200 pt-2 flex justify-between font-semibold text-lg">
                      <span>단건 총액:</span>
                      <span className="text-green-600">{safePlans.perJob.total}</span>
                    </div>
                    {safePlans.perJob.nextBracketLabel && (
                      <div className="md:col-span-2 text-xs text-gray-500">
                        다음 구간 {safePlans.perJob.nextBracketLabel} 진입 시 +₩{(safePlans.perJob.nextDelta || 0).toLocaleString('ko-KR')}
                      </div>
                    )}
                  </div>
                </div>

                {/* 비교를 위한 다른 스케줄 타입 */}
                {scheduleType === 'regular' ? (
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h4 className="font-medium text-gray-700 mb-3">비정기 요금 비교</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">기본요금(구간):</span>
                        <span className="font-medium">₩{perJobBasePrice(vehicle as 'ray' | 'starex', safeDetail?.km || 0).toLocaleString('ko-KR')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">경유지 추가({displayEffectiveStopsCount}개):</span>
                        <span className="font-medium">₩{(displayEffectiveStopsCount * STOP_FEE[vehicle as 'ray' | 'starex']).toLocaleString('ko-KR')}</span>
                      </div>
                      <div className="md:col-span-2 border-t border-gray-200 pt-2 flex justify-between font-semibold text-lg">
                        <span>비정기 총액:</span>
                        <span className="text-gray-600">
                          ₩{(perJobBasePrice(vehicle as 'ray' | 'starex', safeDetail?.km || 0) + (displayEffectiveStopsCount * STOP_FEE[vehicle as 'ray' | 'starex'])).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h4 className="font-medium text-gray-700 mb-3">정기 요금 비교</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">기본요금(구간):</span>
                        <span className="font-medium">₩{perJobRegularPrice(vehicle as 'ray' | 'starex', safeDetail?.km || 0).toLocaleString('ko-KR')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">경유지 추가({displayEffectiveStopsCount}개):</span>
                        <span className="font-medium">₩{(vehicle === 'ray'
                          ? displayEffectiveStopsCount * STOP_FEE.starex
                          : displayEffectiveStopsCount * Math.round(STOP_FEE.starex * 1.2)
                        ).toLocaleString('ko-KR')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">정기 할증:</span>
                        <span className="font-medium text-green-700">
                          +₩{(vehicle === 'ray'
                            ? displayEffectiveStopsCount * (STOP_FEE.starex - STOP_FEE.ray)
                            : displayEffectiveStopsCount * Math.round(STOP_FEE.starex * 0.2)
                          ).toLocaleString()}
                        </span>
                      </div>
                      <div className="md:col-span-2 border-t border-gray-200 pt-2 flex justify-between font-semibold text-lg">
                        <span>정기 총액:</span>
                        <span className="text-gray-600">
                          ₩{(perJobRegularPrice(vehicle as 'ray' | 'starex', safeDetail?.km || 0) +
                            (vehicle === 'ray'
                              ? displayEffectiveStopsCount * STOP_FEE.starex
                              : displayEffectiveStopsCount * Math.round(STOP_FEE.starex * 1.2)
                            )).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 차량 타입 비교 섹션 - 단건 탭에서만 표시 */}
            {activeTab === 'perjob' && (
              <div className="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h5 className="font-medium text-gray-900 mb-3">차량 타입별 단건 요금 비교</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 레이 */}
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="text-center mb-2">
                      <span className="text-sm font-medium text-gray-700">레이</span>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span>기본요금:</span>
                        <span>₩{calculatePerJobBase('ray', safeDetail?.km || 0, scheduleType === 'regular').toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>경유지({displayEffectiveStopsCount}개):</span>
                        <span>₩{calculatePerJobStopFee('ray', displayEffectiveStopsCount, scheduleType === 'regular').toLocaleString()}</span>
                      </div>
                      <div className="border-t border-gray-200 pt-1 flex justify-between font-medium text-gray-600">
                        <span>총액:</span>
                        <span>₩{(calculatePerJobBase('ray', safeDetail?.km || 0, scheduleType === 'regular') +
                          calculatePerJobStopFee('ray', displayEffectiveStopsCount, scheduleType === 'regular')).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* 스타렉스 */}
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="text-center mb-2">
                      <span className="text-sm font-medium text-gray-700">스타렉스</span>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span>기본요금:</span>
                        <span>₩{calculatePerJobBase('starex', safeDetail?.km || 0, scheduleType === 'regular').toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>경유지({displayEffectiveStopsCount}개):</span>
                        <span>₩{calculatePerJobStopFee('starex', displayEffectiveStopsCount, scheduleType === 'regular').toLocaleString()}</span>
                      </div>
                      <div className="border-t border-gray-200 pt-1 flex justify-between font-medium text-gray-600">
                        <span>총액:</span>
                        <span>₩{(calculatePerJobBase('starex', safeDetail?.km || 0, scheduleType === 'regular') +
                          calculatePerJobStopFee('starex', displayEffectiveStopsCount, scheduleType === 'regular')).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-gray-600 text-center">
                  스케줄: {scheduleType === 'regular' ? '정기' : '비정기'} | 거리: {(safeDetail?.km || 0).toFixed(1)}km
                </div>
              </div>
            )}

            {/* 요약 탭에서는 두 요금제 모두 표시 */}
            {activeTab === 'summary' && (
              <>
                {/* 시간당 요금제 상세 */}
                {safePlans?.hourly && (
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 mb-4">
                    <h4 className="font-medium text-blue-900 mb-3">시간당 요금제</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">과금시간:</span>
                        <span className="font-medium">{((safePlans.hourly.billMinutes || 0) / 60).toFixed(1)}시간</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">시간당 단가:</span>
                        <span className="font-medium">₩{calculateHourlyRateCorrect('ray', safePlans.hourly.billMinutes || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">기본 요금:</span>
                        <span className="font-medium">₩{Math.round(((safePlans.hourly.billMinutes || 0) / 60) * calculateHourlyRateCorrect('ray', safePlans.hourly.billMinutes || 0)).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">유류비 할증:</span>
                        <span className="font-medium">₩{(safePlans.hourly.fuelCost ?? 0).toLocaleString('ko-KR')}</span>
                      </div>
                      <div className="md:col-span-2 text-xs text-gray-600 bg-white/50 p-2 rounded">
                        {safeDetail?.km && safeDetail?.billMinutes ? (
                          <>
                            기본거리: {(safeDetail.billMinutes / 60 * 10).toFixed(1)}km
                            {safeDetail.km > (safeDetail.billMinutes / 60 * 10) ? (
                              <> · 초과거리: {(safeDetail.km - safeDetail.billMinutes / 60 * 10).toFixed(1)}km</>
                            ) : (
                              <> · 기본거리 이내</>
                            )}
                          </>
                        ) : '—'}
                      </div>
                      <div className="md:col-span-2 border-t border-blue-200 pt-2 flex justify-between font-semibold text-lg">
                        <span>시간당 총액:</span>
                        <span className="text-blue-600">{safePlans.hourly.total}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 단건 요금제 상세 */}
                {safePlans?.perJob && (
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <h4 className="font-medium text-green-900 mb-3">단건 요금제</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">스케줄 타입:</span>
                        <span className="font-medium">{scheduleType === 'regular' ? '정기' : '비정기'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">기본요금(구간):</span>
                        <span className="font-medium">₩{(safePlans.perJob.base ?? 0).toLocaleString('ko-KR')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">경유지 추가({displayEffectiveStopsCount}개):</span>
                        <span className="font-medium">₩{(safePlans.perJob.stopFee ?? 0).toLocaleString('ko-KR')}</span>
                      </div>
                      <div className="md:col-span-2 border-t border-green-200 pt-2 flex justify-between font-semibold text-lg">
                        <span>단건 총액:</span>
                        <span className="text-green-600">{safePlans.perJob.total}</span>
                      </div>
                      {safePlans.perJob.bracketLabel && (
                        <div className="md:col-span-2 text-xs text-green-800 bg-white/40 border border-green-100 rounded p-2">
                          현재 구간: {safePlans.perJob.bracketLabel}
                          {safePlans.perJob.nextBracketLabel ? (
                            <> · 다음 구간 {safePlans.perJob.nextBracketLabel} 진입 시 +₩{(safePlans.perJob.nextDelta || 0).toLocaleString('ko-KR')}</>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 추가 비용 정보 */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">추가 비용 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {safeDetail?.estimatedFuelCost && (
                <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                  <h4 className="font-medium text-yellow-900 mb-2">예상 유류비</h4>
                  <div className="text-2xl font-bold text-yellow-800">
                    ₩{safeDetail.estimatedFuelCost.toLocaleString('ko-KR')}
                  </div>
                  <div className="text-xs text-yellow-700 mt-1">
                    {vehicle === 'ray' ? '레이 (8km/L)' : '스타렉스 (6km/L)'} · 연료비 1,700원/L
                  </div>
                </div>
              )}

              {safeDetail?.highwayTollCost && (
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <h4 className="font-medium text-purple-900 mb-2">하이패스 비용</h4>
                  <div className="text-2xl font-bold text-purple-800">
                    ₩{safeDetail.highwayTollCost.toLocaleString('ko-KR')}
                  </div>
                  <div className="text-xs text-purple-700 mt-1">
                    고속도로 이용률 70% · km당 60원
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 상세분석 탭 */}
          {activeTab === 'analysis' && (
            <div className="space-y-6">
              {/* 경로 효율성 분석 */}
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-200">
                <h3 className="text-xl font-semibold text-purple-900 mb-4 flex items-center gap-2">
                  🚛 경로 효율성 분석
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-600 mb-2">
                      {safeRouteData?.summary?.totalDistance ? ((safeRouteData.summary.totalDistance / 1000).toFixed(1)) : '0.0'}
                    </div>
                    <div className="text-sm text-purple-700">총 거리 (km)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-indigo-600 mb-2">
                      {safeRouteData?.summary?.totalTime ? Math.ceil(safeRouteData.summary.totalTime / 60) : 0}
                    </div>
                    <div className="text-sm text-indigo-700">편도 시간 (분)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600 mb-2">
                      {safeRouteData?.summary?.optimizeOrder ? '🔄' : '📍'}
                    </div>
                    <div className="text-sm text-green-700">
                      {safeRouteData?.summary?.optimizeOrder ? '자동 순서' : '수동 순서'}
                    </div>
                  </div>
                </div>

                {/* 경로 최적화 상태 */}
                <div className="mt-4 p-4 bg-white/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-purple-800">경로 최적화 상태</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${safeRouteData?.summary?.optimizeOrder
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                      }`}>
                      {safeRouteData?.summary?.optimizeOrder ? '최적화됨' : '수동 설정'}
                    </span>
                  </div>
                  <p className="text-xs text-purple-600 mt-2">
                    {safeRouteData?.summary?.optimizeOrder
                      ? '자동 순서 최적화가 적용되어 경로가 효율적으로 계획되었습니다.'
                      : '사용자가 설정한 순서로 경로가 계획되었습니다. 자동 최적화를 원하시면 "자동 순서 최적화"를 활성화하세요.'
                    }
                  </p>
                </div>
              </div>

              {/* 비용 절감 포인트 */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
                <h3 className="text-xl font-semibold text-green-900 mb-4 flex items-center gap-2">
                  💰 비용 절감 포인트
                </h3>

                {/* 요금제 비교 분석 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-white/50 rounded-lg p-4">
                    <h4 className="font-medium text-green-800 mb-2">시간당 요금제</h4>
                    <div className="text-2xl font-bold text-green-600 mb-1">
                      {safePlans?.hourly?.total || '—'}
                    </div>
                    <div className="text-xs text-green-600">
                      {safeDetail?.billMinutes ? `과금시간: ${((safeDetail.billMinutes || 0) / 60).toFixed(1)}시간` : '—'}
                    </div>
                  </div>
                  <div className="bg-white/50 rounded-lg p-4">
                    <h4 className="font-medium text-green-800 mb-2">단건 요금제</h4>
                    <div className="text-2xl font-bold text-green-600 mb-1">
                      {safePlans?.perJob?.total || '—'}
                    </div>
                    <div className="text-xs text-green-600 space-y-1">
                      <div>현재 스케줄: {scheduleType === 'regular' ? '정기' : '비정기'}</div>
                      {scheduleType === 'regular' && safePlans?.perJob?.regularStopFee && (
                        <div className="text-green-700">
                          정기 할증: +₩{(safePlans.perJob.regularStopFee - (safePlans.perJob.stopFee || 0)).toLocaleString()}
                        </div>
                      )}
                      {scheduleType === 'irregular' && (
                        <div className="text-gray-600">
                          정기 스케줄 시 할증 적용
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 더 저렴한 요금제 */}
                {safePlans?.hourly?.total && safePlans?.perJob?.total && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                    <div className="text-center">
                      <div className="text-sm text-blue-600 font-medium mb-2">더 저렴한 요금제</div>
                      <div className="text-xl font-bold text-blue-800 mb-1">
                        {(() => {
                          const hourlyTotal = parseInt(safePlans.hourly.total.replace(/[^\d]/g, ''));
                          const perJobTotal = parseInt(safePlans.perJob.total.replace(/[^\d]/g, ''));
                          return hourlyTotal > perJobTotal ? '단건 요금제' : '시간당 요금제';
                        })()}
                      </div>
                      <div className="text-sm text-blue-600">
                        {(() => {
                          const hourlyTotal = parseInt(safePlans.hourly.total.replace(/[^\d]/g, ''));
                          const perJobTotal = parseInt(safePlans.perJob.total.replace(/[^\d]/g, ''));
                          const savings = Math.abs(hourlyTotal - perJobTotal);
                          return `비용 절감: ₩${savings.toLocaleString()}`;
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 경쟁력 분석 */}
              <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-6 border border-orange-200">
                <h3 className="text-xl font-semibold text-orange-900 mb-4 flex items-center gap-2">
                  🏆 경쟁력 분석
                </h3>

                <div className="space-y-4">
                  {/* 차종별 효율성 */}
                  <div className="bg-white/50 rounded-lg p-4">
                    <h4 className="font-medium text-orange-800 mb-3">차종별 효율성</h4>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-orange-700">현재 차종</span>
                      <span className="font-medium text-orange-800">
                        {vehicle === 'starex' ? '스타렉스' : '레이'}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-orange-600">
                      {vehicle === 'starex'
                        ? '스타렉스는 대용량 운송에 최적화되어 있습니다.'
                        : '레이는 소형 운송에 비용 효율적입니다.'
                      }
                    </div>
                  </div>

                  {/* 스케줄 최적화 */}
                  <div className="bg-white/50 rounded-lg p-4">
                    <h4 className="font-medium text-orange-800 mb-3">스케줄 최적화</h4>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-orange-700">현재 스케줄</span>
                      <span className="font-medium text-orange-800">
                        {scheduleType === 'regular' ? '정기' : '비정기'}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-orange-600">
                      {scheduleType === 'regular'
                        ? '단건 요금제에서 정기 스케줄은 장기 계약 시 할인 혜택을 제공합니다.'
                        : '단건 요금제에서 비정기 스케줄은 유연한 운송 계획에 적합합니다.'
                      }
                    </div>
                  </div>

                  {/* 비용 효율성 팁 */}
                  <div className="bg-white/50 rounded-lg p-4">
                    <h4 className="font-medium text-orange-800 mb-3">비용 효율성 팁</h4>
                    <div className="space-y-2 text-xs text-orange-600">
                      <div className="flex items-start gap-2">
                        <span className="text-orange-500">💡</span>
                        <span>{getRecommendedPlan() === '시간당 요금제' ?
                          '시간당 요금제는 커스텀 배송(세팅/케이터링/회수 등)이 가능하고, 경유지가 많을 때 단건 요금제보다 비용적으로 유리합니다.' :
                          '단건 요금제는 짧은 배송에도 최소 시간 요금을 적용하지 않아 비용이 절약됩니다. 계약서 없이 바로 이용할 수 있어 간편하고, 예상치 못한 추가 비용 걱정이 없습니다.'
                        }</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-orange-500">💡</span>
                        <span>{getRecommendedPlan() === '시간당 요금제' ?
                          '안정적인 정규직 인력과 자사 TMS/배송앱으로 효율적인 배송관제가 가능하여 오배송 등 이슈를 방지할 수 있습니다.' :
                          '계약서 없이 바로 이용할 수 있어 간편하고, 예상치 못한 추가 비용 걱정이 없습니다.'
                        }</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-orange-500">💡</span>
                        <span>{getRecommendedPlan() === '시간당 요금제' ?
                          '교육된 정기 인력으로 VOC를 최소화하고 불필요한 비용 발생을 방지할 수 있습니다.' :
                          '유연한 운영이 가능하여 상황에 따라 합리적인 옵션이 될 수 있습니다.'
                        }</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-orange-500">💡</span>
                        <span>{getRecommendedPlan() === '시간당 요금제' ?
                          '중장년/시니어 일자리 창출을 통한 사회적 기여도 함께 실현할 수 있습니다.' :
                          '단순 전달을 넘어 커스텀 배송 서비스가 필요한 경우 시간당 요금제로 전환을 고려해보세요.'
                        }</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 자료추출 탭 */}
          {activeTab === 'export' && (
            <div className="space-y-6">
              {/* 견적서 다운로드 섹션 */}
              <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-xl p-6 border border-teal-200">
                <h3 className="text-xl font-semibold text-teal-900 mb-4 flex items-center gap-2">
                  📄 견적서 다운로드
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {/* HTML 견적서 */}
                  <div className="bg-white/50 rounded-lg p-4 border border-teal-200">
                    <div className="text-center mb-4">
                      <div className="text-3xl mb-2">🌐</div>
                      <h4 className="font-medium text-teal-800 mb-2">HTML 견적서</h4>
                      <p className="text-xs text-teal-600">웹 브라우저에서 열 수 있는 견적서</p>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-teal-700">포맷:</span>
                        <span className="font-medium">HTML</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-teal-700">호환성:</span>
                        <span className="font-medium">모든 브라우저</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-teal-700">용도:</span>
                        <span className="font-medium">이메일, 인쇄</span>
                      </div>
                    </div>
                    <button
                      onClick={() => downloadHTML(activeTab)}
                      className="w-full mt-4 bg-teal-600 hover:bg-teal-700 text-white py-2 px-4 rounded-lg transition-colors font-medium"
                    >
                      HTML 다운로드
                    </button>
                  </div>

                  {/* PDF 견적서 */}
                  <div className="bg-white/50 rounded-lg p-4 border border-teal-200">
                    <div className="text-center mb-4">
                      <div className="text-3xl mb-2">📄</div>
                      <h4 className="font-medium text-teal-800 mb-2">PDF 견적서</h4>
                      <p className="text-xs text-teal-600">공식 문서로 사용 가능한 견적서</p>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-teal-700">포맷:</span>
                        <span className="font-medium">PDF</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-teal-700">호환성:</span>
                        <span className="font-medium">모든 기기</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-teal-700">용도:</span>
                        <span className="font-medium">공식 제출, 보관</span>
                      </div>
                    </div>
                    <button
                      disabled={true}
                      className="w-full mt-4 bg-gray-400 cursor-not-allowed text-white py-2 px-4 rounded-lg font-medium"
                      title="PDF 기능은 향후 업데이트 예정입니다"
                    >
                      PDF 다운로드 (준비중)
                    </button>
                  </div>
                </div>

                {/* 다운로드 안내 */}
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-start gap-2">
                    <span className="text-blue-500 text-lg">💡</span>
                    <div className="text-sm text-blue-800">
                      <p className="font-medium mb-1">다운로드 안내</p>
                      <ul className="space-y-1 text-xs">
                        <li>• HTML 견적서는 현재 선택된 탭의 정보를 기반으로 생성됩니다</li>
                        <li>• PDF 견적서는 향후 업데이트를 통해 제공될 예정입니다</li>
                        <li>• 다운로드된 파일은 고객사와 공유하거나 인쇄하여 사용할 수 있습니다</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* 데이터 내보내기 섹션 */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-200">
                <h3 className="text-xl font-semibold text-indigo-900 mb-4 flex items-center gap-2">
                  🔗 데이터 내보내기
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* JSON 데이터 */}
                  <div className="bg-white/50 rounded-lg p-4 border border-indigo-200">
                    <div className="text-center mb-4">
                      <div className="text-3xl mb-2">📊</div>
                      <h4 className="font-medium text-indigo-800 mb-2">JSON 데이터</h4>
                      <p className="text-xs text-indigo-600">다른 시스템과 연동 가능한 데이터</p>
                    </div>
                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-indigo-700">포맷:</span>
                        <span className="font-medium">JSON</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-indigo-700">용도:</span>
                        <span className="font-medium">API 연동, 분석</span>
                      </div>
                    </div>
                    <button
                      onClick={() => downloadJSON()}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg transition-colors font-medium"
                    >
                      JSON 다운로드
                    </button>
                  </div>

                  {/* CSV 데이터 */}
                  <div className="bg-white/50 rounded-lg p-4 border border-indigo-200">
                    <div className="text-center mb-4">
                      <div className="text-3xl mb-2">📋</div>
                      <h4 className="font-medium text-indigo-800 mb-2">CSV 데이터</h4>
                      <p className="text-xs text-indigo-600">엑셀에서 편집 가능한 데이터</p>
                    </div>
                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-indigo-700">포맷:</span>
                        <span className="font-medium">CSV</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-indigo-700">용도:</span>
                        <span className="font-medium">엑셀 분석, 보고서</span>
                      </div>
                    </div>
                    <button
                      onClick={() => downloadCSV()}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg transition-colors font-medium"
                    >
                      CSV 다운로드
                    </button>
                  </div>
                </div>

                {/* 데이터 형식 안내 */}
                <div className="mt-4 bg-indigo-50 rounded-lg p-4 border border-indigo-200">
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-500 text-lg">ℹ️</span>
                    <div className="text-sm text-indigo-800">
                      <p className="font-medium mb-1">데이터 형식 안내</p>
                      <ul className="space-y-1 text-xs">
                        <li>• JSON: 프로그래밍 언어와 연동하여 자동화 시스템 구축 가능</li>
                        <li>• CSV: 엑셀에서 열어서 추가 분석 및 보고서 작성 가능</li>
                        <li>• 모든 데이터는 현재 견적 정보를 기반으로 생성됩니다</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* 인쇄 최적화 섹션 */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-6 border border-amber-200">
                <h3 className="text-xl font-semibold text-amber-900 mb-4 flex items-center gap-2">
                  🖨️ 인쇄 최적화
                </h3>

                <div className="bg-white/50 rounded-lg p-4 border border-amber-200">
                  <div className="text-center mb-4">
                    <div className="text-3xl mb-2">🖨️</div>
                    <h4 className="font-medium text-amber-800 mb-2">인쇄용 견적서</h4>
                    <p className="text-xs text-amber-600">프린터에서 최적화된 출력</p>
                  </div>
                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex justify-between">
                      <span className="text-amber-700">용지:</span>
                      <span className="font-medium">A4 최적화</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-amber-700">색상:</span>
                      <span className="font-medium">흑백/컬러 지원</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-amber-700">용도:</span>
                      <span className="font-medium">사무실, 고객사 제출</span>
                    </div>
                  </div>
                  <button
                    onClick={() => printQuote()}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white py-2 px-4 rounded-lg transition-colors font-medium"
                  >
                    인쇄하기
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 운임표 탭 */}
          {activeTab === 'rate' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl p-4 border">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">시간당 요금제 (과금시간 구간표)</h3>
                <div className="overflow-auto">
                  <table className="min-w-[520px] w-full text-xs border">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="p-2 border text-left">구간(최대 분)</th>
                        <th className="p-2 border text-right">레이(원/시간)</th>
                        <th className="p-2 border text-right">스타렉스(원/시간)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hourlyRows.map((r, idx) => (
                        <tr key={idx}>
                          <td className="p-2 border">≤ {r.maxMinutes}분</td>
                          <td className="p-2 border text-right">{r.ray.toLocaleString()}</td>
                          <td className="p-2 border text-right">{r.starex.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 mt-2">실제 청구는 과금시간 × 단가 + 유류비(과금시간 기준 기본거리 초과분) 규칙을 따릅니다.</p>
              </div>

              <div className="bg-white rounded-xl p-4 border">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">단건 요금제 (거리 구간표)</h3>
                <div className="overflow-auto">
                  <table className="min-w-[520px] w-full text-xs border">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="p-2 border text-left">구간(km)</th>
                        <th className="p-2 border text-right">레이(원)</th>
                        <th className="p-2 border text-right">스타렉스(원)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PER_JOB_TABLE.map((r, idx) => (
                        <tr key={idx}>
                          <td className="p-2 border">{r.fromKm}~{r.toKm}</td>
                          <td className="p-2 border text-right">{r.ray.toLocaleString()}</td>
                          <td className="p-2 border text-right">{r.starex.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 mt-2">정기/비정기, 경유지 수 가산 등 세부 규칙은 ‘단건’ 탭 계산 로직을 따릅니다.</p>
              </div>
            </div>
          )}

          {/* 생성일시 */}
          <div className="text-center text-sm text-gray-500 border-t border-gray-200 pt-4">
            견적 생성일시: {new Date().toLocaleString('ko-KR')}
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            닫기
          </button>
          <button
            onClick={() => {
              // HTML 다운로드 기능 연동 예정
              console.log('HTML 다운로드');
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            견적서 다운로드
          </button>
        </div>
      </div>
    </div>
  );
}
