'use client';

import React, { useState } from 'react';

export default function DebugGuide() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-left font-medium text-blue-800"
      >
        🔍 지도 문제 디버깅 가이드
        <span className="text-blue-600">{isExpanded ? '▼' : '▶'}</span>
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-4 text-sm">
          <div>
            <h4 className="font-semibold text-blue-700 mb-2">1️⃣ 화면에서 확인할 내용</h4>
            <ul className="list-disc list-inside space-y-1 text-blue-600">
              <li>지도가 나타나는가? (회색 영역이 아닌 실제 지도)</li>
              <li>로딩 스피너가 나타나는가?</li>
              <li>에러 메시지가 나타나는가?</li>
              <li>"디버그 정보" 클릭하여 상세 로그 확인</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-blue-700 mb-2">2️⃣ 브라우저 개발자 도구 열기</h4>
            <div className="bg-white p-3 rounded border">
              <p className="text-gray-700 mb-2"><strong>Chrome/Edge:</strong> F12 또는 Ctrl+Shift+I</p>
              <p className="text-gray-700 mb-2"><strong>Mac:</strong> Cmd+Option+I</p>
              <p className="text-gray-700"><strong>Safari:</strong> Cmd+Option+I</p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-blue-700 mb-2">3️⃣ 콘솔에서 확인할 로그</h4>
            <div className="bg-gray-100 p-3 rounded font-mono text-xs">
              <p className="text-green-600">✅ 정상 로그:</p>
              <p className="text-gray-600">• "Tmap 스크립트 로드 완료"</p>
              <p className="text-gray-600">• "지도 컨테이너 준비됨"</p>
              <p className="text-gray-600">• "Tmap 지도 초기화 완료"</p>
              <br />
              <p className="text-red-600">❌ 문제 로그:</p>
              <p className="text-gray-600">• "Tmap 스크립트 로드 실패"</p>
              <p className="text-gray-600">• "지도 초기화 실패"</p>
              <p className="text-gray-600">• "API 키가 설정되지 않았습니다"</p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-blue-700 mb-2">4️⃣ 네트워크 탭에서 확인</h4>
            <ul className="list-disc list-inside space-y-1 text-blue-600">
              <li>개발자 도구 → Network 탭 클릭</li>
              <li>페이지 새로고침</li>
              <li>"jsv2" 검색하여 Tmap 스크립트 로드 확인</li>
              <li>상태 코드가 200인지 확인</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-blue-700 mb-2">5️⃣ 문제별 해결 방법</h4>
            <div className="space-y-2">
              <div className="bg-yellow-50 p-2 rounded border-l-4 border-yellow-400">
                <p className="font-medium text-yellow-800">API 키 문제</p>
                <p className="text-yellow-700 text-xs">→ .env.local 파일에서 API 키 확인</p>
              </div>
              <div className="bg-yellow-50 p-2 rounded border-l-4 border-yellow-400">
                <p className="font-medium text-yellow-800">스크립트 로드 실패</p>
                <p className="text-yellow-700 text-xs">→ 네트워크 연결 확인, 방화벽 설정 확인</p>
              </div>
              <div className="bg-yellow-50 p-2 rounded border-l-4 border-yellow-400">
                <p className="font-medium text-yellow-800">지도 초기화 실패</p>
                <p className="text-yellow-700 text-xs">→ 브라우저 캐시 삭제, 페이지 새로고침</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 