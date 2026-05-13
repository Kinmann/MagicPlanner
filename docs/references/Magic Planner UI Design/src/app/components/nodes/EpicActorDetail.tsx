import React, { useState } from 'react';
import { 
  Users, 
  User, 
  ListTodo, 
  CheckCircle2, 
  Layers
} from 'lucide-react';
import { NodeActionHeader } from './NodeActionHeader';

const data = {
  "actors": [
    {
      "description": "회원가입을 완료하고 서비스를 이용하는 주체",
      "role_name": "일반 사용자"
    },
    {
      "description": "서비스 전반의 모니터링 및 사용자 관리 권한을 가진 주체",
      "role_name": "시스템 관리자"
    }
  ],
  "core_epics": [
    {
      "acceptance_criteria": [
        "사용자는 이메일과 비밀번호를 이용하여 회원가입을 할 수 있음",
        "사용자는 등록된 계정으로 로그인할 수 있음",
        "비밀번호는 일방향 암호화 처리되어 저장됨",
        "사용자는 계정 정보를 수정할 수 있음"
      ],
      "description": "보안 접근을 위한 회원가입, 로그인 및 세션 관리 체계 구현",
      "epic_id": "EPIC-001",
      "required_actors": [
        "일반 사용자",
        "시스템 관리자"
      ],
      "title": "사용자 인증 및 계정 관리"
    },
    {
      "acceptance_criteria": [
        "사용자는 보유 재료의 종류와 수량을 등록할 수 있음",
        "사용자는 등록된 재료 정보를 수정할 수 있음",
        "사용자는 등록된 재료를 삭제할 수 있음",
        "등록된 재료 목록은 사용자 계정에 연동되어 유지됨"
      ],
      "description": "사용자가 현재 보유하고 있는 식재료 목록을 등록, 수정, 삭제할 수 있는 기능 제공",
      "epic_id": "EPIC-002",
      "required_actors": [
        "일반 사용자"
      ],
      "title": "사용자 보유 재료 관리"
    },
    {
      "acceptance_criteria": [
        "AI는 사용자 보유 재료를 고려하여 메뉴를 추천함",
        "추천된 메뉴에 대한 상세 레시피 정보를 제공함",
        "레시피는 조리 과정, 필요한 재료 목록을 포함함",
        "메뉴 추천 기능의 응답 시간은 1초 이내로 유지됨"
      ],
      "description": "사용자의 보유 재료, 선호도, 식단 목표 등을 기반으로 AI가 최적의 저녁 메뉴를 추천하고 상세 레시피를 제공",
      "epic_id": "EPIC-003",
      "required_actors": [
        "일반 사용자"
      ],
      "title": "AI 기반 맞춤형 메뉴 추천 및 레시피 제공"
    },
    {
      "acceptance_criteria": [
        "메뉴 추천 시 집에 없는 재료 목록을 자동으로 식료품 구매 목록에 추가함",
        "사용자는 구매 목록에서 재료를 추가, 수정, 삭제할 수 있음",
        "사용자는 구매 완료된 재료를 목록에서 표시 또는 제거할 수 있음",
        "구매 목록은 사용자 계정에 연동되어 유지됨"
      ],
      "description": "추천된 메뉴에 필요한 재료 중 사용자가 보유하지 않은 재료를 자동으로 식료품 구매 목록에 추가하고, 사용자가 이를 관리할 수 있는 기능 제공",
      "epic_id": "EPIC-004",
      "required_actors": [
        "일반 사용자"
      ],
      "title": "자동 식료품 구매 목록 생성 및 관리"
    }
  ]
};

export function EpicActorDetail({ isRawMode }: { isRawMode?: boolean }) {
  return (
    <div className="flex flex-col gap-6 pb-8 animate-in fade-in duration-300 mt-2 text-gray-300 font-sans w-full max-w-[900px]">

      {/* Conditional Rendering: Raw Spec (JSON) vs UI */}
      {isRawMode ? (
        <div className="bg-[#121216] border border-[#27272a] rounded p-6 overflow-auto max-h-[600px]">
          <pre className="text-sm font-mono text-[#10b981]/80">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="space-y-12">
          {/* System Actors */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-gray-100 border-b border-[#27272a] pb-2 flex items-center gap-2">
              <Users size={20} className="text-[#10b981]" />
              1. System Actors
            </h2>
            <ul className="space-y-5 pl-2">
              {data.actors.map((actor, idx) => (
                <li key={idx} className="flex flex-col gap-1.5">
                  <span className="text-base font-semibold text-gray-200 flex items-center gap-2">
                    <User size={16} className="text-[#10b981]" />
                    {actor.role_name}
                  </span>
                  <span className="text-sm text-gray-400 pl-6 leading-relaxed block">{actor.description}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Core Epics */}
          <section className="space-y-6">
            <h2 className="text-xl font-bold text-gray-100 border-b border-[#27272a] pb-2 flex items-center gap-2">
              <Layers size={20} className="text-[#10b981]" />
              2. Core Epics
            </h2>
            
            <div className="space-y-10 pl-2">
              {data.core_epics.map((epic, idx) => (
                <article key={idx} className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-200 flex items-baseline gap-2">
                    <span className="text-sm font-mono text-gray-500 bg-[#27272a]/50 px-1.5 py-0.5 rounded">[{epic.epic_id}]</span>
                    {epic.title}
                  </h3>
                  
                  <div className="pl-6 space-y-5">
                    <p className="text-sm text-gray-300 leading-relaxed border-l-2 border-[#27272a] pl-4">
                      {epic.description}
                    </p>
                    
                    {epic.required_actors.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Users size={14} className="text-gray-500" />
                        <span className="font-semibold text-gray-500">Actors:</span>
                        <div className="flex gap-2">
                          {epic.required_actors.map((actor, aIdx) => (
                            <span key={aIdx} className="bg-[#1e1e24] border border-[#27272a] px-2 py-0.5 rounded text-xs">{actor}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-gray-500 flex items-center gap-1.5">
                        <ListTodo size={16} />
                        Acceptance Criteria:
                      </h4>
                      <ul className="space-y-2.5 text-sm text-gray-400">
                        {epic.acceptance_criteria.map((criteria, cIdx) => (
                          <li key={cIdx} className="flex items-start gap-2.5 leading-snug group hover:text-gray-300 transition-colors">
                            <CheckCircle2 size={16} className="text-[#10b981]/50 group-hover:text-[#10b981] shrink-0 mt-0.5 transition-colors" />
                            <span>{criteria}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
