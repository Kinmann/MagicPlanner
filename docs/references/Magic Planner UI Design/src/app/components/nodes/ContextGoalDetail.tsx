import React from 'react';
import { 
  Target, 
  TrendingUp, 
  Activity, 
  ShieldCheck, 
  Calendar, 
  CheckCircle2, 
} from 'lucide-react';

const data = {
  "global_constraints": {
    "compliance": [],
    "legacy_integrations": [],
    "performance": [
      "웹 환경에서의 안정적인 서비스 가용성 확보",
      "메뉴 추천 및 레시피 검색 기능의 응답 시간 1초 이내 유지",
      "시스템 모듈 간의 낮은 결합도 유지 및 확장성 확보"
    ]
  },
  "metadata": {
    "generated_at": "2023-11-20T10:00:00Z",
    "project_name": "저메추!",
    "status": "DRAFT",
    "version": "1.0.0"
  },
  "product_vision": "바쁜 맞벌이 부부의 저녁 식사 준비 부담 경감 및 식단 결정 지원을 통한 생활 편의성 증대",
  "success_metrics": [
    "월간 활성 사용자(MAU) 5천 명 달성",
    "주간 메뉴 추천 기능 이용률 70% 이상 유지",
    "사용자별 평균 주간 식료품 목록 생성 횟수 2회 이상 달성"
  ],
  "target_market": "시간이 부족한 맞벌이 부부 중 가정식 선호 사용자"
};

export function ContextGoalDetail({ isRawMode }: { isRawMode?: boolean }) {
  return (
    <div className="flex flex-col gap-6 pb-8 animate-in fade-in duration-300 mt-2">
      
      {/* Conditional Rendering: Raw Spec (JSON) vs UI */}
      {isRawMode ? (
        <div className="bg-[#121216] border border-[#27272a] rounded p-6 overflow-auto max-h-[600px]">
          <pre className="text-sm font-mono text-[#10b981]/80">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      ) : (
        <>
          {/* Header Section */}
          <div className="flex flex-col gap-4 mb-4">
        {/* Properties (Above Title) */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className={`px-2 py-1 rounded font-bold uppercase tracking-wider ${data.metadata.status === 'DRAFT' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-[#10b981]/10 text-[#10b981]'}`}>
            {data.metadata.status}
          </span>
          <span className="px-2 py-1 rounded bg-[#27272a]/50 text-gray-300 font-mono">
            v{data.metadata.version}
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#27272a]/50 text-gray-400">
            <Calendar size={12} className="opacity-70" />
            {new Date(data.metadata.generated_at).toLocaleDateString()}
          </span>
        </div>

        {/* Project Title (Consumes full line) */}
        <div className="w-full pb-6 border-b border-[#27272a]">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-100 break-words leading-tight w-full">
            {data.metadata.project_name}
          </h1>
        </div>
      </div>

      {/* Content Section (Simplified UI without cards) */}
      <div className="space-y-12">
        
        {/* Vision & Target Market */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wider text-gray-500 uppercase flex items-center gap-2">
              <Target size={16} className="text-[#10b981]" />
              Product Vision
            </h2>
            <p className="text-[15px] text-gray-300 leading-relaxed pl-6">
              {data.product_vision}
            </p>
          </section>
          
          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wider text-gray-500 uppercase flex items-center gap-2">
              <Activity size={16} className="text-[#10b981]" />
              Target Market
            </h2>
            <p className="text-[15px] text-gray-300 leading-relaxed pl-6">
              {data.target_market}
            </p>
          </section>
        </div>

        {/* Success Metrics */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wider text-gray-500 uppercase flex items-center gap-2">
            <TrendingUp size={16} className="text-[#10b981]" />
            Success Metrics
          </h2>
          <ul className="space-y-4 pl-6">
            {data.success_metrics.map((metric, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <CheckCircle2 size={18} className="text-[#10b981] shrink-0 mt-0.5" />
                <span className="text-[15px] text-gray-300">{metric}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Global Constraints */}
        <section className="space-y-6 pt-6 border-t border-[#27272a]/50">
          <h2 className="text-sm font-semibold tracking-wider text-gray-500 uppercase flex items-center gap-2">
            <ShieldCheck size={16} className="text-[#10b981]" />
            Global Constraints
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pl-6">
            {/* Performance */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 border-b border-[#27272a]/50 pb-2">
                Performance
              </h3>
              {data.global_constraints.performance.length > 0 ? (
                <ul className="space-y-3">
                  {data.global_constraints.performance.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-sm text-gray-400">
                      <span className="text-gray-600 mt-0.5 text-[10px]">■</span>
                      <span className="leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-600 italic">None defined.</p>
              )}
            </div>

            {/* Compliance */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 border-b border-[#27272a]/50 pb-2">
                Compliance
              </h3>
              {data.global_constraints.compliance.length > 0 ? (
                <ul className="space-y-3">
                  {data.global_constraints.compliance.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-sm text-gray-400">
                      <span className="text-gray-600 mt-0.5 text-[10px]">■</span>
                      <span className="leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-600 italic">None defined.</p>
              )}
            </div>

            {/* Legacy Integrations */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 border-b border-[#27272a]/50 pb-2">
                Legacy Integrations
              </h3>
              {data.global_constraints.legacy_integrations.length > 0 ? (
                <ul className="space-y-3">
                  {data.global_constraints.legacy_integrations.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-sm text-gray-400">
                      <span className="text-gray-600 mt-0.5 text-[10px]">■</span>
                      <span className="leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-600 italic">None defined.</p>
              )}
            </div>
          </div>
        </section>
      </div>
      </>
      )}
    </div>
  );
}
