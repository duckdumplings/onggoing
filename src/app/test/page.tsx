import RouteOptimizationTest from '@/components/RouteOptimizationTest';
import SimpleTmapTest from '@/components/map/SimpleTmapTest';
import BasicMapTest from '@/components/map/BasicMapTest';
import TmapCallbackTest from '@/components/map/TmapCallbackTest';
import TmapAlternativeTest from '@/components/map/TmapAlternativeTest';
import TmapCorrectTest from '@/components/map/TmapCorrectTest';
import MapboxTest from '@/components/map/MapboxTest';
import DebugGuide from '@/components/map/DebugGuide';

export default function TestPage() {
  return (
    <div className="space-y-8">
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Tmap 지도 테스트</h1>

        <DebugGuide />

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Mapbox GL 테스트 (구조 검증용)</h2>
          <MapboxTest />
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">올바른 구조 Tmap 테스트 (권장)</h2>
          <TmapCorrectTest />
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">대체 Tmap 초기화 방식 (최신)</h2>
          <TmapAlternativeTest />
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Tmap API 공식 방식 테스트</h2>
          <TmapCallbackTest />
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">기본 지도 테스트 (새로운)</h2>
          <BasicMapTest />
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">기본 지도 테스트 (기존)</h2>
          <SimpleTmapTest />
        </div>
      </div>

      <RouteOptimizationTest />
    </div>
  );
} 