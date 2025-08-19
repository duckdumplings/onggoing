import TmapMainMap from '@/components/map/TmapMainMap';
import RouteOptimizerPanel from '@/components/panels/RouteOptimizerPanel';
import QuoteCalculatorPanel from '@/components/panels/QuoteCalculatorPanel';
import RouteResultsCard from '@/components/panels/RouteResultsCard';

export default function Home() {
  return (
    <div className="h-screen bg-gray-50 flex">
      {/* 좌측 패널 */}
      <aside className="w-96 hidden md:flex flex-col p-4 gap-3 bg-white/60 backdrop-blur-xl border-r border-white/40">
        <header className="px-2 pb-1">
          <h1 className="text-xl font-bold text-gray-900">옹고잉 물류</h1>
          <p className="text-xs text-gray-600">스마트 경로 최적화 플랫폼</p>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
          <RouteOptimizerPanel />
        </div>
        <QuoteCalculatorPanel />
      </aside>

      {/* 모바일 상단 패널 */}
      <div className="md:hidden w-full p-4 space-y-3">
        <RouteOptimizerPanel />
        <QuoteCalculatorPanel />
      </div>

      {/* 우측 지도 */}
      <main className="flex-1 relative">
        <TmapMainMap />
        <div className="absolute bottom-6 right-6 w-80 hidden md:block">
          <RouteResultsCard />
        </div>
      </main>
    </div>
  );
}