import React from 'react';
import { cn } from '@/utils/cn';

export interface FooterProps {
  className?: string;
}

const Footer: React.FC<FooterProps> = ({ className }) => {
  return (
    <footer className={cn(
      'bg-gray-50 border-t border-gray-200',
      className
    )}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* 회사 정보 */}
            <div className="col-span-1 md:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                옹고잉 스마트 물류
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                최적화된 배송 경로와 합리적인 견적으로 물류 효율을 극대화합니다.
              </p>
              <div className="flex space-x-4">
                <a
                  href="#"
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                  aria-label="이메일"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                  </svg>
                </a>
                <a
                  href="#"
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                  aria-label="전화"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </a>
              </div>
            </div>

            {/* 서비스 */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-4">서비스</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="/dispatch" className="text-gray-600 hover:text-primary-600 transition-colors duration-200">
                    배차 관리
                  </a>
                </li>
                <li>
                  <a href="/quote" className="text-gray-600 hover:text-primary-600 transition-colors duration-200">
                    견적 산출
                  </a>
                </li>
                <li>
                  <a href="/tracking" className="text-gray-600 hover:text-primary-600 transition-colors duration-200">
                    실시간 추적
                  </a>
                </li>
                <li>
                  <a href="/admin" className="text-gray-600 hover:text-primary-600 transition-colors duration-200">
                    관리 대시보드
                  </a>
                </li>
              </ul>
            </div>

            {/* 지원 */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-4">지원</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="/help" className="text-gray-600 hover:text-primary-600 transition-colors duration-200">
                    도움말
                  </a>
                </li>
                <li>
                  <a href="/contact" className="text-gray-600 hover:text-primary-600 transition-colors duration-200">
                    문의하기
                  </a>
                </li>
                <li>
                  <a href="/privacy" className="text-gray-600 hover:text-primary-600 transition-colors duration-200">
                    개인정보처리방침
                  </a>
                </li>
                <li>
                  <a href="/terms" className="text-gray-600 hover:text-primary-600 transition-colors duration-200">
                    이용약관
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* 하단 구분선 */}
          <div className="border-t border-gray-200 mt-8 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <p className="text-sm text-gray-500">
                © 2025 옹고잉 스마트 물류. 모든 권리 보유.
              </p>
              <div className="mt-4 md:mt-0">
                <p className="text-xs text-gray-400">
                  버전 1.0.0 | 최종 업데이트: 2025-01-27
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer; 