'use client';

import React, { useState, useEffect } from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization';
import {
  perJobBasePrice,
  perJobRegularPrice,
  STOP_FEE,
  fuelSurchargeHourly,
  pickHourlyRate,
  roundUpTo30Minutes,
  fuelSurchargeHourlyCorrect,
  estimatedFuelCost,
  highwayTollCost,
  PER_JOB_TABLE
} from '@/domains/quote/pricing';
import QuoteDetailModal from '@/components/modals/QuoteDetailModal';

// jsPDF 동적 import
let jsPDF: any = null;
let html2canvas: any = null;

const loadPDFLibraries = async () => {
  if (!jsPDF) {
    const jsPDFModule = await import('jspdf');
    jsPDF = jsPDFModule.default;
  }
  if (!html2canvas) {
    const html2canvasModule = await import('html2canvas');
    html2canvas = html2canvasModule.default;
  }
};

interface QuoteCalculatorPanelProps {
  onDataChange?: (data: {
    detail: any;
    plans: any;
    total: string | null;
    vehicle: 'ray' | 'starex';
    scheduleType: 'ad-hoc' | 'regular';
    routeData: any;
    destinations: any[];
    effectiveStopsCount: number;
  }) => void;
}

export default function QuoteCalculatorPanel({ onDataChange }: QuoteCalculatorPanelProps) {
  const { routeData, dwellMinutes, destinations, origins, vehicleType } = useRouteOptimization();
  const [total, setTotal] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<'ray' | 'starex'>('ray');
  const [scheduleType, setScheduleType] = useState<'ad-hoc' | 'regular'>('ad-hoc'); // 비정기 기본값
  const [activeTab, setActiveTab] = useState<'summary' | 'hourly' | 'perjob'>('summary');
  const [plans, setPlans] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [effectiveStopsCount, setEffectiveStopsCount] = useState<number>(0);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 차량 타입 동기화: RouteOptimizerPanel의 차량 타입(한글)을 본 컴포넌트의 내부 코드값으로 매핑
  useEffect(() => {
    if (!vehicleType) return;
    const mapped = vehicleType === '스타렉스' ? 'starex' : 'ray';
    setVehicle(mapped);
  }, [vehicleType]);

  // 견적 계산 (임시로 하드코딩)
  useEffect(() => {
    if (!routeData?.summary) return;
    const { totalDistance, totalTime } = routeData.summary as any;

    // pricing.ts의 기존 요금표 사용 (하드코딩 금지)
    const distanceKm = (totalDistance || 0) / 1000;
    const driveMinutes = Math.ceil((totalTime || 0) / 60);
    const dwellTotalMinutes = dwellMinutes.reduce((a, b) => a + b, 0);
    const totalBillMinutes = driveMinutes + dwellTotalMinutes;

    // 시간당 요금제 계산 (pricing.ts HOURLY_RATE_TABLE 사용)
    // 체류시간 포함 총 운행시간으로 계산, 최소 2시간(120분) 보장, 30분 단위 올림
    const billMinutes = roundUpTo30Minutes(totalBillMinutes); // 최소 2시간 보장 후 30분 단위 올림
    const hourlyRate = pickHourlyRate(vehicle, billMinutes);
    // 올림 처리 제거: 실제 계산값을 그대로 사용 (원 단위 반올림만 수행)
    const hourlyTotal = Math.round((billMinutes / 60) * hourlyRate);
    // 시간당 요금제에는 유류할증 적용 (과금시간 기반)
    const hourlyTotalWithFuel = hourlyTotal + fuelSurchargeHourlyCorrect(vehicle, distanceKm, billMinutes);
    const hourlyTotalFinal = hourlyTotalWithFuel;

    // 단건 요금제 계산 (pricing.ts PER_JOB_TABLE 사용)
    // 체류시간 무시, 정기/비정기 구분
    const perJobBase = scheduleType === 'regular'
      ? perJobRegularPrice(vehicle, distanceKm)  // 정기: 가산율 적용
      : perJobBasePrice(vehicle, distanceKm);    // 비정기: 기본 요금

    // 경유지 요금: 출발지/도착지 제외한 경유지만 계산
    // 정기일 때는 경유지 요금도 가산율 적용
    const stopsCount = destinations?.length || 0; // destinations 배열 길이로 경유지 수 계산
    const calculatedEffectiveStopsCount = Math.max(0, stopsCount - 1); // 출발지/도착지 제외
    setEffectiveStopsCount(calculatedEffectiveStopsCount);
    let perJobStopFee;
    if (scheduleType === 'regular') {
      if (vehicle === 'ray') {
        // 레이 정기: 스타렉스 기준
        perJobStopFee = calculatedEffectiveStopsCount * STOP_FEE.starex;
      } else {
        // 스타렉스 정기: 기본 요금에 가산율 적용
        perJobStopFee = calculatedEffectiveStopsCount * Math.round(STOP_FEE.starex * 1.2);
      }
    } else {
      // 비정기: 차종별 기본 요금
      perJobStopFee = calculatedEffectiveStopsCount * STOP_FEE[vehicle];
    }

    const perJobTotal = perJobBase + perJobStopFee;

    // 요약 탭용: 더 높은 금액 표기
    const summaryTotal = Math.max(hourlyTotalFinal, perJobTotal);
    const formattedTotal = `₩${summaryTotal.toLocaleString()}`;

    // 선택된 요금제 결정 (더 낮은 금액)
    const selectedPlan = hourlyTotalFinal <= perJobTotal ? 'perJob' : 'hourly';

    // plans 상태 업데이트
    // 단건 요금제: 현재 구간 및 다음 구간 증분 정보 계산
    const findBracket = (km: number) => {
      let current = PER_JOB_TABLE[0];
      for (const r of PER_JOB_TABLE) {
        if (km >= r.fromKm && km <= r.toKm) { current = r; break; }
      }
      const idx = PER_JOB_TABLE.indexOf(current);
      const next = idx >= 0 && idx < PER_JOB_TABLE.length - 1 ? PER_JOB_TABLE[idx + 1] : null;
      const curPrice = vehicle === 'ray' ? current.ray : current.starex;
      const nextPrice = next ? (vehicle === 'ray' ? next.ray : next.starex) : null;
      const delta = nextPrice != null ? nextPrice - curPrice : null;
      return {
        label: `${current.fromKm}~${current.toKm}km`,
        nextLabel: next ? `${next.fromKm}~${next.toKm}km` : null,
        delta,
      };
    };
    const bracketInfo = findBracket(distanceKm);

    const newPlans = {
      hourly: {
        total: `₩${hourlyTotalFinal.toLocaleString()}`,
        ratePerHour: hourlyRate,
        formatted: `₩${hourlyTotal.toLocaleString()}`,
        fuelCost: fuelSurchargeHourlyCorrect(vehicle, distanceKm, billMinutes),
        billMinutes
      },
      perJob: {
        total: `₩${perJobTotal.toLocaleString()}`,
        base: perJobBase,
        stopFee: perJobStopFee,
        bracketLabel: bracketInfo.label,
        nextBracketLabel: bracketInfo.nextLabel,
        nextDelta: bracketInfo.delta
      }
    };

    // detail 상태 업데이트
    const newDetail = {
      km: distanceKm,
      driveMinutes,
      dwellTotalMinutes,
      billMinutes,
      estimatedFuelCost: estimatedFuelCost(vehicle, distanceKm),
      highwayTollCost: highwayTollCost(distanceKm)
    };

    setPlans(newPlans);
    setDetail(newDetail);
    setTotal(formattedTotal);

    // 부모 컴포넌트에 데이터 전달
    if (onDataChange) {
      onDataChange({
        detail: newDetail,
        plans: newPlans,
        total: formattedTotal,
        vehicle,
        scheduleType,
        routeData,
        destinations: destinations || [],
        effectiveStopsCount: calculatedEffectiveStopsCount
      });
    }

  }, [routeData?.summary, dwellMinutes, vehicle, scheduleType, onDataChange]);

  const stopsCount = destinations?.length || 0;

  // 클라이언트 사이드 PDF 생성 (탭별 데이터 기반)
  const generateClientSidePDF = async (tab: string = 'summary') => {
    try {
      console.log('PDF 생성 시작:', { tab, plans, detail, total });
      await loadPDFLibraries();

      // 탭별 HTML 내용 생성
      let quoteHTML = '';

      if (tab === 'summary') {
        quoteHTML = generateSummaryHTML();
      } else if (tab === 'hourly') {
        quoteHTML = generateHourlyHTML();
      } else if (tab === 'perjob') {
        quoteHTML = generatePerJobHTML();
      }

      // 임시 div 생성
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = quoteHTML;
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '-9999px';
      document.body.appendChild(tempDiv);

      // HTML을 캔버스로 변환 (PDF 생성 최적화)
      const canvas = await html2canvas(tempDiv, {
        scale: 1.5, // 적절한 해상도
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false, // 로깅 비활성화로 성능 향상
        width: 800,
        height: 1200,
        letterRendering: true,
        foreignObjectRendering: true,
        removeContainer: true, // 컨테이너 제거로 깔끔한 렌더링
        imageTimeout: 5000, // 이미지 타임아웃 단축
        onclone: (clonedDoc: any) => {
          // 클론된 문서에서 스타일 최적화
          const clonedElement = clonedDoc.querySelector('div');
          if (clonedElement) {
            clonedElement.style.fontFamily = "'Malgun Gothic', '맑은 고딕', Arial, sans-serif";
            clonedElement.style.lineHeight = '1.6';
            clonedElement.style.letterSpacing = '0.5px';
            clonedElement.style.color = '#000000';
            clonedElement.style.backgroundColor = '#ffffff';
            clonedElement.style.width = '800px';
            clonedElement.style.margin = '0';
            clonedElement.style.padding = '20px';
          }
        }
      });

      // 임시 div 제거
      document.body.removeChild(tempDiv);

      // PDF 생성 (품질 개선)
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png', 0.95); // PNG로 변경하여 품질 향상
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      // 페이지 크기에 맞게 이미지 추가
      if (pdfHeight > pdf.internal.pageSize.getHeight()) {
        // 여러 페이지로 분할
        let heightLeft = pdfHeight;
        let position = 0;
        let page = 1;

        while (heightLeft >= pdf.internal.pageSize.getHeight()) {
          pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight, undefined, 'FAST');
          heightLeft -= pdf.internal.pageSize.getHeight();
          position -= pdf.internal.pageSize.getHeight();

          if (heightLeft >= pdf.internal.pageSize.getHeight()) {
            pdf.addPage();
            page++;
          }
        }

        if (heightLeft > 0) {
          pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight, undefined, 'FAST');
        }
      } else {
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      }

      // 파일명 생성
      const now = new Date();
      const filename = `quote_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.pdf`;

      // PDF 다운로드
      pdf.save(filename);

    } catch (error) {
      console.error('클라이언트 PDF 생성 오류:', error);
      alert('PDF 생성에 실패했습니다. 다시 시도해주세요.');
    }
  };

  // 요약 탭 HTML 생성
  const generateSummaryHTML = () => {
    const isPerJobRecommended = plans?.hourly?.total && plans?.perJob?.total
      ? plans.hourly.total > plans.perJob.total
      : false;
    const stopsCount = destinations?.length || 0;
    const billHours = detail?.billMinutes ? (detail.billMinutes / 60) : 0;

    return `
    <div style="font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; padding: 20px; max-width: 800px;">
      <h1 style="text-align: center; color: #1f2937; border-bottom: 3px solid #1f2937; padding-bottom: 20px;">
        옹고잉 물류 견적서 - 요약
      </h1>
      
      <div style="text-align: center; background: #059669; color: white; padding: 30px; border-radius: 15px; margin: 30px 0; font-size: 24px; font-weight: bold;">
        총 견적: ${total}
      </div>
      
      <div style="margin: 25px 0;">
        <h2 style="color: #1f2937; border-left: 4px solid #3b82f6; padding-left: 15px;">견적 요약</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0;">
          <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div style="font-weight: bold; color: #64748b; font-size: 14px;">차종</div>
            <div style="font-size: 16px; color: #1f2937;">${vehicle === 'starex' ? '스타렉스' : '레이'}</div>
          </div>
          <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div style="font-weight: bold; color: #64748b; font-size: 14px;">총 거리</div>
            <div style="font-size: 16px; color: #1f2937;">${((routeData?.summary?.totalDistance || 0) / 1000).toFixed(1)}km</div>
          </div>
          ${!isPerJobRecommended ? `
          <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div style="font-weight: bold; color: #64748b; font-size: 14px;">과금시간</div>
            <div style="font-size: 16px; color: #1f2937;">${billHours.toFixed(1)}시간</div>
          </div>
          ` : ''}
          <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div style="font-weight: bold; color: #64748b; font-size: 14px;">경유지 수</div>
            <div style="font-size: 16px; color: #1f2937;">${stopsCount}개</div>
          </div>
        </div>
      </div>
      
      <div style="margin: 25px 0;">
        <h2 style="color: #1f2937; border-left: 4px solid #3b82f6; padding-left: 15px;">추천 요금제</h2>
        <div style="background: #f0f9ff; padding: 20px; border-radius: 10px; border: 1px solid #bae6fd;">
          <div style="text-align: center; font-size: 18px; font-weight: bold; color: #1f2937; margin-bottom: 15px;">
            ${plans?.hourly?.total && plans?.perJob?.total
        ? (plans.hourly.total > plans.perJob.total ? '시간당 요금제' : '단건 요금제')
        : '—'}
          </div>
          <div style="text-align: center; font-size: 24px; font-weight: bold; color: #3b82f6;">
            ${plans?.hourly?.total && plans?.perJob?.total
        ? (plans.hourly.total > plans.perJob.total ? plans.hourly.total : plans.perJob.total)
        : (total ?? '—')}
          </div>
        </div>
      </div>
      
      <div style="margin: 25px 0;">
        <h2 style="color: #1f2937; border-left: 4px solid #3b82f6; padding-left: 15px;">생성일시</h2>
        <div style="text-align: center; color: #9ca3af; font-size: 14px;">
          ${new Date().toLocaleString('ko-KR')}
        </div>
      </div>
    </div>
  `;
  };

  // 시간당 탭 HTML 생성
  const generateHourlyHTML = () => {
    const stopsCount = destinations?.length || 0;
    const billHours = detail?.billMinutes ? (detail.billMinutes / 60) : 0;
    return `
    <div style="font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; padding: 20px; max-width: 800px;">
      <h1 style="text-align: center; color: #1f2937; border-bottom: 3px solid #1f2937; padding-bottom: 20px;">
        옹고잉 물류 견적서 - 시간당 요금제
      </h1>
      
      <div style="text-align: center; background: #3b82f6; color: white; padding: 30px; border-radius: 15px; margin: 30px 0; font-size: 24px; font-weight: bold;">
        시간당 총액: ${plans?.hourly?.total || '—'}
      </div>
      
      <div style="margin: 25px 0;">
        <h2 style="color: #1f2937; border-left: 4px solid #3b82f6; padding-left: 15px;">시간당 요금 상세</h2>
        <div style="background: #f8fafc; padding: 20px; border-radius: 10px; border: 1px solid #e2e8f0;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div><strong>과금시간:</strong> ${billHours.toFixed(1)}시간 (30분 단위 올림, 최소 2시간)</div>
            <div><strong>시간당 단가:</strong> ₩${(plans?.hourly?.ratePerHour || 0).toLocaleString()}</div>
            <div><strong>기본 요금:</strong> ${plans?.hourly?.formatted || '—'}</div>
            <div><strong>유류비 할증:</strong> ₩${(plans?.hourly?.fuelCost || 0).toLocaleString()}</div>
            <div><strong>총액:</strong> ${plans?.hourly?.total || '—'}</div>
          </div>
        </div>
      </div>
      
      <div style="margin: 25px 0;">
        <h2 style="color: #1f2937; border-left: 4px solid #3b82f6; padding-left: 15px;">생성일시</h2>
        <div style="text-align: center; color: #9ca3af; font-size: 14px;">
          ${new Date().toLocaleString('ko-KR')}
        </div>
      </div>
    </div>
  `;
  };

  // 단건 탭 HTML 생성
  const generatePerJobHTML = () => {
    const stopsCount = destinations?.length || 0;
    const additionalStopsCount = Math.max(0, stopsCount - 2); // 출발지와 도착지 제외한 추가 경유지
    const bracketLabel = plans?.perJob?.bracketLabel ?? '—';
    const nextBracketLabel = plans?.perJob?.nextBracketLabel ?? null;
    const nextDelta = plans?.perJob?.nextDelta ?? null;
    return `
    <div style="font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; padding: 20px; max-width: 800px;">
      <h1 style="text-align: center; color: #1f2937; border-bottom: 3px solid #1f2937; padding-bottom: 20px;">
        옹고잉 물류 견적서 - 단건 요금제
      </h1>
      
      <div style="text-align: center; background: #059669; color: white; padding: 30px; border-radius: 15px; margin: 30px 0; font-size: 24px; font-weight: bold;">
        단건 총액: ${plans?.perJob?.total || '—'}
      </div>
      
      <div style="margin: 25px 0;">
        <h2 style="color: #1f2937; border-left: 4px solid #059669; padding-left: 15px;">단건 요금 상세</h2>
        <div style="background: #f8fafc; padding: 20px; border-radius: 10px; border: 1px solid #e2e8f0;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div><strong>스케줄 타입:</strong> ${scheduleType === 'regular' ? '정기' : '비정기'}</div>
            <div><strong>기본요금(구간):</strong> ₩${(plans?.perJob?.base || 0).toLocaleString()} <span style="color:#64748b">(${bracketLabel})</span></div>
            <div><strong>경유지 추가(${additionalStopsCount}개):</strong> ₩${(plans?.perJob?.stopFee || 0).toLocaleString()}</div>
            <div><strong>총액:</strong> ${plans?.perJob?.total || '—'}</div>
          </div>
          ${nextBracketLabel ? `<div style="margin-top:10px; color:#64748b; font-size:13px;">다음 구간 ${nextBracketLabel} 진입 시 +₩${(nextDelta || 0).toLocaleString()}</div>` : ''}
        </div>
      </div>
      
      <div style="margin: 25px 0;">
        <h2 style="color: #1f2937; border-left: 4px solid #059669; padding-left: 15px;">생성일시</h2>
        <div style="text-align: center; color: #9ca3af; font-size: 14px;">
          ${new Date().toLocaleString('ko-KR')}
        </div>
      </div>
    </div>
  `;
  };

  // HTML 다운로드 함수 (직접 HTML 생성 및 다운로드)
  const downloadHTML = async (tab: string = 'summary') => {
    try {
      setLoading(true);
      console.log('HTML 다운로드 시작:', { tab, activeTab, plans, detail, total });

      let htmlContent = '';
      if (tab === 'summary') {
        htmlContent = generateSummaryHTML();
      } else if (tab === 'hourly') {
        htmlContent = generateHourlyHTML();
      } else if (tab === 'perjob') {
        htmlContent = generatePerJobHTML();
      }

      console.log('생성된 HTML 내용:', htmlContent);

      // HTML을 Blob으로 변환하여 직접 다운로드
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quote_${tab}_${new Date().toISOString().slice(0, 10)}_${new Date().toTimeString().slice(0, 5).replace(/:/g, '')}.html`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('견적서 다운로드 오류:', error);
      alert('견적서 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  if (!routeData?.summary) return null;

  return (
    <section className="glass-card border-b border-white/40 bg-gradient-to-br from-green-50/30 to-emerald-50/30 transition-all duration-300" data-section="quote">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">💰 자동 견적</h3>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-3 text-sm">
          <button className={`px-3 py-1 rounded ${activeTab === 'summary' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`} onClick={() => setActiveTab('summary')}>요약</button>
          <button className={`px-3 py-1 rounded ${activeTab === 'hourly' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`} onClick={() => setActiveTab('hourly')}>시간당</button>
          <button className={`px-3 py-1 rounded ${activeTab === 'perjob' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`} onClick={() => setActiveTab('perjob')}>단건</button>
        </div>
        {loading && <div className="text-sm text-gray-500">계산 중…</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}

        {!loading && !error && (
          <div className="bg-blue-50 rounded-lg p-3 text-sm">
            {activeTab === 'summary' && (
              <div>
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                  <div className="text-center">
                    <div className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                      {plans?.hourly?.total && plans?.perJob?.total
                        ? (plans.hourly.total > plans.perJob.total ? '시간당 요금제' : '단건 요금제')
                        : '—'}
                    </div>
                    <div className="text-lg md:text-xl font-semibold text-blue-600 mt-1">
                      {plans?.hourly?.total && plans?.perJob?.total
                        ? (plans.hourly.total > plans.perJob.total ? plans.hourly.total : plans.perJob.total)
                        : (total ?? '—')}
                    </div>
                    {/* 추천 요금제 박스에서는 과금시간 표시 제거 (중복 방지) */}
                  </div>
                </div>
                <ul className="mt-3 text-blue-800 space-y-2">
                  <li className="flex justify-between">
                    <span>차종:</span>
                    <span className="font-medium tabular-nums font-mono text-right">{vehicle === 'starex' ? '스타렉스' : '레이'}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>총 운행시간:</span>
                    <span className="font-medium tabular-nums font-mono text-right">
                      {(detail?.driveMinutes ?? 0) + (detail?.dwellTotalMinutes ?? 0)}분
                    </span>
                  </li>
                  {detail?.billMinutes && plans?.hourly?.total && plans?.perJob?.total && plans.hourly.total > plans.perJob.total && (
                    <li className="flex justify-between">
                      <span>과금시간:</span>
                      <span className="font-medium tabular-nums font-mono text-right">{((detail.billMinutes || 0) / 60).toFixed(1)}시간</span>
                    </li>
                  )}
                  <li className="flex justify-between">
                    <span>총 거리:</span>
                    <span className="font-medium tabular-nums font-mono text-right">{((routeData?.summary?.totalDistance || 0) / 1000).toFixed(1)}km</span>
                  </li>
                  <li className="flex justify-between">
                    <span>경유지:</span>
                    <span className="font-medium tabular-nums font-mono text-right">{destinations?.length || 0}개</span>
                  </li>
                  <li className="flex justify-between">
                    <span>예상 유류비:</span>
                    <span className="font-medium tabular-nums font-mono text-right">₩{detail?.estimatedFuelCost?.toLocaleString() || '0'}</span>
                  </li>
                </ul>
              </div>
            )}

            {activeTab === 'hourly' && (
              <div>
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                  <div className="text-center">
                    <div className="text-xs text-blue-600 font-medium mb-1">시간당 요금제</div>
                    <div className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                      {plans?.hourly?.total || '—'}
                    </div>
                  </div>
                </div>
                <ul className="mt-3 text-blue-800 space-y-2">
                  <li className="flex justify-between">
                    <span>과금시간:</span>
                    <span className="font-medium tabular-nums font-mono text-right">{((detail?.billMinutes || 0) / 60).toFixed(1)}시간</span>
                  </li>
                  <li className="flex justify-between">
                    <span>시간당 단가:</span>
                    <span className="font-medium tabular-nums font-mono text-right">₩{(plans?.hourly?.ratePerHour ?? 0).toLocaleString()}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>기본 요금:</span>
                    <span className="font-medium tabular-nums font-mono text-right">{plans?.hourly?.formatted || '—'}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>유류비 할증:</span>
                    <span className="font-medium tabular-nums font-mono text-right">₩{(plans?.hourly?.fuelCost ?? 0).toLocaleString()}</span>
                  </li>
                  <li className="flex justify-between font-semibold text-lg">
                    <span>시간당 총액:</span>
                    <span className="text-blue-600">{plans?.hourly?.total || '—'}</span>
                  </li>
                </ul>
              </div>
            )}

            {activeTab === 'perjob' && (
              <div>
                {/* 정기/비정기 라디오 버튼 */}
                <div className="flex items-center gap-4 mb-3 p-3 bg-gray-50 rounded-lg">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="schedule"
                      checked={scheduleType === 'ad-hoc'}
                      onChange={() => setScheduleType('ad-hoc')}
                      className="text-green-600 focus:ring-green-500"
                    />
                    비정기(하루)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="schedule"
                      checked={scheduleType === 'regular'}
                      onChange={() => setScheduleType('regular')}
                      className="text-green-600 focus:ring-green-500"
                    />
                    정기(일주일+)
                  </label>
                </div>

                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                  <div className="text-center">
                    <div className="text-xs text-green-600 font-medium mb-1">단건 요금제</div>
                    <div className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                      {plans?.perJob?.total || '—'}
                    </div>
                  </div>
                </div>
                <ul className="mt-3 text-green-800 space-y-2">
                  <li className="flex justify-between">
                    <span>스케줄 타입:</span>
                    <span className="font-medium">{scheduleType === 'regular' ? '정기' : '비정기'}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>기본요금(구간):</span>
                    <span className="font-medium">₩{(plans?.perJob?.base ?? 0).toLocaleString()} {plans?.perJob?.bracketLabel ? <span className="text-gray-500">({plans?.perJob?.bracketLabel})</span> : null}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>경유지 추가({effectiveStopsCount}개):</span>
                    <span className="font-medium">₩{(plans?.perJob?.stopFee ?? 0).toLocaleString()}</span>
                  </li>
                  <li className="flex justify-between font-semibold text-lg">
                    <span>단건 총액:</span>
                    <span className="text-green-600">{plans?.perJob?.total || '—'}</span>
                  </li>
                  {plans?.perJob?.nextBracketLabel && (
                    <li className="text-xs text-gray-600">
                      다음 구간 {plans.perJob.nextBracketLabel} 진입 시 +₩{(plans.perJob.nextDelta || 0).toLocaleString()}
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}


