import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Store } from '@tauri-apps/plugin-store';
import { ask } from '@tauri-apps/plugin-dialog';
import { GlobalContext, CONTEXT_TYPE_LABELS, DocumentNode, GenerationIteration } from '../../types/project';
import Button from '../common/Button';
import BaseModal from '../common/BaseModal';
import FeedbackRenderer from '../common/FeedbackRenderer';
import SadSpecRenderer from './SadSpecRenderer';
import './SadOverview.scss';

interface SadOverviewProps {
  projectId: string;
  globalNode: DocumentNode | null;
  moduleNode: DocumentNode | null;
  isApproved?: boolean;
  onModulesCreated: () => void;
  onRefresh: () => void;
  onUpdateMaxIterations: (nodeId: string, maxIterations: number) => void;
  isLocked?: boolean;
}

const SadOverview: React.FC<SadOverviewProps> = ({
  projectId,
  globalNode,
  moduleNode,
  isApproved = false,
  onModulesCreated,
  onRefresh,
  onUpdateMaxIterations,
  isLocked = false
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
  const [showRawJsonMap, setShowRawJsonMap] = useState<Record<string, boolean>>({});
  const [tempMax, setTempMax] = useState(10);
  const [isMaxFocused, setIsMaxFocused] = useState(false);
  const [isAiGuidanceOpen, setIsAiGuidanceOpen] = useState(false);
  const [showRawView, setShowRawView] = useState(false);
  const [targetCount, setTargetCount] = useState(8);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);


  const fetchContexts = async () => {
    try {
      const result = await invoke<GlobalContext[]>('get_global_contexts', { projectId });
      setContexts(result);
    } catch { }
  };

  const fetchIterations = async (forceSelect = false) => {
    try {
      if (globalNode?.node_id) {
        const result = await invoke<GenerationIteration[]>('get_node_iterations', { nodeId: globalNode.node_id });
        setGlobalIters(result);
        if (result.length > 0) {
          if (!selectedGlobalIterId || forceSelect) {
            // confirmed(is_pass=true) 항목이 있으면 그것을 선택, 없으면 가장 최신(마지막 인덱스) 선택
            const passIter = result.find(it => it.is_pass);
            const target = passIter || result[result.length - 1];
            setSelectedGlobalIterId(target.iteration_id);
          }
        }
      }

      const contextList = await invoke<GlobalContext[]>('get_global_contexts', { projectId });
      setContexts(contextList);

      if (moduleNode?.node_id) {
        const result = await invoke<GenerationIteration[]>('get_node_iterations', { nodeId: moduleNode.node_id });
        setModuleIters(result);
        if (result.length > 0) {
          if (!selectedModuleIterId || forceSelect) {
            const passIter = result.find(it => it.is_pass);
            const target = passIter || result[result.length - 1];
            setSelectedModuleIterId(target.iteration_id);
          }
        }
      }
    } catch { }
  };

  const isGlobalDone = globalNode?.node_state === 'COMPLETED';
  const isModuleDone = moduleNode?.node_state === 'COMPLETED';

  // Internal Logic: If stage 2 is started, stage 1 is locked.
  const isModuleStarted = Boolean(moduleNode && moduleNode.node_state !== 'READY' && moduleNode.node_state !== 'PENDING');
  const isStage1Locked = isLocked || isModuleStarted;
  const isCurrentStageLocked = activeStage === 'GLOBAL' ? isStage1Locked : isLocked;

  const currentIters = activeStage === 'GLOBAL' ? globalIters : moduleIters;
  const currentSelectedIterId = activeStage === 'GLOBAL' ? selectedGlobalIterId : selectedModuleIterId;
  const currentNode = activeStage === 'GLOBAL' ? globalNode : moduleNode;
  const activeIteration = currentIters.find(it => it.iteration_id === currentSelectedIterId);

  useEffect(() => {
    fetchContexts();
    // 노드 상태가 변했거나 처음 로드될 때만 이터레이션 정보를 가져옴 (강제 선택 로직 포함)
    fetchIterations(true);
  }, [projectId, globalNode?.node_id, globalNode?.node_state, moduleNode?.node_id, moduleNode?.node_state]);

  useEffect(() => {
    if (currentNode && !isMaxFocused) {
      setTempMax(currentNode.max_iterations);
    }
  }, [currentNode?.node_id, currentNode?.max_iterations, isMaxFocused]);

  useEffect(() => {
    const unlisten = listen<string>('pipeline-status', (event) => {
      const msg = event.payload;
      if (msg.includes('임베딩 중')) {
        setStatusMsg(msg);
      } else if (msg.includes('임베딩 완료') || msg.includes('임베딩 실패')) {
        setStatusMsg(null);
        onRefresh();
      }
    });
    return () => {
      unlisten.then(fn => fn());
    };
  }, [onRefresh]);

  const handleRunStage = async (stage: 'GLOBAL' | 'MODULE') => {
    setLoading(true);
    setError(null);
    try {
      const store = await Store.load('settings.json');
      const apiKeyValue = await store.get<{ value: string }>('gemini_api_key');
      if (!apiKeyValue?.value) throw new Error('API 키가 설정되지 않았습니다.');

      const cmd = stage === 'GLOBAL' ? 'run_sad_global_pipeline' : 'run_sad_module_pipeline';
      const args: any = { projectId, apiKey: apiKeyValue.value };
      if (stage === 'MODULE') {
        args.targetModuleCount = targetCount;
      }
      await invoke(cmd, args);

      await fetchContexts();
      await fetchIterations(true);
      onRefresh();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      // 에러가 나더라도 생성된 이터레이션이나 컨텍스트가 있을 수 있으므로 동기화
      await fetchContexts();
      await fetchIterations(true);
      onRefresh();
      setLoading(false);
    }
  };

  const handleConfirmIteration = async (stage: 'GLOBAL' | 'MODULE') => {
    const iterId = stage === 'GLOBAL' ? selectedGlobalIterId : selectedModuleIterId;
    if (!iterId) return;

    setLoading(true);
    try {
      await invoke('confirm_sad_iteration', { projectId, iterationId: iterId });
      await fetchIterations(true);
      await fetchContexts();
      onRefresh();
    } catch (err: any) {
      alert("확정 실패: " + err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleUnconfirmIteration = async (stage: 'GLOBAL' | 'MODULE') => {
    const iterId = stage === 'GLOBAL' ? selectedGlobalIterId : selectedModuleIterId;
    if (!iterId || !projectId || loading || isCurrentStageLocked) return;
    
    try {
      setLoading(true);
      await invoke('unconfirm_iteration', { projectId, iterationId: iterId });
      await fetchIterations();
      await fetchContexts();
      onRefresh();
    } catch (err: any) {
      alert("확정 해제 실패: " + err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleApproveStage = async () => {
    if (!currentNode) return;
    setLoading(true);
    setError(null);
    try {
      await invoke('approve_sad_node', { projectId, nodeId: currentNode.node_id });
      await fetchIterations();
      await fetchContexts();
      onRefresh();

      // [수정] 승인 시 다음 단계로 명시적 전환 (버그 방지를 위해 useEffect 대신 이곳에서 처리)
      if (activeStage === 'GLOBAL') {
        setActiveStage('MODULE');
      }
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteIteration = async () => {
    const iterId = activeStage === 'GLOBAL' ? selectedGlobalIterId : selectedModuleIterId;
    const it = currentIters.find(i => i.iteration_id === iterId);
    if (!it) return;

    const confirmed = await ask(`Draft #${it.iteration_number} 리비전을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`, {
      title: '리비전 삭제',
      kind: 'warning'
    });

    if (!confirmed) return;

    setLoading(true);
    try {
      await invoke('delete_generation_iteration', { iterationId: it.iteration_id });
      await fetchIterations();
      await fetchContexts();
      onRefresh();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async (nodeId: string) => {
    try {
      await invoke('stop_node_pipeline', { nodeId });
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const handleResume = async (nodeId: string) => {
    try {
      await invoke('resume_node_pipeline', { nodeId });
      onRefresh();
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const handleCreateModules = async () => {
    setLoading(true);
    setError(null);
    try {
      const moduleListCtx = contexts.find(c => c.context_type === 'sad_module_list' && c.iteration_id);
      if (!moduleListCtx) throw new Error('확정된 모듈 목록이 존재하지 않습니다.');

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

  const displayContexts = (() => {
    const stage1Types = ['sad_core_erd', 'sad_auth_rbac', 'sad_interface_error', 'sad_tech_stack', 'sad_non_tech'];
    let stage1Docs: any[] = contexts.filter(c => c.iteration_id === selectedGlobalIterId && stage1Types.includes(c.context_type));

    const globalIter = globalIters.find(it => it.iteration_id === selectedGlobalIterId);
    if (stage1Docs.length === 0 && globalIter && globalIter.generated_draft_json) {
      try {
        const parsed = JSON.parse(globalIter.generated_draft_json);
        stage1Docs = stage1Types.filter(type => parsed[type]).map(type => ({
          context_id: `draft-${globalIter.iteration_id}-${type}`,
          project_id: projectId,
          iteration_id: globalIter.iteration_id,
          context_type: type,
          context_data_json: typeof parsed[type] === 'string' ? parsed[type] : JSON.stringify(parsed[type]),
          is_draft: !globalIter.is_pass
        }));
      } catch (e) {}
    }

    const stage2Types = ['sad_module_list', 'sad_epic_mapping', 'sad_module_deps'];
    let stage2Docs: any[] = contexts.filter(c => c.iteration_id === selectedModuleIterId && stage2Types.includes(c.context_type));

    const moduleIter = moduleIters.find(it => it.iteration_id === selectedModuleIterId);
    if (stage2Docs.length === 0 && moduleIter && moduleIter.generated_draft_json) {
      try {
        const parsed = JSON.parse(moduleIter.generated_draft_json);
        stage2Docs = stage2Types.filter(type => parsed[type]).map(type => ({
          context_id: `draft-${moduleIter.iteration_id}-${type}`,
          project_id: projectId,
          iteration_id: moduleIter.iteration_id,
          context_type: type,
          context_data_json: typeof parsed[type] === 'string' ? parsed[type] : JSON.stringify(parsed[type]),
          is_draft: !moduleIter.is_pass
        }));
      } catch (e) {}
    }

    return activeStage === 'GLOBAL' ? stage1Docs : stage2Docs;
  })();

  const stage2Types = ['sad_module_list', 'sad_epic_mapping', 'sad_module_deps'];

  const normalizeKeys = (obj: any): any => {
    if (Array.isArray(obj)) return obj.map(normalizeKeys);
    if (obj !== null && typeof obj === 'object') {
      return Object.keys(obj).reduce((acc: any, key) => {
        const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        acc[snakeKey] = normalizeKeys(obj[key]);
        return acc;
      }, {});
    }
    return obj;
  };

  const renderJson = (val: any, level = 0): React.ReactNode => {
    if (val === null) return <span className="token-null">null</span>;
    if (typeof val === 'string') return <span className="token-string">"{val}"</span>;
    if (typeof val === 'number') return <span className="token-number">{val}</span>;
    if (typeof val === 'boolean') return <span className="token-boolean">{val.toString()}</span>;

    const indent = '  '.repeat(level);
    const nextIndent = '  '.repeat(level + 1);

    if (Array.isArray(val)) {
      if (val.length === 0) return '[]';
      return (
        <span className="json-array">
          {"[\n"}
          {val.map((item, i) => (
            <React.Fragment key={i}>
              {nextIndent}{renderJson(item, level + 1)}
              {i < val.length - 1 ? ",\n" : "\n"}
            </React.Fragment>
          ))}
          {indent}{"]"}
        </span>
      );
    }

    if (typeof val === 'object') {
      const keys = Object.keys(val);
      if (keys.length === 0) return '{}';
      return (
        <span className="json-object">
          {"{\n"}
          {keys.map((key, i) => (
            <React.Fragment key={key}>
              {nextIndent}<span className="token-key">"{key}"</span>: {renderJson(val[key], level + 1)}
              {i < keys.length - 1 ? ",\n" : "\n"}
            </React.Fragment>
          ))}
          {indent}{"}"}
        </span>
      );
    }

    return String(val);
  };

  return (
    <div className="sad-overview">
      <div className="sad-overview__header-row">
        <div className="header-info">
          <h1>Software Architecture</h1>
          <p className="description">Global Context & Module Split 설계 단계입니다.</p>

          <div className="header-controls">
            <div className="iteration-field">
              <span className="label">ITERATION</span>
              <div className="iteration-control-group">
                <span className="current-count">{currentNode?.current_iteration || 0}</span>
                <span className="separator">/</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={tempMax}
                  onChange={(e) => setTempMax(parseInt(e.target.value) || 1)}
                  onFocus={() => setIsMaxFocused(true)}
                  onBlur={() => {
                    setIsMaxFocused(false);
                    if (currentNode && !isCurrentStageLocked) onUpdateMaxIterations(currentNode.node_id, tempMax);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && currentNode && !isCurrentStageLocked) {
                      onUpdateMaxIterations(currentNode.node_id, tempMax);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  disabled={loading || currentNode?.node_state === 'IN_PROGRESS' || isCurrentStageLocked}
                  title={isCurrentStageLocked ? (activeStage === 'GLOBAL' && isModuleStarted ? "모듈 분리 단계가 이미 시작되어 수정할 수 없습니다." : "다음 단계가 진행 중이므로 수정할 수 없습니다.") : ""}
                />
              </div>
            </div>

            {activeStage === 'MODULE' && (
              <div className="iteration-field target-count-field">
                <span className="label">TARGET MODULES</span>
                <div className="iteration-control-group">
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={targetCount}
                    onChange={(e) => setTargetCount(parseInt(e.target.value) || 1)}
                    disabled={loading || currentNode?.node_state === 'IN_PROGRESS' || isCurrentStageLocked}
                    title="생성할 모듈의 목표 개수를 설정합니다."
                  />
                </div>
              </div>
            )}

            <div className="button-group">
              <Button
                onClick={() => handleRunStage(activeStage)}
                disabled={loading || currentNode?.node_state === 'IN_PROGRESS' || (activeStage === 'MODULE' && !isGlobalDone) || isCurrentStageLocked}
                variant={(currentNode?.node_state === 'PAUSED_HITL' || currentNode?.node_state === 'COMPLETED') ? 'ghost' : 'primary'}
                className="proceed-btn"
                isLoading={loading || currentNode?.node_state === 'IN_PROGRESS'}
                leftIcon={<span className="material-symbols-outlined">auto_awesome</span>}
                title={isCurrentStageLocked ? (activeStage === 'GLOBAL' && isModuleStarted ? "모듈 분리 단계가 이미 시작되었습니다." : "다음 단계가 진행 중입니다.") : ""}
              >
                {(loading || currentNode?.node_state === 'IN_PROGRESS') ? '진행 중' : ((currentNode?.node_state === 'PAUSED_HITL' || currentNode?.node_state === 'COMPLETED') ? '재생성' : '생성 시작')}
              </Button>

              {(currentNode?.node_state === 'PAUSED_HITL' || (currentNode?.node_state === 'COMPLETED' && activeStage === 'GLOBAL')) && currentIters.some(it => it.is_pass) && (
                <Button
                  onClick={handleApproveStage}
                  disabled={loading || isCurrentStageLocked}
                  variant="primary"
                  className="proceed-btn"
                  isLoading={loading}
                  leftIcon={<span className="material-symbols-outlined">send</span>}
                >
                  다음 스텝
                </Button>
              )}

              {(loading || currentNode?.node_state === 'IN_PROGRESS') && (
                <Button
                  onClick={() => currentNode && handleStop(currentNode.node_id)}
                  variant="danger"
                  leftIcon={<span className="material-symbols-outlined">stop</span>}
                >
                  중단
                </Button>
              )}

              {currentNode?.node_state === 'PAUSED_STOPPED' && (
                <Button
                  onClick={() => handleResume(currentNode.node_id)}
                  disabled={loading || isCurrentStageLocked}
                  variant="primary"
                  leftIcon={<span className="material-symbols-outlined">settings_backup_restore</span>}
                  title={isCurrentStageLocked ? "다음 단계가 진행 중이므로 재개할 수 없습니다." : ""}
                >
                  재개
                </Button>
              )}


              {activeStage === 'MODULE' && (isModuleDone || isApproved) && (
                <Button
                  onClick={handleCreateModules}
                  disabled={loading || isApproved || isLocked}
                  variant="primary"
                  className="approve-btn"
                  leftIcon={<span className="material-symbols-outlined">{isApproved ? 'verified' : 'rocket_launch'}</span>}
                  title={isLocked ? "이미 다음 단계로 진행되었습니다." : ""}
                >
                  {isApproved ? '승인 완료' : '설계 승인'}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="header-right">
          <div className="stage-stepper">
            <button className={`stage-step ${activeStage === 'GLOBAL' ? 'active' : ''} ${isGlobalDone ? 'completed' : ''}`} onClick={() => setActiveStage('GLOBAL')}>
              <div className="step-num">{isGlobalDone ? <span className="material-symbols-outlined">check</span> : '1'}</div>
              <div className="step-label">Stage 1: Global Context</div>
              {globalNode && (
                <span className={`state-badge state-badge--${globalNode.node_state.toLowerCase().replace('_', '-')}`}>
                  {globalNode.node_state.replace('_', ' ')}
                </span>
              )}
            </button>
            <button className={`stage-step ${activeStage === 'MODULE' ? 'active' : ''} ${isModuleDone ? 'completed' : ''} ${!isGlobalDone ? 'locked' : ''}`} onClick={() => isGlobalDone && setActiveStage('MODULE')}>
              <div className="step-num">{isModuleDone ? <span className="material-symbols-outlined">check</span> : '2'}</div>
              <div className="step-label">Stage 2: Module Split</div>
              {moduleNode && (
                <span className={`state-badge state-badge--${moduleNode.node_state.toLowerCase().replace('_', '-')}`}>
                  {moduleNode.node_state.replace('_', ' ')}
                </span>
              )}
            </button>
          </div>
        </div>

      </div>
      
      {statusMsg && (
        <div className="sad-overview__status-msg" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          margin: '12px 24px', 
          padding: '10px 16px', 
          background: 'rgba(52, 199, 89, 0.1)', 
          borderRadius: '8px', 
          color: '#34c759',
          fontSize: '0.9rem',
          border: '1px solid rgba(52, 199, 89, 0.2)' 
        }}>
          <span className="material-symbols-outlined spinning" style={{ fontSize: '1.2rem' }}>sync</span>
          <span>{statusMsg}</span>
        </div>
      )}

      {error && (
        <div className="sad-overview__error">
          <span className="material-symbols-outlined">error</span>
          {error}
        </div>
      )}

      <div className="revisions-horizontal">
        <div className="revisions-header">
          <div className="left">
            <span className="material-symbols-outlined">history</span>
            <span>Revision History</span>
          </div>
          <div className="right">
            {activeIteration && (
              <Button
                variant="primary"
                onClick={() => setIsAiGuidanceOpen(true)}
                className="ai-guidance-btn"
                leftIcon={<span className="material-symbols-outlined">auto_awesome</span>}
                title="AI Guidance"
              >
              </Button>
            )}
            <button
              className={`raw-spec-btn ${showRawView ? 'active' : ''}`}
              onClick={() => setShowRawView(!showRawView)}
            >
              <span className="material-symbols-outlined">
                {showRawView ? 'account_tree' : 'data_object'}
              </span>
              {showRawView ? 'Visual' : 'RAW SPEC'}
            </button>
          </div>
        </div>
        <div className="revisions-list custom-scrollbar">
          {currentIters.map((it) => {
            const isConfirmed = it.is_pass === true;

            return (
              <div
                key={it.iteration_id}
                className={`revision-btn ${currentSelectedIterId === it.iteration_id ? 'active' : ''} ${isConfirmed ? 'confirmed' : ''}`}
                onClick={() => activeStage === 'GLOBAL' ? setSelectedGlobalIterId(it.iteration_id) : setSelectedModuleIterId(it.iteration_id)}
              >
                <span className="iter-num">
                  Draft #{it.iteration_number}
                </span>
                {isConfirmed && (
                  <span className="material-symbols-outlined selected-icon">check_circle</span>
                )}
                <span className="iter-meta">{it.calculated_score}</span>
              </div>
            );
          })}
        </div>
      </div>

      <section className="tech-specs-section">
        <div className="tech-specs-header">
          <div className="title-group">
            <span className="material-symbols-outlined">terminal</span>
            <h6>Technical Specifications</h6>
          </div>
          <div className="tech-specs-header__actions">

            {currentNode?.node_state === 'PAUSED_HITL' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {activeIteration?.is_pass ? (
                  <Button
                    onClick={() => handleUnconfirmIteration(activeStage)}
                    disabled={loading || isCurrentStageLocked}
                    variant="ghost"
                    leftIcon={<span className="material-symbols-outlined">undo</span>}
                    title={isCurrentStageLocked ? "이미 다음 단계로 진행되었습니다." : ""}
                  >
                    확정 해제
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={handleDeleteIteration}
                      disabled={loading || isCurrentStageLocked}
                      variant="ghost"
                      className="delete-btn"
                      title="이 리비전 삭제"
                      iconOnly
                      leftIcon={<span className="material-symbols-outlined" style={{ color: '#ef4444' }}>delete</span>}
                    />
                    <Button
                      onClick={() => handleConfirmIteration(activeStage)}
                      disabled={loading || isCurrentStageLocked}
                      variant="secondary"
                      leftIcon={<span className="material-symbols-outlined">check_circle</span>}
                      title={isCurrentStageLocked ? "이미 다음 단계로 진행되었습니다." : ""}
                    >
                      Draft 확정
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <BaseModal
          isOpen={isAiGuidanceOpen}
          onClose={() => setIsAiGuidanceOpen(false)}
          title="AI Guidance"
          subtitle={activeIteration ? `Draft #${activeIteration.iteration_number} Intelligence Feedback` : ''}
          size="lg"
        >
          {activeIteration && (
            <div className="intelligence-feedback">
              {activeIteration.actionable_feedback_text && (
                <div className="feedback-card feedback-card--info">
                  <h3 className="feedback-title">AI Recommendation</h3>
                  <div className="feedback-body">
                    <FeedbackRenderer feedback={activeIteration.actionable_feedback_text} type="info" />
                  </div>
                </div>
              )}
              {activeIteration.critical_errors_array && (
                <div className="feedback-card feedback-card--error">
                  <h3 className="feedback-title">Priority Refinements</h3>
                  <div className="feedback-body">
                    <FeedbackRenderer feedback={activeIteration.critical_errors_array} type="error" />
                  </div>
                </div>
              )}
            </div>
          )}
        </BaseModal>

        <div className="tech-specs-grid">
          {displayContexts.length > 0 ? displayContexts.map((ctx, idx) => (
            <motion.div
              key={ctx.context_id}
              className={`spec-card ${expandedCtx === ctx.context_id ? 'expanded' : ''} ${stage2Types.includes(ctx.context_type) ? 'intent-stage-2' : ''}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
            >
              <div className="spec-card-top">
                <span className="group-label">Architecture Definition</span>
                <span className="file-name">{ctx.context_type.toUpperCase()}.JSON</span>
              </div>
              <div className="spec-card-inner">
                <div className="card-header">
                  <div className="title-group" onClick={() => setExpandedCtx(expandedCtx === ctx.context_id ? null : ctx.context_id)}>
                    <span className="material-symbols-outlined icon">{getCtxIcon(ctx.context_type)}</span>
                    <span className="name">{CONTEXT_TYPE_LABELS[ctx.context_type] || ctx.context_type}</span>
                  </div>
                  <div className="actions-group">
                    <button
                      className={`action-btn json-toggle ${showRawJsonMap[ctx.context_id] ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowRawJsonMap(prev => ({ ...prev, [ctx.context_id]: !prev[ctx.context_id] }));
                      }}
                      title="Toggle JSON view"
                    >
                      <span className="material-symbols-outlined">code</span>
                    </button>
                    <button
                      className="action-btn expand-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedCtx(expandedCtx === ctx.context_id ? null : ctx.context_id);
                      }}
                    >
                      <span className="material-symbols-outlined">
                        {expandedCtx === ctx.context_id ? 'fullscreen_exit' : 'fullscreen'}
                      </span>
                    </button>
                  </div>
                </div>
                <div className="card-content-wrapper custom-scrollbar">
                  <SadSpecRenderer
                    type={ctx.context_type}
                    data={ctx.context_data_json}
                    isRaw={showRawJsonMap[ctx.context_id]}
                  />
                </div>
              </div>
            </motion.div>
          )) : (
            <div className="empty-grid-notice">
              <span className="material-symbols-outlined">architecture</span>
              <p>아직 설계 문서가 생성되지 않았습니다.</p>
            </div>
          )}
        </div>
      </section>

      {showRawView && activeIteration && (
        <div className="genesis-json-overlay">
          <div className="overlay-header">
            <h3>SPECIFICATION SOURCE: Draft #{activeIteration.iteration_number}</h3>
            <button className="close-btn" onClick={() => setShowRawView(false)}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="code-window">
            <div className="code-content custom-scrollbar">
              <pre>
                {activeIteration.generated_draft_json ? (
                  renderJson(normalizeKeys(JSON.parse(activeIteration.generated_draft_json)))
                ) : (
                  <span className="token-null">No data available for this revision.</span>
                )}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SadOverview;
