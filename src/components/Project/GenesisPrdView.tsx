import React, { useState, useMemo, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ask } from '@tauri-apps/plugin-dialog';


import Button from '../common/Button';
import Spinner from '../common/Spinner';
import BaseModal from '../common/BaseModal';
import FeedbackRenderer from '../common/FeedbackRenderer';
import { useProjectStore } from '../../store/projectStore';
import { PrdBentoRenderer } from './GlobalRenderers';
import './GenesisPrdView.scss';

interface GenesisPrdViewProps {
  isLocked?: boolean;
}

const GenesisPrdView: React.FC<GenesisPrdViewProps> = ({ 
  isLocked = false 
}) => {
  // Store Subscriptions
  const { 
    allNodes, currentProject, 
    runNode, stopNode, resumeNode, 
    approveGenesisNode, approveGenesisPrd, confirmGenesisIteration, unconfirmIteration,
    deleteIteration, updateMaxIterations
  } = useProjectStore(useShallow(state => ({
    allNodes: state.nodes, // 원본 배열을 가져옴 (참조 안정성 확보)
    currentProject: state.currentProject,
    runNode: state.runNode,
    stopNode: state.stopNode,
    resumeNode: state.resumeNode,
    approveGenesisNode: state.approveGenesisNode,
    approveGenesisPrd: state.approveGenesisPrd,
    confirmGenesisIteration: state.confirmGenesisIteration,
    unconfirmIteration: state.unconfirmIteration,
    deleteIteration: state.deleteIteration,
    updateMaxIterations: state.updateMaxIterations
  })));

  // 필터링 로직을 useMemo로 이동 (allNodes가 변경될 때만 재계산)
  const nodes = useMemo(() => 
    allNodes.filter(n => n.target_node_type.startsWith('GPRD_')),
    [allNodes]
  );

  const [activeStage, setActiveStage] = useState<'GPRD_Context_Goal' | 'GPRD_Capability_Actor' | 'GPRD_Architecture_Schema'>('GPRD_Context_Goal');
  const [viewMode, setViewMode] = useState<'STEP' | 'INTEGRATED' | 'RAW'>('STEP');
  
  const node = useMemo(() => nodes.find(n => n.target_node_type === activeStage) || null, [nodes, activeStage]);

  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<any>(null);
  const [iterations, setIterations] = useState<any[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [tempMax, setTempMax] = useState(node?.max_iterations || 10);
  const [isAiGuidanceOpen, setIsAiGuidanceOpen] = useState(false);

  const allCompleted = nodes.length > 0 && nodes.every(n => n.node_state === 'COMPLETED');

  // Event Listeners
  useEffect(() => {
    const unlisten = listen<any>('pipeline-status', (event) => {
      const msg = event.payload;
      if (typeof msg === 'string') {
        if (msg.includes('임베딩 중')) setStatusMsg(msg);
        else if (msg.includes('임베딩 완료') || msg.includes('임베딩 실패')) setStatusMsg(null);
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // Auto-switch stage
  useEffect(() => {
    if (nodes.length > 0) {
      const current = nodes.find(n => ['READY', 'IN_PROGRESS', 'PAUSED_HITL', 'PAUSED_API_ERROR'].includes(n.node_state));
      if (current) setActiveStage(current.target_node_type as any);
      else if (allCompleted && viewMode === 'STEP') setViewMode('INTEGRATED');
    }
  }, [nodes, allCompleted]);

  useEffect(() => {
    if (node) setTempMax(node.max_iterations);
  }, [node?.node_id, node?.max_iterations]);

  // Content Loader
  const loadContent = async (force = false) => {
    if (!node) return;
    try {
      const iters = await invoke<any[]>('get_node_iterations', { projectId: currentProject?.project_id, nodeId: node.node_id });
      if (iters && iters.length > 0) {
        const sorted = [...iters].sort((a, b) => a.iteration_number - b.iteration_number);
        setIterations(sorted);
        let targetIdx = selectedIdx;
        if (force || selectedIdx < 0 || selectedIdx >= sorted.length) {
          const passIdx = sorted.findIndex((it: any) => it.is_pass);
          targetIdx = passIdx >= 0 ? passIdx : sorted.length - 1;
        }
        setSelectedIdx(targetIdx);
        const raw = sorted[targetIdx].content_json || sorted[targetIdx].generated_draft_json;
        setContent(normalizeKeys(typeof raw === 'string' ? JSON.parse(raw) : raw));
      } else {
        setIterations([]);
        setSelectedIdx(-1);
        setContent(null);
      }
    } catch (e) { console.error(e); }
  };

  const [integratedData, setIntegratedData] = useState<any[]>([]);

  const fetchBestIterationContent = async (nodeType: string) => {
    const targetNode = nodes.find(n => n.target_node_type === nodeType);
    if (!targetNode) return null;
    
    try {
      // 1. Try to get the latest/best iteration directly
      const it = await invoke<any | null>('get_latest_iteration', { nodeId: targetNode.node_id });
      if (it) {
        const raw = it.content_json || it.generated_draft_json;
        if (raw) {
          return normalizeKeys(typeof raw === 'string' ? JSON.parse(raw) : raw);
        }
      }
      
      // 2. Fallback to get_node_iterations if latest is not found or fails
      const iters = await invoke<any[]>('get_node_iterations', { nodeId: targetNode.node_id });
      if (iters && iters.length > 0) {
        const sorted = [...iters].sort((a, b) => b.iteration_number - a.iteration_number);
        const passIt = sorted.find(it => it.is_pass) || sorted[0];
        const raw = passIt.content_json || passIt.generated_draft_json;
        return normalizeKeys(typeof raw === 'string' ? JSON.parse(raw) : raw);
      }
    } catch (e) { 
      console.error(`Error fetching content for ${nodeType}:`, e); 
    }
    return null;
  };

  useEffect(() => {
    if (viewMode === 'INTEGRATED') {
       const fetchAllStages = async () => {
         try {
           const [s1, s2, s3] = await Promise.all([
             fetchBestIterationContent('GPRD_Context_Goal'),
             fetchBestIterationContent('GPRD_Capability_Actor'),
             fetchBestIterationContent('GPRD_Architecture_Schema')
           ]);
           
           // 스테이지 정보를 포함하여 데이터 구성
           const data = [
             { stage: 1, content: s1 },
             { stage: 2, content: s2 },
             { stage: 3, content: s3 }
           ].filter(item => item.content !== null && Object.keys(item.content).length > 0);
           
           setIntegratedData(data);
         } catch(e) { 
           console.error('Failed to fetch all stages for integrated view:', e); 
         }
       };
       fetchAllStages();
    } 
    
    if (viewMode === 'STEP' || viewMode === 'RAW') {
      loadContent();
    }
  }, [viewMode, activeStage, nodes, node?.node_id]);



  // Handlers
  const handleRun = async () => {
    setLoading(true);
    if (node && tempMax !== node.max_iterations) {
      await updateMaxIterations(node.node_id, tempMax);
    }
    await runNode(activeStage);
    setLoading(false);
  };

  const handleApproveStage = async () => {
    if (!node) return;
    setLoading(true);
    await approveGenesisNode(node.node_id);
    setLoading(false);
  };

  const handleProceedToSad = async () => {
    setLoading(true);
    await approveGenesisPrd();
    setLoading(false);
  };

  const handleConfirmIteration = async (idx: number) => {
    const it = iterations[idx];
    if (!it) return;
    setLoading(true);
    if (it.is_pass) {
      await unconfirmIteration(it.iteration_id);
    } else {
      await confirmGenesisIteration(it.iteration_id);
    }
    await loadContent(true);
    setLoading(false);
  };

  const handleDeleteIteration = async (idx: number) => {
    const it = iterations[idx];
    if (!it) return;
    
    const confirmed = await ask('이 이터레이션을 삭제하시겠습니까?', { 
      title: 'Magic Planner',
      kind: 'warning',
    });
    
    if (!confirmed) return;
    
    setLoading(true);
    await deleteIteration(it.iteration_id);
    await loadContent(true);
    setLoading(false);
  };

  const normalizeKeys = (obj: any): any => {
    if (Array.isArray(obj)) return obj.map(normalizeKeys);
    if (obj !== null && typeof obj === 'object') {
      return Object.keys(obj).reduce((acc: any, key) => {
        const snakeKey = key.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`).replace(/^_/, '');
        acc[snakeKey] = normalizeKeys(obj[key]);
        return acc;
      }, {});
    }
    return obj;
  };

  const isCurrentStageLocked = isLocked || (
    activeStage === 'GPRD_Context_Goal' ? (nodes.find(n => n.target_node_type === 'GPRD_Capability_Actor')?.node_state !== 'READY' && nodes.find(n => n.target_node_type === 'GPRD_Capability_Actor')?.node_state !== 'PENDING') :
    activeStage === 'GPRD_Capability_Actor' ? (nodes.find(n => n.target_node_type === 'GPRD_Architecture_Schema')?.node_state !== 'READY' && nodes.find(n => n.target_node_type === 'GPRD_Architecture_Schema')?.node_state !== 'PENDING') :
    false
  );

  return (
    <div className="genesis-prd-view">
      <div className="genesis-prd-view__header-row">
        <div className="header-info">
          <h1>Genesis PRD</h1>
          <p className="description">프로젝트의 근간이 되는 비즈니스 목표와 설계 구조를 정의합니다.</p>
          <div className="header-controls">
            <div className="iteration-field">
              <span className="label">ITERATION</span>
              <div className="iteration-control-group">
                <span className="current-count">{node?.current_iteration || 0}</span>
                <span className="separator">/</span>
                <input type="number" value={tempMax} onChange={(e) => setTempMax(parseInt(e.target.value) || 1)} onBlur={() => node && !isCurrentStageLocked && updateMaxIterations(node.node_id, tempMax)} disabled={loading || isCurrentStageLocked || node?.node_state === 'COMPLETED'} />
              </div>
            </div>
            <div className="button-group">
              {node?.node_state === 'IN_PROGRESS' ? (
                <Button onClick={() => stopNode(node.node_id)} variant="danger" leftIcon={<span className="material-symbols-outlined">stop</span>}>중단</Button>
              ) : (
                <Button onClick={handleRun} disabled={loading || isCurrentStageLocked} variant={node?.node_state === 'COMPLETED' ? "secondary" : "primary"} isLoading={loading} leftIcon={<span className="material-symbols-outlined">auto_fix</span>}>{node?.node_state === 'COMPLETED' ? 'Regenerate' : '생성 시작'}</Button>
              )}
              {node?.node_state === 'PAUSED_STOPPED' && (
                <Button onClick={() => resumeNode(node.node_id)} variant="primary" leftIcon={<span className="material-symbols-outlined">restore</span>}>재개</Button>
              )}
              {iterations.some(it => it.is_pass) && node?.node_state !== 'COMPLETED' && !isCurrentStageLocked && (
                <Button onClick={handleApproveStage} variant="primary" className="proceed-btn" leftIcon={<span className="material-symbols-outlined">send</span>}>다음 스텝</Button>
              )}
              {activeStage === 'GPRD_Architecture_Schema' && node?.node_state === 'COMPLETED' && (
                <Button onClick={handleProceedToSad} variant="primary" className="proceed-btn" rightIcon={<span className="material-symbols-outlined">arrow_forward</span>}>Proceed to SAD</Button>
              )}
            </div>
          </div>
        </div>
        <div className="header-right">
          <div className="stage-stepper">
            {['GPRD_Context_Goal', 'GPRD_Capability_Actor', 'GPRD_Architecture_Schema'].map((type, i) => {
              const sNode = nodes.find(n => n.target_node_type === type);
              return (
                <button key={type} className={`stage-step ${activeStage === type ? 'active' : ''} ${sNode?.node_state === 'COMPLETED' ? 'completed' : ''}`} onClick={() => setActiveStage(type as any)}>
                  <div className="step-num">{sNode?.node_state === 'COMPLETED' ? <span className="material-symbols-outlined">check</span> : i + 1}</div>
                  <div className="step-label">Stage {i+1}: {type.replace('GPRD_', '').replace('_', ' & ')}</div>
                  {sNode && <span className={`state-badge state-${sNode.node_state.toLowerCase()}`}>{sNode.node_state}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className="genesis-prd-view__status-msg">
          <Spinner size="sm" />
          <span>{statusMsg}</span>
        </div>
      )}

      {iterations.length > 0 && (
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
                  단계별 보기
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
            {iterations.map((it, idx) => (
              <div key={it.iteration_id} className={`revision-btn ${selectedIdx === idx ? 'active' : ''} ${it.is_pass ? 'confirmed' : ''}`} onClick={() => viewMode === 'STEP' && setSelectedIdx(idx)}>
                <span className="iter-num">Draft #{it.iteration_number}</span>
                {it.is_pass && <span className="material-symbols-outlined selected-icon">check_circle</span>}
                <span className="iter-meta">{it.calculated_score}</span>
              </div>
            ))}
          </div>
          {viewMode === 'STEP' && iterations[selectedIdx] && !isCurrentStageLocked && (
            <div className="revisions-action">
              <Button 
                onClick={() => handleConfirmIteration(selectedIdx)} 
                variant={iterations[selectedIdx].is_pass ? "ghost" : "secondary"} 
                leftIcon={<span className="material-symbols-outlined">{iterations[selectedIdx].is_pass ? 'undo' : 'check_circle'}</span>}
              >
                {iterations[selectedIdx].is_pass ? '확정 취소' : 'Draft 확정'}
              </Button>
              <Button 
                onClick={(e) => { e.stopPropagation(); handleDeleteIteration(selectedIdx); }} 
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

      {((viewMode !== 'INTEGRATED' && content) || (viewMode === 'INTEGRATED' && integratedData.length > 0)) && (
        <div className="bento-render-container">
          {viewMode === 'RAW' ? (
            <pre className="raw-json-view custom-scrollbar">
              {JSON.stringify(content, null, 2)}
            </pre>
          ) : (
            <div className="visual-view-wrapper custom-scrollbar">
               {viewMode === 'INTEGRATED' ? (
                 <div className="integrated-stack">
                   <div className="integrated-view-header">
                     <div className="header-badge">UNIFIED PRD</div>
                     <h2>Full Project Specification</h2>
                     <p>Stage 1부터 3까지의 모든 설계 내용이 통합된 문서입니다.</p>
                   </div>
                   {integratedData.map((item, idx) => (
                     <div key={idx} className="integrated-stage-row">
                       <PrdBentoRenderer 
                         content={item.content} 
                         isIntegrated={true} 
                         stage={item.stage} 
                       />
                     </div>
                   ))}
                 </div>
               ) : (
                 <PrdBentoRenderer content={content} isIntegrated={false} />
               )}
            </div>
          )}
        </div>
      )}

      <BaseModal 
        isOpen={isAiGuidanceOpen} 
        onClose={() => setIsAiGuidanceOpen(false)} 
        title="AI Intelligence Feedback"
        subtitle={iterations[selectedIdx] ? `Draft #${iterations[selectedIdx].iteration_number} - Score: ${iterations[selectedIdx].calculated_score}` : ""}
        size="md"
      >
        <div className="intelligence-feedback">
          {iterations[selectedIdx]?.critical_errors_array && (
            <div className="feedback-card error">
              <div className="card-header">
                <span className="material-symbols-outlined">error</span>
                <h4>Critical Issues</h4>
              </div>
              <div className="card-content">
                <FeedbackRenderer 
                  feedback={iterations[selectedIdx].critical_errors_array} 
                  type="error" 
                />
              </div>
            </div>
          )}
          {iterations[selectedIdx]?.actionable_feedback_text && (
            <div className="feedback-card info">
              <div className="card-header">
                <span className="material-symbols-outlined">tips_and_updates</span>
                <h4>Optimization Guidance</h4>
              </div>
              <div className="card-content">
                <FeedbackRenderer 
                  feedback={iterations[selectedIdx].actionable_feedback_text} 
                  type="info" 
                />
              </div>
            </div>
          )}
          {!iterations[selectedIdx]?.critical_errors_array && !iterations[selectedIdx]?.actionable_feedback_text && (
            <div className="feedback-card success">
              <div className="card-header">
                <span className="material-symbols-outlined">check_circle</span>
                <h4>All Good</h4>
              </div>
              <div className="card-content">
                <p>이 리비전에 특별한 결함이나 개선 제안이 없습니다.</p>
              </div>
            </div>
          )}
        </div>
      </BaseModal>
    </div>
  );
};

export default GenesisPrdView;
