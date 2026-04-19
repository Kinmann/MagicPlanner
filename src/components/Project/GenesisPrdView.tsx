import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { Store } from '@tauri-apps/plugin-store';
import { ask } from '@tauri-apps/plugin-dialog';
import { DocumentNode } from '../../types/project';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import BaseModal from '../common/BaseModal';
import FeedbackRenderer from '../common/FeedbackRenderer';
import './GenesisPrdView.scss';

interface GenesisPrdViewProps {
  projectId: string;
  nodes: DocumentNode[];
  onApprove: () => void;
  onRefresh: () => void;
  onUpdateMaxIterations: (nodeId: string, maxIterations: number) => void;
  isLocked?: boolean;
}

const GenesisPrdView: React.FC<GenesisPrdViewProps> = ({ 
  projectId, 
  nodes, 
  onApprove, 
  onRefresh, 
  onUpdateMaxIterations, 
  isLocked: isLockedProps = false 
}) => {
  const [activeStage, setActiveStage] = useState<'GPRD_Context_Goal' | 'GPRD_Capability_Actor' | 'GPRD_Architecture_Schema'>('GPRD_Context_Goal');
  const [showIntegrated, setShowIntegrated] = useState(false);
  
  const node = React.useMemo(() => {
    return nodes.find(n => n.target_node_type === activeStage) || null;
  }, [nodes, activeStage]);

  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<any>(null);
  const [iterations, setIterations] = useState<any[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showRawView, setShowRawView] = useState(false);
  const [tempMax, setTempMax] = useState(node?.max_iterations || 10);
  const [selectedEpic, setSelectedEpic] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAiGuidanceOpen, setIsAiGuidanceOpen] = useState(false);

  // 모든 서브 노드가 완료되었는지 확인
  const allCompleted = nodes.length > 0 && nodes.every(n => n.node_state === 'COMPLETED');

  // 자동 스테이지 전환 로직 (초기 로드 시)
  React.useEffect(() => {
    if (nodes.length > 0) {
      const current = nodes.find(n => n.node_state === 'READY' || n.node_state === 'IN_PROGRESS' || n.node_state === 'PAUSED_HITL');
      if (current) {
        setActiveStage(current.target_node_type as any);
      } else if (allCompleted) {
        setActiveStage('GPRD_Architecture_Schema');
        setShowIntegrated(true);
      }
    }
  }, [nodes.length]);

  // node 정보가 외부에서 변경될 때 로컬 상태 동기화
  React.useEffect(() => {
    if (node) {
      setTempMax(node.max_iterations);
    }
  }, [node?.node_id, node?.max_iterations]);


  // 모든 키를 snake_case로 정규화하는 헬퍼 함수
  const normalizeKeys = (obj: any): any => {
    if (Array.isArray(obj)) {
      return obj.map(normalizeKeys);
    } else if (obj !== null && typeof obj === 'object') {
      return Object.keys(obj).reduce((acc: any, key) => {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '');
        acc[snakeKey] = normalizeKeys(obj[key]);
        return acc;
      }, {});
    }
    return obj;
  };

  const getTechIcon = (cat: string) => {
    const lower = cat.toLowerCase();
    if (lower.includes('ai_model')) return 'smart_toy';
    if (lower.includes('frontend')) return 'splitscreen';
    if (lower.includes('backend')) return 'dns';
    if (lower.includes('database')) return 'database';
    if (lower.includes('infrastructure')) return 'cloud_circle';
    if (lower.includes('ci_cd')) return 'cyclone';
    if (lower.includes('monitoring')) return 'query_stats';
    if (lower.includes('interface')) return 'api';
    return 'category';
  };

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    setStatusMsg('Genesis PRD 생성 중...');
    try {
      const store = await Store.load('settings.json');
      const apiKeyValue = await store.get<{ value: string }>('gemini_api_key');
      if (!apiKeyValue?.value) throw new Error('API 키가 설정되지 않았습니다.');

      // max_iterations가 변경된 경우 먼저 DB 업데이트 후 실행
      if (node && tempMax !== node.max_iterations) {
        onUpdateMaxIterations(node.node_id, tempMax);
        // DB 반영 대기 (짧은 딜레이)
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      await invoke<string>('run_pipeline', {
        projectId,
        nodeType: activeStage,
        apiKey: apiKeyValue.value,
      });
      setStatusMsg(null);
      await loadContent();
      onRefresh();
    } catch (err: any) {
      setError(err.toString());
      setStatusMsg(null);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!node) return;
    try {
      await invoke('stop_node_pipeline', { nodeId: node.node_id });
      setStatusMsg('중단 요청됨...');
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const handleResume = async () => {
    if (!node) return;
    try {
      await invoke('resume_node_pipeline', { nodeId: node.node_id });
      onRefresh();
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const handleApprove = async () => {
    setLoading(true);
    try {
      await invoke('approve_genesis_prd', { projectId });
      onApprove();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleApproveStage = async () => {
    if (!node) return;
    setLoading(true);
    try {
      await invoke('approve_genesis_prd_node', { nodeId: node.node_id });
      onRefresh();
      
      // 다음 단계로 자동 전환 시도 (READY 상태인 첫 번째 노드 찾기)
      // onRefresh()로 인해 부모 컴포넌트에서 nodes가 업데이트되면 useEffect가 처리할 것이므로 여기서는 onRefresh만 호출해도 무방함.
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmIteration = async (idx: number) => {
    const it = iterations[idx];
    if (!it) return;
    
    setLoading(true);
    try {
      await invoke('confirm_genesis_prd_iteration', { 
        projectId, 
        iterationId: it.iteration_id 
      });
      // 데이터 새로고침 후 confirmed 항목으로 포커스 이동
      const iters = await invoke<any[]>('get_node_iterations', { nodeId: node?.node_id });
      if (iters) {
        // iteration_number 오름차순 정렬
        const sorted = [...iters].sort((a, b) => a.iteration_number - b.iteration_number);
        setIterations(sorted);
        
        // is_pass=true인 항목을 먼저 찾고, 없으면 가장 최신(마지막 인덱스) 선택
        const passIdx = sorted.findIndex((i: any) => i.is_pass);
        const targetIdx = passIdx >= 0 ? passIdx : sorted.length - 1;
        
        setSelectedIdx(targetIdx);
        let rawData = sorted[targetIdx].generated_draft_json;
        if (typeof rawData === 'string') {
          try { rawData = JSON.parse(rawData); } catch {}
        }
        setContent(normalizeKeys(rawData));
      }
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleUnconfirmIteration = async (idx: number) => {
    const it = iterations[idx];
    if (!it || !projectId || loading || isCurrentStageLocked) return;
    
    setLoading(true);
    try {
      await invoke('unconfirm_iteration', { projectId, iterationId: it.iteration_id });
      await loadContent();
      onRefresh();
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteIteration = async (idx: number) => {
    const it = iterations[idx];
    if (!it) return;

    const confirmed = await ask(`Draft #${it.iteration_number} 리비전을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`, {
      title: '리비전 삭제',
      kind: 'warning'
    });

    if (!confirmed) return;

    setLoading(true);
    try {
      await invoke('delete_generation_iteration', { iterationId: it.iteration_id });
      await loadContent();
      onRefresh();
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  const loadContent = async () => {
    if (!node) {
      setIterations([]);
      setSelectedIdx(-1);
      setContent(null);
      return;
    }
    
    try {
      const iters = await invoke<any[]>('get_node_iterations', { nodeId: node.node_id });
      if (iters && iters.length > 0) {
        // iteration_number 오름차순 정렬
        const sorted = [...iters].sort((a, b) => a.iteration_number - b.iteration_number);
        setIterations(sorted);

        // confirmed(is_pass=true) 항목이 있으면 그것을 선택, 없으면 가장 최신(마지막 인덱스) 선택
        const passIdx = sorted.findIndex((it: any) => it.is_pass);
        const targetIdx = passIdx >= 0 ? passIdx : sorted.length - 1;

        setSelectedIdx(targetIdx);
        let rawData = sorted[targetIdx].generated_draft_json;
        if (typeof rawData === 'string' && rawData.trim().startsWith('{')) {
          try { rawData = JSON.parse(rawData); } catch { rawData = {}; }
        } else if (typeof rawData === 'string') {
          rawData = {};
        }
        setContent(normalizeKeys(rawData || {}));
      } else {
        setIterations([]);
        setSelectedIdx(-1);
        setContent(null);
      }
    } catch (e) {
      console.error("Failed to load content:", e);
      setIterations([]);
      setSelectedIdx(-1);
      setContent(null);
    }
  };

  const selectIteration = (idx: number) => {
    setSelectedIdx(idx);
    const item = iterations[idx];
    if (item) {
      let rawData = item.generated_draft_json;
      if (typeof rawData === 'string') {
        try { rawData = JSON.parse(rawData); } catch {}
      }
      setContent(normalizeKeys(rawData));
    }
  };

  const renderJson = (obj: any) => {
    if (obj === null) return <span className="token-null">null</span>;
    if (typeof obj === 'string') return <span className="token-string">"{obj}"</span>;
    if (typeof obj === 'number') return <span className="token-number">{obj}</span>;
    if (typeof obj === 'boolean') return <span className="token-boolean">{obj.toString()}</span>;

    if (Array.isArray(obj)) {
      if (obj.length === 0) return <span>[]</span>;
      return (
        <div className="json-array">
          [
          {obj.map((item, i) => (
            <div key={i} style={{ paddingLeft: '1.5rem' }}>
              {renderJson(item)}
              {i < obj.length - 1 ? ',' : ''}
            </div>
          ))}
          ]
        </div>
      );
    }

    const keys = Object.keys(obj);
    if (keys.length === 0) return <span>{"{}"}</span>;
    return (
      <div className="json-object">
        {"{"}
        {keys.map((key, i) => (
          <div key={key} style={{ paddingLeft: '1.5rem' }}>
            <span className="token-key">"{key}"</span>: {renderJson(obj[key])}
            {i < keys.length - 1 ? ',' : ''}
          </div>
        ))}
        {"}"}
      </div>
    );
  };

  const getFullMergedPRD = async () => {
    try {
      const [it1a, it1b, it1c] = await Promise.all([
        invoke<any[]>('get_node_iterations', { nodeId: nodes.find(n => n.target_node_type === 'GPRD_Context_Goal')?.node_id }),
        invoke<any[]>('get_node_iterations', { nodeId: nodes.find(n => n.target_node_type === 'GPRD_Capability_Actor')?.node_id }),
        invoke<any[]>('get_node_iterations', { nodeId: nodes.find(n => n.target_node_type === 'GPRD_Architecture_Schema')?.node_id }),
      ]);
      
      const res1a = it1a?.find(it => it.is_pass)?.generated_draft_json;
      const res1b = it1b?.find(it => it.is_pass)?.generated_draft_json;
      const res1c = it1c?.find(it => it.is_pass)?.generated_draft_json;
      
      let merged = {};
      if (res1a) merged = { ...merged, ...normalizeKeys(JSON.parse(res1a)) };
      if (res1b) merged = { ...merged, ...normalizeKeys(JSON.parse(res1b)) };
      if (res1c) merged = { ...merged, ...normalizeKeys(JSON.parse(res1c)) };
      
      return merged;
    } catch {
      return content;
    }
  };

  React.useEffect(() => {
    const refresh = async () => {
      // 1. 항상 현재 스테이지의 리비전 목록 동기화 (체크 아이콘 표시 보장)
      await loadContent();

      // 2. 통합 뷰 모드인 경우 메인 콘텐츠만 통합 데이터로 교체
      if (showIntegrated && allCompleted) {
        const merged = await getFullMergedPRD();
        setContent(merged);
      }
    };
    refresh();
  }, [showIntegrated, activeStage, node?.node_id, nodes]);

  React.useEffect(() => {
    if (showRawView) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showRawView]);

  const isReady = node?.node_state === 'READY';
  const isPausedHitl = node?.node_state === 'PAUSED_HITL';
  const isPausedStopped = node?.node_state === 'PAUSED_STOPPED';
  const isCompleted = node?.node_state === 'COMPLETED';
  const hasPass = iterations.some(it => it.is_pass);

  // SAD와 동일한 내부 잠금 로직: 다음 단계가 시작되면 이전 단계는 잠김
  const stage2Node = nodes.find(n => n.target_node_type === 'GPRD_Capability_Actor');
  const stage3Node = nodes.find(n => n.target_node_type === 'GPRD_Architecture_Schema');
  const isStage2Started = Boolean(stage2Node && stage2Node.node_state !== 'PENDING' && stage2Node.node_state !== 'READY');
  const isStage3Started = Boolean(stage3Node && stage3Node.node_state !== 'PENDING' && stage3Node.node_state !== 'READY');

  const isCurrentStageLocked = isLockedProps || (
    activeStage === 'GPRD_Context_Goal' ? isStage2Started :
    activeStage === 'GPRD_Capability_Actor' ? isStage3Started :
    false
  );

  const lockTitle = isCurrentStageLocked ? (
    activeStage === 'GPRD_Context_Goal' ? "Stage 2: Capability & Actor 단계가 이미 시작되었습니다." :
    activeStage === 'GPRD_Capability_Actor' ? "Stage 3: Arch & Schema 단계가 이미 시작되었습니다." :
    "이미 최종 승인 단계에 진입했거나 잠금 상태입니다."
  ) : "";

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
                <input 
                  type="number" 
                  value={tempMax} 
                  min="1" 
                  max="20"
                  onChange={(e) => setTempMax(parseInt(e.target.value) || 1)}
                  onBlur={() => node && !isCurrentStageLocked && onUpdateMaxIterations(node.node_id, tempMax)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && node && !isCurrentStageLocked) {
                      onUpdateMaxIterations(node.node_id, tempMax);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  disabled={loading || isCurrentStageLocked || node?.node_state === 'COMPLETED'}
                  title={lockTitle}
                />
              </div>
            </div>

            <div className="button-group">
              {error && (
                <div className="error-hint" title={error}>
                  <span className="material-symbols-outlined">error</span>
                </div>
              )}
              
              {(isReady || node?.node_state === 'PAUSED_API_ERROR' || isPausedHitl || isCompleted || node?.node_state === 'IN_PROGRESS') && (
                <Button 
                  onClick={handleRun} 
                  disabled={loading || isCurrentStageLocked || node?.node_state === 'IN_PROGRESS' || (activeStage === 'GPRD_Capability_Actor' && nodes.find(n => n.target_node_type === 'GPRD_Context_Goal')?.node_state !== 'COMPLETED') || (activeStage === 'GPRD_Architecture_Schema' && nodes.find(n => n.target_node_type === 'GPRD_Capability_Actor')?.node_state !== 'COMPLETED')} 
                  variant={(isPausedHitl || isCompleted) ? "secondary" : "primary"}
                  isLoading={loading || node?.node_state === 'IN_PROGRESS'}
                  leftIcon={<span className="material-symbols-outlined">auto_fix</span>}
                  title={lockTitle}
                >
                  {(loading || node?.node_state === 'IN_PROGRESS') ? '진행 중' : ((isPausedHitl || isCompleted) ? 'Regenerate' : '생성 시작')}
                </Button>
              )}

              {isPausedStopped && (
                <Button
                  onClick={handleResume}
                  disabled={loading || isCurrentStageLocked}
                  variant="primary"
                  leftIcon={<span className="material-symbols-outlined">settings_backup_restore</span>}
                  title={lockTitle}
                >
                  재개
                </Button>
              )}

              {/* SAD와 동일하게 확정된 리비전이 있을 때 상단에 '다음 스텝' 버튼 노출 */}
              {(isPausedHitl || (isCompleted && activeStage !== 'GPRD_Architecture_Schema')) && hasPass && (
                <Button
                  onClick={handleApproveStage}
                  disabled={loading || isCurrentStageLocked}
                  variant="primary"
                  className="proceed-btn"
                  isLoading={loading}
                  leftIcon={<span className="material-symbols-outlined">send</span>}
                  title={lockTitle}
                >
                  다음 스텝
                </Button>
              )}

              {allCompleted && (
                <Button 
                  onClick={handleApprove} 
                  disabled={loading || isCurrentStageLocked} 
                  variant="primary" 
                  className="proceed-btn"
                  rightIcon={<span className="material-symbols-outlined">arrow_forward</span>}
                  title={lockTitle}
                >
                  Proceed to SAD
                </Button>
              )}

              {(loading || node?.node_state === 'IN_PROGRESS') && (
                <Button 
                  onClick={handleStop} 
                  variant="danger"
                  leftIcon={<span className="material-symbols-outlined">stop</span>}
                >
                  중단
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="header-right">
          <div className="stage-stepper">
            <button 
              className={`stage-step ${activeStage === 'GPRD_Context_Goal' ? 'active' : ''} ${nodes.find(n => n.target_node_type === 'GPRD_Context_Goal')?.node_state === 'COMPLETED' ? 'completed' : ''}`} 
              onClick={() => setActiveStage('GPRD_Context_Goal')}
            >
              <div className="step-num">{nodes.find(n => n.target_node_type === 'GPRD_Context_Goal')?.node_state === 'COMPLETED' ? <span className="material-symbols-outlined">check</span> : '1'}</div>
              <div className="step-label">Stage 1: Context & Goal</div>
              {nodes.find(n => n.target_node_type === 'GPRD_Context_Goal') && (
                <span className={`state-badge state-badge--${nodes.find(n => n.target_node_type === 'GPRD_Context_Goal')?.node_state.toLowerCase().replace('_', '-')}`}>
                  {nodes.find(n => n.target_node_type === 'GPRD_Context_Goal')?.node_state.replace('_', ' ')}
                </span>
              )}
            </button>
            
            <button 
              className={`stage-step ${activeStage === 'GPRD_Capability_Actor' ? 'active' : ''} ${nodes.find(n => n.target_node_type === 'GPRD_Capability_Actor')?.node_state === 'COMPLETED' ? 'completed' : ''} ${nodes.find(n => n.target_node_type === 'GPRD_Context_Goal')?.node_state !== 'COMPLETED' ? 'locked' : ''}`} 
              onClick={() => nodes.find(n => n.target_node_type === 'GPRD_Context_Goal')?.node_state === 'COMPLETED' && setActiveStage('GPRD_Capability_Actor')}
            >
              <div className="step-num">{nodes.find(n => n.target_node_type === 'GPRD_Capability_Actor')?.node_state === 'COMPLETED' ? <span className="material-symbols-outlined">check</span> : '2'}</div>
              <div className="step-label">Stage 2: Capability & Actor</div>
              {nodes.find(n => n.target_node_type === 'GPRD_Capability_Actor') && (
                <span className={`state-badge state-badge--${nodes.find(n => n.target_node_type === 'GPRD_Capability_Actor')?.node_state.toLowerCase().replace('_', '-')}`}>
                  {nodes.find(n => n.target_node_type === 'GPRD_Capability_Actor')?.node_state.replace('_', ' ')}
                </span>
              )}
            </button>

            <button 
              className={`stage-step ${activeStage === 'GPRD_Architecture_Schema' ? 'active' : ''} ${nodes.find(n => n.target_node_type === 'GPRD_Architecture_Schema')?.node_state === 'COMPLETED' ? 'completed' : ''} ${nodes.find(n => n.target_node_type === 'GPRD_Capability_Actor')?.node_state !== 'COMPLETED' ? 'locked' : ''}`} 
              onClick={() => nodes.find(n => n.target_node_type === 'GPRD_Capability_Actor')?.node_state === 'COMPLETED' && setActiveStage('GPRD_Architecture_Schema')}
            >
              <div className="step-num">{nodes.find(n => n.target_node_type === 'GPRD_Architecture_Schema')?.node_state === 'COMPLETED' ? <span className="material-symbols-outlined">check</span> : '3'}</div>
              <div className="step-label">Stage 3: Arch & Schema</div>
              {nodes.find(n => n.target_node_type === 'GPRD_Architecture_Schema') && (
                <span className={`state-badge state-badge--${nodes.find(n => n.target_node_type === 'GPRD_Architecture_Schema')?.node_state.toLowerCase().replace('_', '-')}`}>
                  {nodes.find(n => n.target_node_type === 'GPRD_Architecture_Schema')?.node_state.replace('_', ' ')}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className="genesis-prd-view__status-msg">
          <Spinner size="sm" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* 3. Revision History (Scoped to activeStage) */}
      {iterations.length > 0 && (
        <div className="revisions-horizontal">
          <div className="revisions-header">
            <div className="left">
              <span className="material-symbols-outlined">history</span>
              <span>{activeStage.replace('GPRD_', '').replace(/_/g, ' ')} Revisions</span>
            </div>
            <div className="right">
              {allCompleted && (
                <button 
                  className={`toggle-integrated-btn ${showIntegrated ? 'active' : ''}`}
                  onClick={() => setShowIntegrated(!showIntegrated)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px', 
                    padding: '4px 12px', 
                    borderRadius: '6px', 
                    fontSize: '0.85rem',
                    background: showIntegrated ? 'var(--primary-color)' : 'var(--bg-card)',
                    color: showIntegrated ? '#fff' : 'var(--text-main)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    {showIntegrated ? 'grid_view' : 'integration_instructions'}
                  </span>
                  {showIntegrated ? '단계별 보기' : '통합 PRD 보기'}
                </button>
              )}
              {iterations[selectedIdx] && (
                <Button
                  variant="primary"
                  onClick={() => setIsAiGuidanceOpen(true)}
                  className="ai-guidance-btn"
                  leftIcon={<span className="material-symbols-outlined">auto_awesome</span>}
                  title="AI Guidance"
                />
              )}
              <button className="raw-toggle" onClick={() => setShowRawView(!showRawView)}>
                <span className="material-symbols-outlined">
                  {showRawView ? 'dashboard' : 'code'}
                </span>
                {showRawView ? 'Visual' : 'RAW SPEC'}
              </button>
            </div>
          </div>
          <div className="revisions-list custom-scrollbar">
            {iterations.map((it, idx) => (
              <div 
                key={it.iteration_id} 
                className={`revision-btn ${selectedIdx === idx ? 'active' : ''} ${it.is_pass ? 'confirmed' : ''} ${showIntegrated ? 'disabled' : ''}`}
                onClick={() => !showIntegrated && selectIteration(idx)}
                style={{ opacity: showIntegrated ? 0.5 : 1, cursor: showIntegrated ? 'not-allowed' : 'pointer' }}
              >
                <span className="iter-num">
                  Draft #{it.iteration_number}
                </span>
                {it.is_pass && (
                  <span className="material-symbols-outlined selected-icon">check_circle</span>
                )}
                <span className="iter-meta">{it.calculated_score}</span>
              </div>
            ))}
          </div>

          {!showIntegrated && iterations[selectedIdx] && !isCompleted && !isCurrentStageLocked && (
            <div className="revisions-action" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', paddingTop: '0.5rem', paddingRight: '0.25rem' }}>
              {iterations[selectedIdx].is_pass ? (
                  <Button
                    onClick={() => handleUnconfirmIteration(selectedIdx)}
                    disabled={loading || isCurrentStageLocked}
                    variant="ghost"
                    leftIcon={<span className="material-symbols-outlined">undo</span>}
                    title={lockTitle}
                  >
                    확정 해제
                  </Button>
              ) : (
                <>
                   <Button
                    onClick={() => handleDeleteIteration(selectedIdx)}
                    disabled={loading || isCurrentStageLocked}
                    variant="ghost"
                    className="delete-btn"
                    title={isCurrentStageLocked ? lockTitle : "이 리비전 삭제"}
                    iconOnly
                    leftIcon={<span className="material-symbols-outlined" style={{ color: '#ef4444' }}>delete</span>}
                  />
                  <Button
                    onClick={() => handleConfirmIteration(selectedIdx)}
                    disabled={loading || isCurrentStageLocked}
                    variant="secondary"
                    leftIcon={<span className="material-symbols-outlined">check_circle</span>}
                    title={lockTitle}
                  >
                    Draft 확정
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. Stage-specific Bento Grid / Raw Viewer */}
      {content && (
        <motion.div 
          className="genesis-prd-view__bento-grid"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          key={activeStage + (showIntegrated ? '-merged' : '')}
        >
          {/* Stage 1: Context & Goal OR Integrated View */}
          {(showIntegrated || activeStage === 'GPRD_Context_Goal') && (
            <>
              {/* Project Overview (col-span-8) */}
              <div className="bento-card bento-card--overview intent-strip-primary">
                <div className="card-header">
                  <h2 className="card-title">
                    <span className="material-symbols-outlined icon">rocket_launch</span>
                    Project Vision: {content.metadata?.project_name || 'Vision'}
                  </h2>
                  {content.metadata?.version && <span className="version-tag">v{content.metadata.version}</span>}
                </div>
                
                <div className="overview-content">
                  <div className="main-info">
                    <div className="info-group">
                      <p>{content.product_vision || content.business_context?.product_vision || 'N/A'}</p>
                    </div>
                    {(content.target_market || content.business_context?.target_market) && (
                      <div className="info-group">
                        <h3>Target Market</h3>
                        <p>{content.target_market || content.business_context?.target_market}</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="metrics-box">
                    <h3>Success Metrics</h3>
                    <ul className="metrics-list">
                      {(content.success_metrics || content.business_context?.success_metrics)?.map((m: string, i: number) => (
                        <li key={i}>
                          <span className="material-symbols-outlined">analytics</span>
                          {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Constraints (col-span-4) */}
              <div className="bento-card bento-card--constraints intent-strip-success">
                <div className="card-header">
                  <h2 className="card-title">
                    <span className="material-symbols-outlined icon">verified_user</span>
                    Constraints
                  </h2>
                </div>
                <div className="constraints-content">
                  <div className="constraint-group">
                    <h3>Compliance</h3>
                    <div className="tag-cloud">
                      {(content.compliance || content.global_constraints?.compliance)?.map((c: string, i: number) => (
                        <span key={i} className="tag">{c}</span>
                      ))}
                    </div>
                  </div>
                  <div className="constraint-group">
                    <h3>Performance</h3>
                    <p>{(content.performance || content.global_constraints?.performance)?.join(', ') || 'Standard'}</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Stage 2: Capability & Actor OR Integrated View */}
          {(showIntegrated || activeStage === 'GPRD_Capability_Actor') && (
            <>
              {/* System Actors (col-span-12) - 통합 뷰에서는 Stage 3의 정규화된 Roles를 대신 보여줌 */}
              {!showIntegrated && (
                <div className="bento-card bento-card--personas col-span-12">
                  <h2 className="card-title">System Actors</h2>
                  <div className="personas-grid">
                    {(content.actors || content.user_roles)?.map((role: any, i: number) => (
                      <div key={i} className="persona-chip">
                        <div className="persona-header">
                          <span className="material-symbols-outlined icon">person</span>
                          <div className="persona-info">
                            <span className="name">{role.role_name}</span>
                            <span className="desc">{role.description}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Epics Grid (col-span-12) */}
              <div className="epics-section col-span-12">
                <div className="section-header">
                  <h2>Functional Epics</h2>
                </div>
                
                <div className="epics-grid">
                  {content.core_epics?.map((epic: any, i: number) => (
                    <div 
                      key={i} 
                      className="epic-card group"
                      onClick={() => {
                        setSelectedEpic(epic);
                        setIsModalOpen(true);
                      }}
                    >
                      <div className="epic-card-top">
                        <div className="epic-info">
                          <div className="epic-icon">
                            <span className="material-symbols-outlined">task</span>
                          </div>
                          <div className="epic-text">
                            <h3>{epic.title}</h3>
                            <div className="epic-meta">
                              <span className="epic-id">{epic.epic_id}</span>
                              <span className="ac-count">
                                <span className="material-symbols-outlined">fact_check</span>
                                {epic.acceptance_criteria?.length || 0} Criteria
                              </span>
                            </div>
                          </div>
                        </div>
                        <span className="material-symbols-outlined arrow">chevron_right</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Stage 3: Architecture & Schema OR Integrated View */}
          {(showIntegrated || activeStage === 'GPRD_Architecture_Schema') && (
            <>
              {content.user_roles && (
                <div className="bento-card bento-card--personas col-span-12">
                  <h2 className="card-title">Permission & Roles</h2>
                  <div className="personas-grid">
                    {content.user_roles.map((role: any, i: number) => (
                      <div key={i} className="persona-chip">
                        <div className="persona-header">
                          <span className="material-symbols-outlined icon">admin_panel_settings</span>
                          <div className="persona-info">
                            <span className="name">{role.role_name}</span>
                            <span className="role-id">{role.role_id}</span>
                          </div>
                        </div>
                        <span className="badge">{role.permissions_level}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bento-card bento-card--tech intent-strip-primary col-span-12">
                <h2 className="card-title">Core Technology Stack</h2>
                <div className="tech-grid">
                  {content.tech_stack && Object.entries(content.tech_stack).map(([cat, details]: [string, any]) => {
                    const entries = typeof details === 'object' ? Object.entries(details) : [];
                    // 주요 기술(Main) 선정 로직
                    const mainEntry = entries.find(([k]) => 
                      k.toLowerCase().includes('framework') || 
                      k.toLowerCase().includes('model_family') ||
                      k.toLowerCase().includes('type')
                    ) || entries[0];
                    const subEntries = entries.filter(e => e !== mainEntry);

                    return (
                      <div key={cat} className="tech-category">
                        <div className="category-header">
                          <span className="material-symbols-outlined">{getTechIcon(cat)}</span>
                          <span className="name">{cat.replace(/_/g, ' ').toUpperCase()}</span>
                        </div>
                        <div className="category-body">
                          {mainEntry ? (
                            <>
                              <div className="category-main">
                                <span className="label">{mainEntry[0].replace(/_/g, ' ')}</span>
                                <span className="value">{String(mainEntry[1])}</span>
                              </div>
                              {subEntries.length > 0 && (
                                <div className="category-subs">
                                  {subEntries.map(([k, v]) => (
                                    <div key={k} className="sub-item">
                                      <span className="label">{k.replace(/_/g, ' ')}</span>
                                      <span className="value">{String(v)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="value">{String(details)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}

      <div className="bento-footer"></div>

      {/* Epic Detail Modal */}
      {selectedEpic && (
        <BaseModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={selectedEpic.title}
          subtitle={selectedEpic.epic_id}
          size="md"
        >
          <div className="epic-detail-modal">
            {selectedEpic.description && (
              <section className="detail-section">
                <h4>Description</h4>
                <p>{selectedEpic.description}</p>
              </section>
            )}
            
            <section className="detail-section">
              <h4>Acceptance Criteria</h4>
              <ul className="ac-list">
                {selectedEpic.acceptance_criteria?.map((ac: string, idx: number) => (
                  <li key={idx}>
                    <span className="ac-index">{idx + 1}</span>
                    <span className="ac-text">{ac}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="detail-section">
              <h4>Target Roles</h4>
              <div className="roles-cloud">
                {selectedEpic.target_roles?.map((role: string, idx: number) => (
                  <span key={idx} className="role-tag">{role}</span>
                ))}
              </div>
            </section>
          </div>
        </BaseModal>
      )}

      {showRawView && content && (
        <div className="genesis-json-overlay">
          <div className="overlay-header">
            <h3>SPECIFICATION SOURCE: {activeStage.replace('GPRD_', '')}</h3>
            <button className="close-btn" onClick={() => setShowRawView(false)}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="code-window">
            <div className="code-content custom-scrollbar">
              <pre>{renderJson(content)}</pre>
            </div>
          </div>
        </div>
      )}

      {/* 5. AI Guidance Modal */}
      {iterations[selectedIdx] && (
        <BaseModal
          isOpen={isAiGuidanceOpen}
          onClose={() => setIsAiGuidanceOpen(false)}
          title="AI Intelligence Feedback"
          subtitle={`Draft #${iterations[selectedIdx].iteration_number} - Score: ${iterations[selectedIdx].calculated_score}`}
          size="md"
        >
          <div className="intelligence-feedback">
            {iterations[selectedIdx].critical_errors_array && (
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
            {iterations[selectedIdx].actionable_feedback_text && (
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
          </div>
        </BaseModal>
      )}

      {!content && !loading && isReady && (
        <div className="genesis-prd-view__empty">
          <span className="material-symbols-outlined">auto_fix</span>
          <p>{activeStage.replace('GPRD_', '').replace(/_/g, ' ')} 문서를 생성할 준비가 되었습니다.</p>
          <Button onClick={handleRun} variant="primary" leftIcon={<span className="material-symbols-outlined">play_arrow</span>}>
            생성 시작
          </Button>
        </div>
      )}
    </div>
  );
};

export default GenesisPrdView;
