'use client';

import React from 'react';
import { X } from 'lucide-react';

// 간단한 마크다운 렌더링 함수
function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];
  let inList = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('### ')) {
      if (inList) {
        elements.push(
          <ul key={`list-${index}`} className="list-disc list-inside mb-3 space-y-1 text-gray-700">
            {currentList.map((item, i) => (
              <li key={i} className="ml-4">{item}</li>
            ))}
          </ul>
        );
        currentList = [];
        inList = false;
      }
      elements.push(
        <h3 key={index} className="text-lg font-semibold text-gray-700 mt-4 mb-2">
          {trimmed.substring(4)}
        </h3>
      );
    } else if (trimmed.startsWith('## ')) {
      if (inList) {
        elements.push(
          <ul key={`list-${index}`} className="list-disc list-inside mb-3 space-y-1 text-gray-700">
            {currentList.map((item, i) => (
              <li key={i} className="ml-4">{item}</li>
            ))}
          </ul>
        );
        currentList = [];
        inList = false;
      }
      elements.push(
        <h2 key={index} className="text-xl font-bold text-gray-800 mt-5 mb-3">
          {trimmed.substring(3)}
        </h2>
      );
    } else if (trimmed.startsWith('# ')) {
      if (inList) {
        elements.push(
          <ul key={`list-${index}`} className="list-disc list-inside mb-3 space-y-1 text-gray-700">
            {currentList.map((item, i) => (
              <li key={i} className="ml-4">{item}</li>
            ))}
          </ul>
        );
        currentList = [];
        inList = false;
      }
      elements.push(
        <h1 key={index} className="text-2xl font-bold text-gray-900 mt-6 mb-4">
          {trimmed.substring(2)}
        </h1>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        inList = true;
        currentList = [];
      }
      currentList.push(trimmed.substring(2));
    } else if (trimmed === '') {
      if (inList) {
        elements.push(
          <ul key={`list-${index}`} className="list-disc list-inside mb-3 space-y-1 text-gray-700">
            {currentList.map((item, i) => (
              <li key={i} className="ml-4">{item}</li>
            ))}
          </ul>
        );
        currentList = [];
        inList = false;
      }
      elements.push(<div key={index} className="mb-3" />);
    } else {
      if (inList) {
        elements.push(
          <ul key={`list-${index}`} className="list-disc list-inside mb-3 space-y-1 text-gray-700">
            {currentList.map((item, i) => (
              <li key={i} className="ml-4">{item}</li>
            ))}
          </ul>
        );
        currentList = [];
        inList = false;
      }
      // 간단한 강조 처리 (**텍스트**)
      const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
      const processedLine = parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      });
      elements.push(
        <p key={index} className="text-gray-700 mb-3 leading-relaxed">
          {processedLine}
        </p>
      );
    }
  });

  // 마지막 리스트 처리
  if (inList && currentList.length > 0) {
    elements.push(
      <ul key="list-final" className="list-disc list-inside mb-3 space-y-1 text-gray-700">
        {currentList.map((item, i) => (
          <li key={i} className="ml-4">{item}</li>
        ))}
      </ul>
    );
  }

  return <>{elements}</>;
}

interface RiskReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportContent: string;
  riskScore?: number;
  riskSummary?: {
    totalRisks: number;
    highRisks: number;
    mediumRisks: number;
    lowRisks: number;
  };
}

export default function RiskReportModal({
  isOpen,
  onClose,
  reportContent,
  riskScore,
  riskSummary,
}: RiskReportModalProps) {
  if (!isOpen) return null;

  // 리스크 점수에 따른 색상 결정
  const getRiskColor = (score?: number) => {
    if (!score) return 'text-gray-600';
    if (score >= 70) return 'text-red-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getRiskLabel = (score?: number) => {
    if (!score) return '알 수 없음';
    if (score >= 70) return '높음';
    if (score >= 40) return '보통';
    return '낮음';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 모달 컨테이너 */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">리스크 분석 리포트</h2>
            <div className="flex items-center gap-4 mt-2">
              {riskScore !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">리스크 점수:</span>
                  <span className={`text-xl font-bold ${getRiskColor(riskScore)}`}>
                    {riskScore}/100 ({getRiskLabel(riskScore)})
                  </span>
                </div>
              )}
              {riskSummary && (
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>전체: {riskSummary.totalRisks}개</span>
                  <span className="text-red-600">높음: {riskSummary.highRisks}개</span>
                  <span className="text-yellow-600">보통: {riskSummary.mediumRisks}개</span>
                  <span className="text-green-600">낮음: {riskSummary.lowRisks}개</span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* 리포트 내용 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="prose max-w-none">
            {renderMarkdown(reportContent)}
          </div>
        </div>

        {/* 푸터 */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

