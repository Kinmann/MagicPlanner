import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { Store } from '@tauri-apps/plugin-store';
import { GlobalContext, CONTEXT_TYPE_LABELS, DocumentNode, GenerationIteration } from '../../types/project';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import './SadOverview.scss';

interface SadOverviewProps {
  projectId: string;
  globalNode: DocumentNode | null;
  moduleNode: DocumentNode | null;
  onModulesCreated: () => void;
  onRefresh: () => void;
  onUpdateMaxIterations: (nodeId: string, maxIterations: number) => void;
}

const SadOverview: React.FC<SadOverviewProps> = ({ 
  projectId, 
  globalNode, 
  moduleNode, 
  onModulesCreated, 
  onRefresh, 
  onUpdateMaxIterations 
}) => {
  const [contexts, setContexts] = useState<GlobalContext[]>([]);
  const [globalIters, setGlobalIters] = useState<GenerationIteration[]>([]);
  const [moduleIters, setModuleIters] = useState<GenerationIteration[]>([]);
  
  const [selectedGlobalIterId, setSelectedGlobalIterId] = useState<string | null>(null);
  const [selectedModuleIterId, setSelectedModuleIterId] = useState<string | null>(null);
  
  const [activeStage, setActiveStage] = useState<'GLOBAL' | 'MODULE'>('GLOBAL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCtx, setExpandedCtx] = useState<string | null>(null);

  const fetchContexts = async () => {
    try {
      const result = await invoke<GlobalContext[]>('get_global_contexts', { projectId });
      setContexts(result);
    } catch {}
  };

  const fetchIterations = async () => {
    try {
      if (globalNode?.node_id) {
        const result = await invoke<GenerationIteration[]>('get_node_iterations', { nodeId: globalNode.node_id });
        setGlobalIters(result);
        if (result.length > 0 && !selectedGlobalIterId) {
          setSelectedGlobalIterId(globalNode.node_state === 'PAUSED_HITL' || globalNode.node_state === 'COMPLETED' 
            ? result[result.length - 1].iteration_id 
            : 'OFFICIAL');
        }
      }
      if (moduleNode?.node_id) {
        const result = await invoke<GenerationIteration[]>('get_node_iterations', { nodeId: moduleNode.node_id });
        setModuleIters(result);
        if (result.length > 0 && !selectedModuleIterId) {
          setSelectedModuleIterId(moduleNode.node_state === 'PAUSED_HITL' || moduleNode.node_state === 'COMPLETED' 
            ? result[result.length - 1].iteration_id 
            : 'OFFICIAL');
        }
      }
    } catch {}
  };

  useEffect(() => { 
    fetchContexts(); 
    fetchIterations();
  }, [projectId, globalNode?.node_id, moduleNode?.node_id]);

  useEffect(() => {
    // Stage 1이 완료되었고 Stage 2가 진행 중이거나 준비된 상태면 Stage 2를 기본 활성 탭으로
    if (globalNode?.node_state === 'COMPLETED' && activeStage === 'GLOBAL') {
      setActiveStage('MODULE');
    }
  }, [globalNode?.node_state]);

  const handleRunStage = async (stage: 'GLOBAL' | 'MODULE') => {
    setLoading(true);
    setError(null);
    try {
      const store = await Store.load('settings.json');
      const apiKeyValue = await store.get<{ value: string }>('gemini_api_key');
      if (!apiKeyValue?.value) throw new Error('API 키가 설정되지 않았습니다.');
      
      const cmd = stage === 'GLOBAL' ? 'run_sad_global_pipeline' : 'run_sad_module_pipeline';
      await invoke(cmd, { projectId, apiKey: apiKeyValue.value });
      
      await fetchContexts();
      await fetchIterations();
      onRefresh();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmIteration = async (stage: 'GLOBAL' | 'MODULE') => {
    const iterId = stage === 'GLOBAL' ? selectedGlobalIterId : selectedModuleIterId;
    if (!iterId || iterId === 'OFFICIAL') return;

    setLoading(true);
    try {
      await invoke('confirm_sad_iteration', { projectId, iterationId: iterId });
      await fetchContexts();
      await fetchIterations();
      onRefresh();
      alert("공식 버전으로 확정되었습니다.");
    } catch (err: any) {
      alert("확정 실패: " + err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleCreateModules = async () => {
    setLoading(true);
    setError(null);
    try {
      const moduleListCtx = contexts.find(c => c.context_type === 'sad_module_list');
      if (!moduleListCtx) throw new Error('모듈 목록이 생성되지 않았습니다.');
      
      let parsed: any;
      try { parsed = JSON.parse(moduleListCtx.context_data_json); } catch { throw new Error('모듈 목록 JSON 파싱 실패'); }
      
      const modulesData = (parsed.modules || []).map((m: any, idx: number) => ({
        name: m.module_name,
        description: m.description,
        responsibility: m.core_responsibility,
        priority_order: m.priority_order ?? idx,
      }));

      await invoke('create_local_modules', { projectId, modulesJson: JSON.stringify(modulesData) });
      onModulesCreated();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const getCtxIcon = (type: string): string => {
    const map: Record<string, string> = {
      sad_core_erd: 'schema',
      sad_auth_rbac: 'shield_lock',
      sad_interface_error: 'api',
      sad_tech_stack: 'code',
      sad_non_tech: 'gavel',
      sad_module_list: 'view_module',
      sad_epic_mapping: 'link',
      sad_module_deps: 'device_hub',
    };
    return map[type] || 'article';
  };

  // 렌더링용 변수 추출
  const isGlobalDone = globalNode?.node_state === 'COMPLETED';
  const isModuleDone = moduleNode?.node_state === 'COMPLETED';
  
  const currentIters = activeStage === 'GLOBAL' ? globalIters : moduleIters;
  const currentSelectedIterId = activeStage === 'GLOBAL' ? selectedGlobalIterId : selectedModuleIterId;
  const currentNode = activeStage === 'GLOBAL' ? globalNode : moduleNode;

  const activeIteration = currentIters.find(it => it.iteration_id === currentSelectedIterId);

  // 통합 Grid에 표시할 데이터 결정
  const displayContexts = (() => {
    // 1. Stage 1 데이터 결정
    let stage1Docs: any[] = [];
    const stage1Types = ['sad_core_erd', 'sad_auth_rbac', 'sad_interface_error', 'sad_tech_stack', 'sad_non_tech'];
    
    if (selectedGlobalIterId === 'OFFICIAL') {
      // 최신 공식(또는 마지막 회차) 컨텍스트 추출
      const latestMap = new Map();
      contexts.forEach(c => {
        if (stage1Types.includes(c.context_type) && !latestMap.has(c.context_type)) {
          latestMap.set(c.context_type, c);
        }
      });
      stage1Docs = Array.from(latestMap.values());
    } else {
      // 선택된 이터레이션의 슬라이스만 표시
      stage1Docs = contexts.filter(c => c.iteration_id === selectedGlobalIterId && stage1Types.includes(c.context_type));
    }

    // 2. Stage 2 데이터 결정
    let stage2Docs: any[] = [];
    const stage2Types = ['sad_module_list', 'sad_epic_mapping', 'sad_module_deps'];
    
    if (selectedModuleIterId === 'OFFICIAL') {
      const latestMap = new Map();
      contexts.forEach(c => {
        if (stage2Types.includes(c.context_type) && !latestMap.has(c.context_type)) {
          latestMap.set(c.context_type, c);
        }
      });
      stage2Docs = Array.from(latestMap.values());
    } else {
      stage2Docs = contexts.filter(c => c.iteration_id === selectedModuleIterId && stage2Types.includes(c.context_type));
    }

    return [...stage1Docs, ...stage2Docs];
  })();

  return (
    <div className="sad-overview">
      <div className="sad-overview__header">
        <div className="sad-overview__title">
          <span className="material-symbols-outlined icon">architecture</span>
          <h2>System Architecture Design</h2>
        </div>
        <p className="sad-overview__desc">Global Context & Module Split 설계 단계입니다.</p>
        
        <div className="stage-stepper">
          <div className={`stage-step ${activeStage === 'GLOBAL' ? 'active' : ''} ${isGlobalDone ? 'completed' : ''}`} onClick={() => setActiveStage('GLOBAL')}>
            <div className="step-num">{isGlobalDone ? <span className="material-symbols-outlined">check</span> : '1'}</div>
            <div className="step-label">Stage 1: Global Context</div>
          </div>
          <div className="step-connector" />
          <div className={`stage-step ${activeStage === 'MODULE' ? 'active' : ''} ${isModuleDone ? 'completed' : ''} ${!isGlobalDone ? 'locked' : ''}`} onClick={() => isGlobalDone && setActiveStage('MODULE')}>
            <div className="step-num">{isModuleDone ? <span className="material-symbols-outlined">check</span> : '2'}</div>
            <div className="step-label">Stage 2: Module Split</div>
          </div>
        </div>
      </div>

      <div className="stage-control-panel">
        <div className="stage-info">
          <h3>
            {activeStage === 'GLOBAL' ? 'Stage 1: 글로벌 아키텍처 컨텍스트' : 'Stage 2: 모듈 분할 및 의존성 설계'}
            {currentNode && (
              <span className={`state-badge state-badge--${currentNode.node_state.toLowerCase().replace('_', '-')}`}>
                {currentNode.node_state.replace('_', ' ')}
              </span>
            )}
          </h3>
          <p>
            {activeStage === 'GLOBAL' 
              ? 'ERD, 기술 스택, 인터페이스 등 시스템 전반의 핵심 컨텍스트 5종을 정의합니다.' 
              : 'PRD 기반으로 시스템을 하위 모듈로 분할하고 에픽 매핑 및 의존성을 설계합니다.'}
          </p>
        </div>

        <div className="stage-actions">
           <div className="iteration-control">
             <label>Max Re-tries</label>
             <input 
               type="number" 
               min="1" 
               max="20" 
               value={currentNode?.max_iterations || 10} 
               onChange={(e) => currentNode && onUpdateMaxIterations(currentNode.node_id, parseInt(e.target.value))}
               disabled={loading || currentNode?.node_state === 'IN_PROGRESS' || currentNode?.node_state === 'COMPLETED'}
             />
           </div>

           {currentNode?.node_state !== 'IN_PROGRESS' && currentNode?.node_state !== 'COMPLETED' && (
             <Button 
               onClick={() => handleRunStage(activeStage)} 
               disabled={loading || (activeStage === 'MODULE' && !isGlobalDone)}
               variant={currentNode?.node_state === 'PAUSED_HITL' ? 'ghost' : 'primary'}
             >
               {loading ? <Spinner size="sm" /> : <span className="material-symbols-outlined">{currentNode?.node_state === 'PAUSED_HITL' ? 'refresh' : 'play_arrow'}</span>}
               {currentNode?.node_state === 'PAUSED_HITL' ? '다시 생성' : '생성 시작'}
             </Button>
           )}
           
           {currentNode?.node_state === 'PAUSED_HITL' && currentSelectedIterId !== 'OFFICIAL' && (
             <Button onClick={() => handleConfirmIteration(activeStage)} disabled={loading} variant="secondary">
               <span className="material-symbols-outlined">check_circle</span>
               현재 Draft 확정
             </Button>
           )}

           {activeStage === 'MODULE' && isModuleDone && (
              <Button onClick={handleCreateModules} disabled={loading} variant="primary">
                <span className="material-symbols-outlined">rocket_launch</span>
                설계 최종 승인 및 모듈 생성
              </Button>
           )}
        </div>
      </div>

      {error && (
        <div className="sad-overview__error">
          <span className="material-symbols-outlined">error</span>
          {error}
        </div>
      )}

      <div className="sad-overview__workspace">
        <aside className="iteration-sidebar">
          <div className="sidebar-header">
            <span className="material-symbols-outlined">history</span>
            <h4>Revisions</h4>
          </div>
          <div className="iteration-list">
            <button
              className={`iteration-item ${currentSelectedIterId === 'OFFICIAL' ? 'active' : ''}`}
              onClick={() => activeStage === 'GLOBAL' ? setSelectedGlobalIterId('OFFICIAL') : setSelectedModuleIterId('OFFICIAL')}
            >
              <div className="iter-info">
                <span className="iter-num">OFFICIAL</span>
                <span className="iter-meta">확정된 결과물</span>
              </div>
            </button>
            {currentIters.map((it) => (
              <button
                key={it.iteration_id}
                className={`iteration-item ${currentSelectedIterId === it.iteration_id ? 'active' : ''}`}
                onClick={() => activeStage === 'GLOBAL' ? setSelectedGlobalIterId(it.iteration_id) : setSelectedModuleIterId(it.iteration_id)}
              >
                <div className="iter-info">
                  <span className="iter-num">Draft #{it.iteration_number}</span>
                  <span className="iter-meta">{it.calculated_score}점 | {new Date(it.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                {it.is_pass && <span className="material-symbols-outlined pass-icon">verified</span>}
              </button>
            ))}
          </div>
        </aside>

        <section className="document-preview">
          <AnimatePresence mode="wait">
            {activeIteration && (
              <motion.div 
                key={activeIteration.iteration_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="feedback-box"
              >
                {activeIteration.actionable_feedback_text && (
                   <div className="feedback-item feedback-item--info">
                     <span className="material-symbols-outlined">lightbulb</span>
                     <div>
                       <strong>AI Recommendation</strong>
                       <p>{activeIteration.actionable_feedback_text}</p>
                     </div>
                   </div>
                )}
                {activeIteration.critical_errors_array && (
                   <div className="feedback-item feedback-item--error">
                     <span className="material-symbols-outlined">warning</span>
                     <div>
                       <strong>Need Improvement</strong>
                       <p>{(() => {
                         try {
                           const parsed = JSON.parse(activeIteration.critical_errors_array);
                           return Array.isArray(parsed) ? parsed.join(', ') : activeIteration.critical_errors_array;
                         } catch { return activeIteration.critical_errors_array; }
                       })()}</p>
                     </div>
                   </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="sad-overview__grid">
            {displayContexts.length > 0 ? displayContexts.map((ctx, idx) => (
              <motion.div
                key={ctx.context_id}
                className={`sad-card ${expandedCtx === ctx.context_id ? 'expanded' : ''} ${ctx.is_draft ? 'is-draft' : ''}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => setExpandedCtx(expandedCtx === ctx.context_id ? null : ctx.context_id)}
              >
                <div className="sad-card__header">
                  <span className="material-symbols-outlined sad-card__icon">{getCtxIcon(ctx.context_type)}</span>
                  <div className="sad-card__title-group">
                    <span className="sad-card__name">{CONTEXT_TYPE_LABELS[ctx.context_type] || ctx.context_type}</span>
                    {ctx.is_draft && <span className="draft-badge">DRAFT</span>}
                  </div>
                  <span className="material-symbols-outlined sad-card__chevron">
                    {expandedCtx === ctx.context_id ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
                {expandedCtx === ctx.context_id && (
                  <motion.pre
                    className="sad-card__content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                  >
                    {(() => {
                      try { return JSON.stringify(JSON.parse(ctx.context_data_json), null, 2); } catch { return ctx.context_data_json; }
                    })()}
                  </motion.pre>
                )}
              </motion.div>
            )) : (
              <div className="empty-grid-notice">
                <span className="material-symbols-outlined">architecture</span>
                <p>아직 생성된 문서가 없습니다. 생성을 시작하세요.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default SadOverview;

