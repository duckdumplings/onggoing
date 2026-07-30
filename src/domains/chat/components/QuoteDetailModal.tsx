'use client';

import React from 'react';
import { X, Calculator } from 'lucide-react';

interface QuoteDetailModalProps {
  quote: any;
  onClose: () => void;
}

/** 견적 결과의 전체 운임 시나리오(차종×스케줄)를 표로 보여주는 상세 모달. */
export default function QuoteDetailModal({ quote: q, onClose }: QuoteDetailModalProps) {
  const formatWonStr = (val: number) => `₩${Math.round(val).toLocaleString('ko-KR')}`;
  const showPerJobReference = Boolean(q.perJobReferenceRequested);
  const formatPerJobReference = (val: unknown) =>
    val == null ? '운임표 범위 밖' : formatWonStr(Number(val));

  return (
    <div className="fixed inset-0 z-[4100] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h3 className="text-base font-bold text-foreground">운임 시나리오 상세</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-muted-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-6 text-sm flex-1 custom-scrollbar">
          <div className="flex items-center gap-4 bg-muted p-4 rounded-xl border border-border">
            <div className="flex-1">
              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">총 주행 거리</div>
              <div className="text-base font-black text-foreground">{q.basis?.distanceKm ?? '-'} km</div>
            </div>
            <div className="w-px h-8 bg-border"></div>
            <div className="flex-1">
              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">예상 소요 시간</div>
              <div className="text-base font-black text-foreground">{q.basis?.totalBillMinutes ?? '-'} 분</div>
            </div>
            <div className="w-px h-8 bg-border"></div>
            <div className="flex-1">
              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">경유지</div>
              <div className="text-base font-black text-foreground">{q.basis?.destinationCount ?? '-'} 곳</div>
            </div>
          </div>

          {q.scenarios && (
            <div className="space-y-4">
              <h4 className="font-bold text-foreground flex items-center gap-2">
                <Calculator className="w-4 h-4 text-primary" />
                전체 운임 비교 테이블
              </h4>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr>
                      <th className="py-3 px-4 bg-muted border-b border-border text-xs font-bold text-muted-foreground rounded-tl-xl">차량/스케줄</th>
                      <th className="py-3 px-4 bg-muted border-b border-border text-xs font-bold text-muted-foreground rounded-tr-xl">시간당 요금제</th>
                      {showPerJobReference && (
                        <th className="py-3 px-4 bg-muted border-b border-border text-xs font-bold text-muted-foreground">단건 참고</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    <tr className="border-b border-border hover:bg-muted transition-colors">
                      <td className="py-3 px-4 font-semibold text-foreground">
                        레이 <span className="text-muted-foreground font-medium text-[11px] ml-1">비정기</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-foreground">{formatWonStr(q.scenarios.ray?.['ad-hoc']?.hourlyTotal || 0)}</div>
                      </td>
                      {showPerJobReference && (
                        <td className="py-3 px-4">
                          <div className="font-bold text-foreground">{formatPerJobReference(q.scenarios.ray?.['ad-hoc']?.perJobTotal)}</div>
                        </td>
                      )}
                    </tr>
                    <tr className="border-b border-border hover:bg-muted transition-colors">
                      <td className="py-3 px-4 font-semibold text-foreground">
                        레이 <span className="text-muted-foreground font-medium text-[11px] ml-1">정기</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-foreground">{formatWonStr(q.scenarios.ray?.regular?.hourlyTotal || 0)}</div>
                      </td>
                      {showPerJobReference && (
                        <td className="py-3 px-4">
                          <div className="font-bold text-foreground">{formatPerJobReference(q.scenarios.ray?.regular?.perJobTotal)}</div>
                        </td>
                      )}
                    </tr>
                    <tr className="border-b border-border hover:bg-muted transition-colors">
                      <td className="py-3 px-4 font-semibold text-foreground">
                        스타렉스 <span className="text-muted-foreground font-medium text-[11px] ml-1">비정기</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-foreground">{formatWonStr(q.scenarios.starex?.['ad-hoc']?.hourlyTotal || 0)}</div>
                      </td>
                      {showPerJobReference && (
                        <td className="py-3 px-4">
                          <div className="font-bold text-foreground">{formatPerJobReference(q.scenarios.starex?.['ad-hoc']?.perJobTotal)}</div>
                        </td>
                      )}
                    </tr>
                    <tr className="hover:bg-muted transition-colors">
                      <td className="py-3 px-4 font-semibold text-foreground rounded-bl-xl">
                        스타렉스 <span className="text-muted-foreground font-medium text-[11px] ml-1">정기</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-foreground">{formatWonStr(q.scenarios.starex?.regular?.hourlyTotal || 0)}</div>
                      </td>
                      {showPerJobReference && (
                        <td className="py-3 px-4 rounded-br-xl">
                          <div className="font-bold text-foreground">{formatPerJobReference(q.scenarios.starex?.regular?.perJobTotal)}</div>
                        </td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="text-[11px] text-muted-foreground leading-relaxed bg-muted p-3 rounded-lg border border-border">
            * 시간당 요금제: {q.basis?.totalBillMinutes}분 과금 기준 (시간단가 적용 + 유류할증)<br />
            * 대표 견적과 계약 합계는 시간당 운임표만 사용합니다.
            {showPerJobReference && (
              <>
                <br />* 단건 운임은 요청에 따라 표시한 참고값이며 대표 견적에는 반영하지 않습니다.
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
