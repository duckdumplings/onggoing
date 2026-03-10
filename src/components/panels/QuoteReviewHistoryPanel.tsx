'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Trash2, Eye, AlertCircle, CheckCircle, X } from 'lucide-react';
import RiskReportModal from '@/components/modals/RiskReportModal';

interface ReviewItem {
  id: string;
  documentId: string;
  fileName: string;
  fileType: string;
  riskScore: number;
  totalDistance?: number;
  totalTime?: number;
  confidenceScore?: number;
  generatedAt: string;
  riskSummary?: {
    totalRisks: number;
    highRisks: number;
    mediumRisks: number;
    lowRisks: number;
  };
}

export default function QuoteReviewHistoryPanel() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<{
    reportContent: string;
    riskScore: number;
    riskSummary?: ReviewItem['riskSummary'];
  } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/quote/reviews?limit=50');
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || '검토 이력 조회에 실패했습니다');
      }

      const data = await res.json();
      if (!data.success || !data.data) {
        throw new Error('검토 이력 응답이 올바르지 않습니다');
      }

      setReviews(data.data.reviews || []);
    } catch (err) {
      console.error('검토 이력 조회 오류:', err);
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleViewReport = useCallback(async (reviewId: string) => {
    try {
      const res = await fetch(`/api/quote/reviews/${reviewId}`);
      if (!res.ok) {
        throw new Error('리포트 조회에 실패했습니다');
      }

      const data = await res.json();
      if (!data.success || !data.data) {
        throw new Error('리포트 응답이 올바르지 않습니다');
      }

      setSelectedReview({
        reportContent: data.data.report_content || '',
        riskScore: data.data.quote_validations?.risk_score || 0,
        riskSummary: data.data.risk_summary,
      });
      setIsModalOpen(true);
    } catch (err) {
      console.error('리포트 조회 오류:', err);
      alert(err instanceof Error ? err.message : '리포트 조회에 실패했습니다');
    }
  }, []);

  const handleDeleteReview = useCallback(async (reviewId: string) => {
    if (!confirm('정말 이 검토를 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/quote/reviews/${reviewId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || '검토 삭제에 실패했습니다');
      }

      // 목록에서 제거
      setReviews(prev => prev.filter(r => r.id !== reviewId));
    } catch (err) {
      console.error('검토 삭제 오류:', err);
      alert(err instanceof Error ? err.message : '검토 삭제에 실패했습니다');
    }
  }, []);

  const getRiskColor = (score: number) => {
    if (score >= 70) return 'text-red-600 bg-red-50 border-red-200';
    if (score >= 40) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-green-600 bg-green-50 border-green-200';
  };

  const getFileTypeIcon = (fileType: string) => {
    switch (fileType) {
      case 'pdf': return '📄';
      case 'excel': return '📊';
      case 'word': return '📝';
      case 'image': return '🖼️';
      default: return '📎';
    }
  };

  return (
    <div className="glass-panel p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">검토 이력</h2>
        <button
          onClick={fetchReviews}
          className="text-sm text-gray-600 hover:text-gray-900 underline"
        >
          새로고침
        </button>
      </div>

      {/* 로딩 상태 */}
      {loading && (
        <div className="text-center py-8 text-gray-500">
          검토 이력을 불러오는 중...
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

      {/* 검토 목록 */}
      {!loading && !error && (
        <div className="space-y-3">
          {reviews.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              검토 이력이 없습니다
            </div>
          ) : (
            reviews.map((review) => (
              <div
                key={review.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{getFileTypeIcon(review.fileType)}</span>
                      <div>
                        <p className="font-medium text-gray-900">{review.fileName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(review.generatedAt).toLocaleString('ko-KR')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-3">
                      <div className={`px-3 py-1 rounded-lg border text-sm font-medium ${getRiskColor(review.riskScore)}`}>
                        리스크: {review.riskScore}/100
                      </div>
                      {review.riskSummary && (
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <span>높음: {review.riskSummary.highRisks}</span>
                          <span>보통: {review.riskSummary.mediumRisks}</span>
                          <span>낮음: {review.riskSummary.lowRisks}</span>
                        </div>
                      )}
                      {review.totalDistance && (
                        <div className="text-xs text-gray-600">
                          거리: {review.totalDistance.toFixed(2)}km
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleViewReport(review.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="리포트 보기"
                    >
                      <Eye className="w-5 h-5 text-gray-600" />
                    </button>
                    <button
                      onClick={() => handleDeleteReview(review.id)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-5 h-5 text-red-600" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 리포트 모달 */}
      <RiskReportModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedReview(null);
        }}
        reportContent={selectedReview?.reportContent || ''}
        riskScore={selectedReview?.riskScore}
        riskSummary={selectedReview?.riskSummary}
      />
    </div>
  );
}



