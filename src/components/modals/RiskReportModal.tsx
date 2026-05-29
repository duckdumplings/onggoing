'use client';

import React from 'react';
import { Modal } from '@/components/ui';

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
          <ul key={`list-${index}`} className="list-disc list-inside mb-3 space-y-1 text-foreground">
            {currentList.map((item, i) => (
              <li key={i} className="ml-4">{item}</li>
            ))}
          </ul>
        );
        currentList = [];
        inList = false;
      }
      elements.push(
        <h3 key={index} className="text-lg font-semibold text-foreground mt-4 mb-2">
          {trimmed.substring(4)}
        </h3>
      );
    } else if (trimmed.startsWith('## ')) {
      if (inList) {
        elements.push(
          <ul key={`list-${index}`} className="list-disc list-inside mb-3 space-y-1 text-foreground">
            {currentList.map((item, i) => (
              <li key={i} className="ml-4">{item}</li>
            ))}
          </ul>
        );
        currentList = [];
        inList = false;
      }
      elements.push(
        <h2 key={index} className="text-xl font-bold text-foreground mt-5 mb-3">
          {trimmed.substring(3)}
        </h2>
      );
    } else if (trimmed.startsWith('# ')) {
      if (inList) {
        elements.push(
          <ul key={`list-${index}`} className="list-disc list-inside mb-3 space-y-1 text-foreground">
            {currentList.map((item, i) => (
              <li key={i} className="ml-4">{item}</li>
            ))}
          </ul>
        );
        currentList = [];
        inList = false;
      }
      elements.push(
        <h1 key={index} className="text-2xl font-bold text-foreground mt-6 mb-4">
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
          <ul key={`list-${index}`} className="list-disc list-inside mb-3 space-y-1 text-foreground">
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
          <ul key={`list-${index}`} className="list-disc list-inside mb-3 space-y-1 text-foreground">
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
          return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      });
      elements.push(
        <p key={index} className="text-foreground mb-3 leading-relaxed">
          {processedLine}
        </p>
      );
    }
  });

  // 마지막 리스트 처리
  if (inList && currentList.length > 0) {
    elements.push(
      <ul key="list-final" className="list-disc list-inside mb-3 space-y-1 text-foreground">
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
  // 리스크 점수에 따른 색상 결정
  const getRiskColor = (score?: number) => {
    if (!score) return 'text-muted-foreground';
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      variant="center"
      size="4xl"
      headerClassName="bg-muted"
      bodyClassName="p-6"
      header={
        <div>
          <h2 className="text-2xl font-bold text-foreground">리스크 분석 리포트</h2>
          <div className="flex items-center gap-4 mt-2">
            {riskScore !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">리스크 점수:</span>
                <span className={`text-xl font-bold ${getRiskColor(riskScore)}`}>
                  {riskScore}/100 ({getRiskLabel(riskScore)})
                </span>
              </div>
            )}
            {riskSummary && (
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>전체: {riskSummary.totalRisks}개</span>
                <span className="text-red-600">높음: {riskSummary.highRisks}개</span>
                <span className="text-yellow-600">보통: {riskSummary.mediumRisks}개</span>
                <span className="text-green-600">낮음: {riskSummary.lowRisks}개</span>
              </div>
            )}
          </div>
        </div>
      }
      footer={
        <button
          onClick={onClose}
          className="px-6 py-2 bg-primary hover:bg-primary-700 text-primary-foreground rounded-lg font-medium transition-colors"
        >
          닫기
        </button>
      }
    >
      <div className="prose max-w-none">
        {renderMarkdown(reportContent)}
      </div>
    </Modal>
  );
}

