'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Loader2, X } from 'lucide-react';
import RiskReportModal from '@/components/modals/RiskReportModal';
import { DocumentFileType } from '@/domains/quote/types/quoteDocument';

type ReviewStep = 'upload' | 'parsing' | 'extracting' | 'validating' | 'generating' | 'completed';

interface ReviewResult {
  documentId: string;
  extractionId: string;
  validationId: string;
  reportId: string;
  reportContent: string;
  riskScore: number;
  riskSummary?: {
    totalRisks: number;
    highRisks: number;
    mediumRisks: number;
    lowRisks: number;
  };
}

export default function QuoteRiskReviewPanel() {
  const [currentStep, setCurrentStep] = useState<ReviewStep>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<Array<{
    id: string;
    name: string;
    type: DocumentFileType;
    size: number;
  }>>([]);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    setError(null);
    setCurrentStep('upload');

    // 파일 업로드
    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/quote/document-upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const errorData = await uploadRes.json();
        throw new Error(errorData.error?.message || '파일 업로드에 실패했습니다');
      }

      const uploadData = await uploadRes.json();
      if (!uploadData.success || !uploadData.data) {
        throw new Error('파일 업로드 응답이 올바르지 않습니다');
      }

      setUploadedFiles([{
        id: uploadData.data.id,
        name: uploadData.data.file_name,
        type: uploadData.data.file_type,
        size: uploadData.data.file_size,
      }]);

      // 문서 파싱
      setCurrentStep('parsing');
      const parseRes = await fetch('/api/quote/parse-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: uploadData.data.id }),
      });

      if (!parseRes.ok) {
        const errorData = await parseRes.json();
        throw new Error(errorData.error?.message || '문서 파싱에 실패했습니다');
      }

      const parseData = await parseRes.json();
      if (!parseData.success || !parseData.data) {
        throw new Error('문서 파싱 응답이 올바르지 않습니다');
      }

      // 정보 추출
      setCurrentStep('extracting');
      const extractRes = await fetch('/api/quote/extract-quote-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: uploadData.data.id,
          text: parseData.data.text,
          preferLLM: true,
        }),
      });

      if (!extractRes.ok) {
        const errorData = await extractRes.json();
        throw new Error(errorData.error?.message || '정보 추출에 실패했습니다');
      }

      const extractData = await extractRes.json();
      if (!extractData.success || !extractData.data) {
        throw new Error('정보 추출 응답이 올바르지 않습니다');
      }

      // 경로 검증
      setCurrentStep('validating');
      const validateRes = await fetch('/api/quote/validate-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extractionId: extractData.data.id,
          extractedData: extractData.data.extracted_data,
        }),
      });

      if (!validateRes.ok) {
        const errorData = await validateRes.json();
        throw new Error(errorData.error?.message || '경로 검증에 실패했습니다');
      }

      const validateData = await validateRes.json();
      if (!validateData.success || !validateData.data) {
        throw new Error('경로 검증 응답이 올바르지 않습니다');
      }

      // 리포트 생성
      setCurrentStep('generating');
      const reportRes = await fetch('/api/quote/generate-risk-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          validationId: validateData.data.id,
          extractedData: extractData.data.extracted_data,
          validationResults: validateData.data.validation_results,
        }),
      });

      if (!reportRes.ok) {
        const errorData = await reportRes.json();
        throw new Error(errorData.error?.message || '리포트 생성에 실패했습니다');
      }

      const reportData = await reportRes.json();
      if (!reportData.success || !reportData.data) {
        throw new Error('리포트 생성 응답이 올바르지 않습니다');
      }

      setReviewResult({
        documentId: uploadData.data.id,
        extractionId: extractData.data.id,
        validationId: validateData.data.id,
        reportId: reportData.data.id,
        reportContent: reportData.data.report_content,
        riskScore: validateData.data.risk_score,
        riskSummary: reportData.data.risk_summary,
      });

      setCurrentStep('completed');
    } catch (err) {
      console.error('검토 프로세스 오류:', err);
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다');
      setCurrentStep('upload');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const resetReview = useCallback(() => {
    setCurrentStep('upload');
    setUploadedFiles([]);
    setReviewResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const getStepLabel = (step: ReviewStep) => {
    switch (step) {
      case 'upload': return '파일 업로드';
      case 'parsing': return '문서 파싱';
      case 'extracting': return '정보 추출';
      case 'validating': return '경로 검증';
      case 'generating': return '리포트 생성';
      case 'completed': return '완료';
      default: return '';
    }
  };

  return (
    <div className="glass-panel p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">견적안 리스크 검토</h2>
        {reviewResult && (
          <button
            onClick={resetReview}
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            새로 검토하기
          </button>
        )}
      </div>

      {/* 파일 업로드 영역 */}
      {currentStep === 'upload' && !reviewResult && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-500 transition-colors cursor-pointer bg-gray-50"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg,.gif"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
          <Upload className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <p className="text-lg font-medium text-gray-700 mb-2">
            파일을 드래그하거나 클릭하여 업로드
          </p>
          <p className="text-sm text-gray-500">
            PDF, Excel, Word, 이미지 파일 지원 (최대 50MB)
          </p>
        </div>
      )}

      {/* 진행 상태 표시 */}
      {(currentStep !== 'upload' || reviewResult) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">검토 진행 상태</span>
            {currentStep !== 'completed' && (
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            )}
          </div>
          <div className="space-y-2">
            {(['upload', 'parsing', 'extracting', 'validating', 'generating', 'completed'] as ReviewStep[]).map((step) => {
              const stepIndex = ['upload', 'parsing', 'extracting', 'validating', 'generating', 'completed'].indexOf(step);
              const currentIndex = ['upload', 'parsing', 'extracting', 'validating', 'generating', 'completed'].indexOf(currentStep);
              const isCompleted = stepIndex < currentIndex || (currentStep === 'completed');
              const isCurrent = stepIndex === currentIndex;

              return (
                <div key={step} className="flex items-center gap-3">
                  {isCompleted ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : isCurrent ? (
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                  )}
                  <span className={`text-sm ${isCompleted ? 'text-green-600 font-medium' : isCurrent ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
                    {getStepLabel(step)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 업로드된 파일 정보 */}
      {uploadedFiles.length > 0 && (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-gray-600" />
            <div className="flex-1">
              <p className="font-medium text-gray-900">{uploadedFiles[0].name}</p>
              <p className="text-sm text-gray-500">
                {(uploadedFiles[0].size / 1024 / 1024).toFixed(2)}MB · {uploadedFiles[0].type.toUpperCase()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 오류 표시 */}
      {error && (
        <div className="border border-red-300 rounded-lg p-4 bg-red-50 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-red-900">오류 발생</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 결과 표시 */}
      {reviewResult && currentStep === 'completed' && (
        <div className="space-y-4">
          <div className="border border-gray-200 rounded-lg p-6 bg-gradient-to-br from-blue-50 to-indigo-50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">검토 완료</h3>
              <div className={`px-4 py-2 rounded-lg font-bold ${
                reviewResult.riskScore >= 70 ? 'bg-red-100 text-red-700' :
                reviewResult.riskScore >= 40 ? 'bg-yellow-100 text-yellow-700' :
                'bg-green-100 text-green-700'
              }`}>
                리스크 점수: {reviewResult.riskScore}/100
              </div>
            </div>
            {reviewResult.riskSummary && (
              <div className="grid grid-cols-4 gap-4 mt-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{reviewResult.riskSummary.totalRisks}</p>
                  <p className="text-sm text-gray-600">전체 리스크</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{reviewResult.riskSummary.highRisks}</p>
                  <p className="text-sm text-gray-600">높은 위험</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-600">{reviewResult.riskSummary.mediumRisks}</p>
                  <p className="text-sm text-gray-600">보통 위험</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{reviewResult.riskSummary.lowRisks}</p>
                  <p className="text-sm text-gray-600">낮은 위험</p>
                </div>
              </div>
            )}
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="mt-6 w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              상세 리포트 보기
            </button>
          </div>
        </div>
      )}

      {/* 리포트 모달 */}
      <RiskReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        reportContent={reviewResult?.reportContent || ''}
        riskScore={reviewResult?.riskScore}
        riskSummary={reviewResult?.riskSummary}
      />
    </div>
  );
}



