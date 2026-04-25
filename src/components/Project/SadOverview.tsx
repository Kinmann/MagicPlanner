import React, { useState, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';

import { GenerationIteration, GlobalContext, CONTEXT_TYPE_LABELS } from '../../types/project';
import Button from '../common/Button';
import SadSpecRenderer from './SadSpecRenderer';
import { useProjectStore } from '../../store/projectStore';
import './SadOverview.scss';

const CONTEXT_ICONS: Record<string, string> = {
  sad_non_tech: 'description',
  sad_tech_stack: 'terminal',
  sad_core_erd: 'database',
  sad_auth_rbac: 'security',
  sad_interface_error: 'api',
  sad_module_list: 'view_module',
  sad_epic_mapping: 'map',
  sad_module_deps: 'account_tree',
};

interface SadOverviewProps {
  isLocked?: boolean;
}

const SadOverview: React.FC<SadOverviewProps> = ({ isLocked = false }) => {
  const { 
    currentProject, nodes, 
    runSadPipeline, stopNode, resumeNode,
    approveSadNode, confirmSadIteration, unconfirmIteration,
    deleteIteration, updateMaxIterations, createLocalModules
  } = useProjectStore(useShallow(state => ({
    currentProject: state.currentProject,
    nodes: state.nodes,
    runSadPipeline: state.runSadPipeline,
    stopNode: state.stopNode,
    resumeNode: state.resumeNode,
    approveSadNode: state.approveSadNode,
    confirmSadIteration: state.confirmSadIteration,
    unconfirmIteration: state.unconfirmIteration,
    deleteIteration: state.deleteIteration,
    updateMaxIterations: state.updateMaxIterations,
    createLocalModules: state.createLocalModules
  })));

  const globalNode = useMemo(() => nodes.find(n => n.target_node_type === 'SAD_Global') || null, [nodes]);
  const moduleNode = useMemo(() => nodes.find(n => n.target_node_type === 'SAD_Module') || null, [nodes]);

  const [activeStage, setActiveStage] = useState<'GLOBAL' | 'MODULE'>('GLOBAL');
  const [contexts, setContexts] = useState<GlobalContext[]>([]);
  const [globalIters, setGlobalIters] = useState<GenerationIteration[]>([]);
  const [moduleIters, setModuleIters] = useState<GenerationIteration[]>([]);
  const [selectedGlobalIterId, setSelectedGlobalIterId] = useState<string | null>(null);
  const [selectedModuleIterId, setSelectedModuleIterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [targetCount, setTargetCount] = useState(8);
  const [tempMax, setTempMax] = useState(10);
  const [viewMode, setViewMode] = useState<'STEP' | 'INTEGRATED' | 'RAW'>('STEP');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isAiGuidanceOpen, setIsAiGuidanceOpen] = useState(false);

  const currentNode = activeStage === 'GLOBAL' ? globalNode : moduleNode;
  const currentIters = activeStage === 'GLOBAL' ? globalIters : moduleIters;
  const currentSelectedIterId = activeStage === 'GLOBAL' ? selectedGlobalIterId : selectedModuleIterId;

  const currentIterIdx = useMemo(() => {
    return currentIters.findIndex(it => it.iteration_id === currentSelectedIterId);
  }, [currentIters, currentSelectedIterId]);

  const filteredContexts = useMemo(() => {
    return contexts.filter(c => c.iteration_id === currentSelectedIterId);
  }, [contexts, currentSelectedIterId]);

  // [FIX] 만약 filteredContexts가 비어있다면(백엔드 동기화 지연 등), iteration draft JSON에서 직접 추출
  const derivedContexts = useMemo(() => {
    if (filteredContexts.length > 0) return filteredContexts;
    
    const currentDraft = currentIters[currentIterIdx]?.generated_draft_json;
    if (!currentDraft) return [];
    
    try {
      const json = typeof currentDraft === 'string' ? JSON.parse(currentDraft) : currentDraft;
      const dataObj = json.contexts || json;
      
      return Object.entries(dataObj)
        .filter(([type]) => CONTEXT_TYPE_LABELS[type] || type.startsWith('sad_'))
        .map(([type, data]) => ({
          context_id: `derived-${type}`,
          project_id: currentProject?.project_id || '',
          iteration_id: currentSelectedIterId || '',
          context_type: type,
          context_data_json: typeof data === 'string' ? data : JSON.stringify(data),
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })) as GlobalContext[];
    } catch (e) {
      console.error("Failed to derive contexts from draft:", e);
      return [];
    }
  }, [filteredContexts, currentIters, currentIterIdx, currentProject, currentSelectedIterId]);

  // 자동 카테고리 설정
  useEffect(() => {
    // activeCategory가 없거나, 현재 derivedContexts에 없는 카테고리인 경우 첫 번째 항목으로 설정
    const currentTypes = derivedContexts.map(c => c.context_type);
    if (derivedContexts.length > 0 && (!activeCategory || !currentTypes.includes(activeCategory))) {
      setActiveCategory(derivedContexts[0].context_type);
    }
  }, [filteredContexts, activeCategory, derivedContexts]);

  // Data Sync
  const syncData = async (force = false) => {
    if (!currentProject) return;
    try {
      const ctxs = await invoke<GlobalContext[]>('get_global_contexts', { projectId: currentProject.project_id });
      setContexts(ctxs);
      
      if (globalNode) {
        const giters = await invoke<GenerationIteration[]>('get_node_iterations', { nodeId: globalNode.node_id });
        const sortedG = [...giters].sort((a, b) => a.iteration_number - b.iteration_number);
        setGlobalIters(sortedG);
        if (sortedG.length > 0 && (!selectedGlobalIterId || force)) {
          const passIt = sortedG.find(it => it.is_pass);
          setSelectedGlobalIterId((passIt || sortedG[sortedG.length - 1]).iteration_id);
        }
      }
      
      if (moduleNode) {
        const miters = await invoke<GenerationIteration[]>('get_node_iterations', { nodeId: moduleNode.node_id });
        const sortedM = [...miters].sort((a, b) => a.iteration_number - b.iteration_number);
        setModuleIters(sortedM);
        if (sortedM.length > 0 && (!selectedModuleIterId || force)) {
          const passIt = sortedM.find(it => it.is_pass);
          setSelectedModuleIterId((passIt || sortedM[sortedM.length - 1]).iteration_id);
        }
      }
    } catch(e) { console.error(e); }
  };

  useEffect(() => { syncData(); }, [nodes, activeStage]);

  useEffect(() => {
    if (currentNode) setTempMax(currentNode.max_iterations);
  }, [currentNode?.node_id, currentNode?.max_iterations]);


  // Handlers
  const handleRun = async () => {
    setLoading(true);
    if (currentNode && tempMax !== currentNode.max_iterations) {
      await updateMaxIterations(currentNode.node_id, tempMax);
    }
    await runSadPipeline(activeStage, targetCount);
    setLoading(false);
  };

  const handleApproveStage = async () => {
    if (!currentNode) return;
    setLoading(true);
    await approveSadNode(currentNode.node_id);
    if (activeStage === 'GLOBAL') setActiveStage('MODULE');
    setLoading(false);
  };

  const handleConfirmIteration = async (iterId: string) => {
    const it = currentIters.find(i => i.iteration_id === iterId);
    if (!it) return;
    setLoading(true);
    if (it.is_pass) {
      await unconfirmIteration(it.iteration_id);
    } else {
      await confirmSadIteration(it.iteration_id);
    }
    await syncData(true);
    setLoading(false);
  };

  const handleDeleteIteration = async (iterId: string) => {
    const confirmed = await ask('이 이터레이션을 삭제하시겠습니까?', { 
      title: 'Magic Planner',
      kind: 'warning',
    });
    if (!confirmed) return;
    
    setLoading(true);
    await deleteIteration(iterId);
    await syncData(true);
    setLoading(false);
  };

  const handleFinalize = async () => {
    setLoading(true);
    const moduleListCtx = contexts.find(c => c.context_type === 'sad_module_list' && c.iteration_id);
    if (moduleListCtx) {
      const parsed = JSON.parse(moduleListCtx.context_data_json);
      const modulesData = (parsed.modules || []).map((m: any, idx: number) => ({
        name: m.module_name,
        description: m.description,
        responsibility: m.core_responsibility,
        priority_order: m.priority_order ?? idx,
      }));
      await createLocalModules(JSON.stringify(modulesData));
    }
    setLoading(false);
  };

  const isStage1Locked = isLocked || Boolean(moduleNode && moduleNode.node_state !== 'READY' && moduleNode.node_state !== 'PENDING');
  const isCurrentLocked = activeStage === 'GLOBAL' ? isStage1Locked : isLocked;

  return (
    <div className="sad-overview">
      <div className="sad-overview__header-row">
        <div className="header-info">
          <h1>Software Architecture</h1>
          <p className="description">
            {activeStage === 'GLOBAL' 
              ? '시스템의 전반적인 Tech Stack, Auth & RBAC, DB Schema 등 글로벌 컨텍스트를 설계합니다.' 
              : '시스템의 기능적 모듈 분할과 각 모듈의 핵심 책임 및 상호작용 구조를 설계합니다.'}
          </p>
          <div className="header-controls">
            <div className="iteration-field">
              <span className="label">ITERATION</span>
              <div className="iteration-control-group">
                <span className="current-count">{currentNode?.current_iteration || 0}</span>
                <span className="separator">/</span>
                <input 
                  type="number" 
                  value={tempMax} 
                  onChange={(e) => setTempMax(parseInt(e.target.value) || 1)} 
                  onBlur={() => currentNode && !isCurrentLocked && updateMaxIterations(currentNode.node_id, tempMax)} 
                  disabled={loading || isCurrentLocked || currentNode?.node_state === 'COMPLETED'} 
                />
              </div>
            </div>
            {activeStage === 'MODULE' && (
              <div className="iteration-field">
                <span className="label">TARGET MODULES</span>
                <div className="iteration-control-group">
                  <input type="number" value={targetCount} onChange={(e) => setTargetCount(parseInt(e.target.value))} disabled={isCurrentLocked} />
                </div>
              </div>
            )}
            <div className="button-group">
              {currentNode?.node_state === 'IN_PROGRESS' ? (
                <Button onClick={() => stopNode(currentNode.node_id)} variant="danger" leftIcon={<span className="material-symbols-outlined">stop</span>}>중단</Button>
              ) : (
                <Button onClick={handleRun} disabled={loading || isCurrentLocked} variant={currentNode?.node_state === 'COMPLETED' ? "secondary" : "primary"} isLoading={loading} leftIcon={<span className="material-symbols-outlined">auto_fix</span>}>{currentNode?.node_state === 'COMPLETED' ? 'Regenerate' : '생성 시작'}</Button>
              )}
              {currentNode?.node_state === 'PAUSED_STOPPED' && (
                <Button onClick={() => resumeNode(currentNode.node_id)} variant="primary" leftIcon={<span className="material-symbols-outlined">restore</span>}>재개</Button>
              )}
              {currentIters.some(it => it.is_pass) && currentNode?.node_state !== 'COMPLETED' && !isCurrentLocked && (
                <Button onClick={handleApproveStage} variant="primary" className="proceed-btn" leftIcon={<span className="material-symbols-outlined">send</span>}>다음 스텝</Button>
              )}
              {activeStage === 'MODULE' && (moduleNode?.node_state === 'COMPLETED') && !isCurrentLocked && (
                <Button onClick={handleFinalize} variant="primary" className="proceed-btn" leftIcon={<span className="material-symbols-outlined">rocket_launch</span>}>설계 승인</Button>
              )}
            </div>
          </div>
        </div>
        <div className="header-right">
          <div className="stage-stepper">
            {[
              { id: 'GLOBAL', label: 'Stage 1: Global', node: globalNode },
              { id: 'MODULE', label: 'Stage 2: Module', node: moduleNode }
            ].map((s, i) => (
              <button 
                key={s.id} 
                className={`stage-step ${activeStage === s.id ? 'active' : ''} ${s.node?.node_state === 'COMPLETED' ? 'completed' : ''} ${(s.id === 'MODULE' && globalNode?.node_state !== 'COMPLETED') ? 'locked' : ''}`} 
                onClick={() => (s.id === 'GLOBAL' || globalNode?.node_state === 'COMPLETED') && setActiveStage(s.id as any)}
              >
                <div className="step-num">{s.node?.node_state === 'COMPLETED' ? <span className="material-symbols-outlined">check</span> : i + 1}</div>
                <div className="step-label">{s.label}</div>
                {s.node && <span className={`state-badge state-${s.node.node_state.toLowerCase()}`}>{s.node.node_state}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>


      {currentIters.length > 0 && (
        <div className="revisions-horizontal">
          <div className="revisions-header">
            <div className="left"><span className="material-symbols-outlined">history</span><span>Revisions</span></div>
            <div className="right">
              <button 
                className="ai-guidance-trigger" 
                onClick={() => setIsAiGuidanceOpen(true)}
                title="AI Intelligence Feedback"
              >
                <span className="material-symbols-outlined">auto_awesome</span>
              </button>
              <div className="view-mode-selector">
                <button 
                  className={`mode-btn ${viewMode === 'STEP' ? 'active' : ''}`}
                  onClick={() => setViewMode('STEP')}
                >
                  카테고리별
                </button>
                <button 
                  className={`mode-btn integrated-btn ${viewMode === 'INTEGRATED' ? 'active' : ''}`}
                  onClick={() => setViewMode('INTEGRATED')}
                >
                  <span className="material-symbols-outlined">layers</span>
                </button>
                <button 
                  className={`mode-btn ${viewMode === 'RAW' ? 'active' : ''}`}
                  onClick={() => setViewMode('RAW')}
                >
                  RAW SPEC
                </button>
              </div>
            </div>
          </div>
          <div className="revisions-list custom-scrollbar">
            {currentIters.map((it) => (
              <div key={it.iteration_id} className={`revision-btn ${currentSelectedIterId === it.iteration_id ? 'active' : ''} ${it.is_pass ? 'confirmed' : ''}`} onClick={() => (activeStage === 'GLOBAL' ? setSelectedGlobalIterId(it.iteration_id) : setSelectedModuleIterId(it.iteration_id))}>
                <span className="iter-num">Draft #{it.iteration_number}</span>
                {it.is_pass && <span className="material-symbols-outlined selected-icon">check_circle</span>}
                <span className="iter-meta">{it.calculated_score}</span>
              </div>
            ))}
          </div>
          {currentIters[currentIterIdx] && !isCurrentLocked && (
            <div className="revisions-action">
              <Button 
                onClick={() => currentSelectedIterId && handleConfirmIteration(currentSelectedIterId)} 
                variant={currentIters[currentIterIdx].is_pass ? "ghost" : "secondary"} 
                leftIcon={<span className="material-symbols-outlined">{currentIters[currentIterIdx].is_pass ? 'undo' : 'check_circle'}</span>}
              >
                {currentIters[currentIterIdx].is_pass ? '확정 취소' : 'Draft 확정'}
              </Button>
              <Button 
                onClick={(e) => { e.stopPropagation(); currentSelectedIterId && handleDeleteIteration(currentSelectedIterId); }} 
                variant="ghost" 
                className="delete-btn"
                leftIcon={<span className="material-symbols-outlined">delete</span>}
              >
                삭제
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="sad-content-container">
        {viewMode === 'RAW' ? (
          <div className="sad-raw-spec custom-scrollbar">
            <pre><code>{currentIters[currentIterIdx]?.generated_draft_json ? JSON.stringify(JSON.parse(currentIters[currentIterIdx].generated_draft_json), null, 2) : 'No data'}</code></pre>
          </div>
        ) : viewMode === 'INTEGRATED' ? (
          <div className="sad-integrated-view custom-scrollbar">
            <div className="integrated-view-header">
              <div className="header-badge">ARCHITECTURAL SPEC</div>
              <h2>Full System Specification</h2>
              <p>전체 시스템 아키텍처 설계 내용을 통합된 문서 형태로 검토합니다.</p>
            </div>
            <div className="visual-view">
              <div className="sad-overview-grid">
                {derivedContexts.map(ctx => (
                  <div key={ctx.context_id} className="context-card">
                    <div className="spec-card-top">
                      <span className="group-label">Architecture Definition</span>
                      <span className="file-name">{ctx.context_type?.toUpperCase()}.JSON</span>
                    </div>
                    <div className="spec-card-inner">
                      <div className="card-header">
                        <div className="title-group">
                          <span className="material-symbols-outlined icon">
                            {CONTEXT_ICONS[ctx.context_type] || 'article'}
                          </span>
                          <span className="name">{CONTEXT_TYPE_LABELS[ctx.context_type] || ctx.context_type} Specification</span>
                        </div>
                      </div>
                      <div className="card-content-wrapper custom-scrollbar">
                        <SadSpecRenderer type={ctx.context_type} data={ctx.context_data_json} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="sad-category-view">
            <div className="category-sidebar custom-scrollbar">
              {derivedContexts.map(ctx => (
                <button 
                  key={ctx.context_id} 
                  className={`category-btn ${activeCategory === ctx.context_type ? 'active' : ''}`}
                  onClick={() => setActiveCategory(ctx.context_type)}
                >
                  <span className="material-symbols-outlined icon">
                    {CONTEXT_ICONS[ctx.context_type] || 'article'}
                  </span>
                  <span className="name">{CONTEXT_TYPE_LABELS[ctx.context_type] || ctx.context_type}</span>
                </button>
              ))}
            </div>
            <div className="category-main-content custom-scrollbar">
              {activeCategory ? (
                <div className="active-category-card">
                  <div className="card-header">
                    <h3>{CONTEXT_TYPE_LABELS[activeCategory] || activeCategory}</h3>
                  </div>
                  <div className="card-body">
                    {derivedContexts.find(c => c.context_type === activeCategory) && (
                      <SadSpecRenderer 
                        type={activeCategory} 
                        data={derivedContexts.find(c => c.context_type === activeCategory)?.context_data_json} 
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="empty-category-notice">
                  <span className="material-symbols-outlined">dashboard_customize</span>
                  <p>좌측 사이드바에서 검토할 설계를 선택하세요.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {isAiGuidanceOpen && currentIters[currentIterIdx] && (
        <div className="intelligence-feedback-overlay">
          <div className="feedback-card">
            <div className="feedback-header">
              <h3>Intelligence Feedback</h3>
              <button onClick={() => setIsAiGuidanceOpen(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="feedback-body">
              <div className="score-section">
                <span className="label">SCORE</span>
                <span className="value">{currentIters[currentIterIdx].calculated_score}</span>
              </div>
              {currentIters[currentIterIdx].critical_errors_array && (
                <div className="feedback-group error">
                  <h4>Critical Errors</h4>
                  <ul>
                    {JSON.parse(currentIters[currentIterIdx].critical_errors_array).map((e: any, i: number) => (
                      <li key={i}>{e.description || e}</li>
                    ))}
                  </ul>
                </div>
              )}
              {currentIters[currentIterIdx].actionable_feedback_text && (
                <div className="feedback-group info">
                  <h4>Actionable Feedback</h4>
                  <ul>
                    {JSON.parse(currentIters[currentIterIdx].actionable_feedback_text).map((f: any, i: number) => (
                      <li key={i}>{f.description || f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SadOverview;

