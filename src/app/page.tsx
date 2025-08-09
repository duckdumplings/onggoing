import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            옹고잉 스마트 물류 플랫폼
          </h1>
          <p className="text-xl text-gray-600">
            경로 최적화 및 견적 시스템 (카카오맵 기반 UI)
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href="/test" className="block">
            <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                🗺️ 경로 최적화 테스트
              </h2>
              <p className="text-gray-600">
                실시간 경로 최적화 기능을 테스트해보세요.
              </p>
            </div>
          </Link>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              📊 견적 시스템
            </h2>
            <p className="text-gray-600">
              옹고잉 요금제 기반 자동 견적 생성 (준비 중)
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              🚚 배차 관리
            </h2>
            <p className="text-gray-600">
              다중 차량 배차 최적화 (준비 중)
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              📱 실시간 추적
            </h2>
            <p className="text-gray-600">
              차량 위치 실시간 모니터링 (준비 중)
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              📈 관리 대시보드
            </h2>
            <p className="text-gray-600">
              운영 현황 및 통계 분석 (준비 중)
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              ⚙️ 설정
            </h2>
            <p className="text-gray-600">
              시스템 설정 및 사용자 관리 (준비 중)
            </p>
          </div>
        </div>

        <div className="mt-12 text-center">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              🚀 현재 구현된 기능
            </h3>
            <ul className="text-blue-800 space-y-1">
              <li>✅ 카카오맵 지도 표시</li>
              <li>✅ 실시간 경로 최적화</li>
              <li>✅ 주소 → 좌표 변환 (Geocoding)</li>
              <li>✅ 다중 목적지 경로 계산</li>
              <li>✅ 차량 타입별 경로 최적화</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
} 