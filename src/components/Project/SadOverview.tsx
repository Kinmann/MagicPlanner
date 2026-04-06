import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { Store } from '@tauri-apps/plugin-store';
import { GlobalContext, CONTEXT_TYPE_LABELS, DocumentNode, GenerationIteration } from '../../types/project';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import './SadOverview.scss';

interface SadOverviewProps {
  projectId: string;
  node: DocumentNode | null;
  onModulesCreated: () => void;
  onRefresh: () => void;
  onUpdateMaxIterations: (nodeId: string, maxIterations: number) => void;
}

const SadOverview: React.FC<SadOverviewProps> = ({ projectId, node, onModulesCreated, onRefresh, onUpdateMaxIterations }) => {
  const [contexts, setContexts] = useState<GlobalContext[]>([]);
  const [iterations, setIterations] = useState<GenerationIteration[]>([]);
  const [selectedIterId, setSelectedIterId] = useState<string | null>(null);
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
    if (!node?.node_id) return;
    try {
      const result = await invoke<GenerationIteration[]>('get_node_iterations', { nodeId: node.node_id });
      setIterations(result);
      // 초기값 설정: 데이터가 있으면 가장 최신 항목 선택
      if (result.length > 0 && !selectedIterId) {
        setSelectedIterId(result[result.length - 1].iteration_id);
      }
    } catch {}
  };

  useEffect(() => { 
    fetchContexts(); 
    fetchIterations();
  }, [projectId, node?.node_id]);

  const handleRunSad = async () => {
    setLoading(true);
    setError(null);
    try {
      const store = await Store.load('settings.json');
      const apiKeyValue = await store.get<{ value: string }>('gemini_api_key');
      if (!apiKeyValue?.value) throw new Error('API 키가 설정되지 않았습니다.');
      
      await invoke('run_sad_pipeline', { projectId, apiKey: apiKeyValue.value });
      await fetchContexts();
      await fetchIterations();
      onRefresh();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmIteration = async () => {
    if (!selectedIterId) return;
    setLoading(true);
    try {
      await invoke('confirm_sad_iteration', { projectId, iterationId: selectedIterId });
      await fetchContexts();
      // 성공 피드백 (간이)
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

  const isReady = node?.node_state === 'READY';
  const isPausedHitl = node?.node_state === 'PAUSED_HITL';

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

  // 선택된 대상을 기준으로 렌더링할 데이터 결정
  const activeIteration = iterations.find(it => it.iteration_id === selectedIterId);
  const displayContexts = selectedIterId === 'OFFICIAL' || !activeIteration
    ? contexts
    : (() => {
        try {
          const bundle = JSON.parse(activeIteration.generated_draft_json);
          return Object.entries(bundle).map(([type, data]) => ({
            context_id: `temp-${type}`,
            project_id: projectId,
            context_type: type,
            context_data_json: typeof data === 'string' ? data : JSON.stringify(data),
            version: activeIteration.iteration_number,
            created_at: activeIteration.created_at,
            updated_at: activeIteration.updated_at
          })) as GlobalContext[];
        } catch { return contexts; }
      })();

  return (
    <div className="sad-overview">
      <div className="sad-overview__header">
        <div className="sad-overview__title">
          <span className="material-symbols-outlined icon">architecture</span>
          <h2>시스템 아키텍처 문서 (SAD)</h2>
          {node && (
            <span className={`state-badge state-badge--${node.node_state.toLowerCase().replace('_', '-')}`}>
              {node.node_state.replace('_', ' ')}
            </span>
          )}
        </div>
        <p className="sad-overview__desc">글로벌 컨텍스트 5종 + 모듈 분할 명세 3종을 순차 생성합니다.</p>
      </div>

      {error && (
        <div className="sad-overview__error">
          <span className="material-symbols-outlined">error</span>
          {error}
        </div>
      )}

      {(iterations.length > 0 || (selectedIterId === 'OFFICIAL' && displayContexts.length > 0)) && (
        <div className="sad-overview__history">
          <div className="iteration-tabs">
            <button
              className={`iteration-tab ${selectedIterId === 'OFFICIAL' ? 'active' : ''}`}
              onClick={() => setSelectedIterId('OFFICIAL')}
            >
              <div className="iteration-tab__num">OFFICIAL</div>
              <div className="iteration-tab__score">확정 설계</div>
            </button>
            {iterations.map((it) => {
              const stage = it.iteration_number > 100 ? 2 : 1;
              const num = it.iteration_number > 100 ? it.iteration_number - 100 : it.iteration_number;
              return (
                <button
                  key={it.iteration_id}
                  className={`iteration-tab ${selectedIterId === it.iteration_id ? 'active' : ''}`}
                  onClick={() => setSelectedIterId(it.iteration_id)}
                >
                  <div className="iteration-tab__num">Draft #{num}</div>
                  <div className="iteration-tab__score">
                    Stage {stage} ({it.calculated_score}점)
                  </div>
                </button>
              );
            })}
          </div>

          <div className="iteration-detail-box">
            {selectedIterId === 'OFFICIAL' ? (
              <div className="official-notice">
                <span className="material-symbols-outlined">verified</span>
                <p>현재 확정된 설계안을 확인하고 있습니다.</p>
              </div>
            ) : activeIteration && (
              <>
                {activeIteration.actionable_feedback_text && (
                  <div className="iteration-feedback">
                    <span className="material-symbols-outlined">info</span>
                    <div className="feedback-content">
                      <strong>AI 피드백:</strong>
                      <p>{activeIteration.actionable_feedback_text}</p>
                    </div>
                  </div>
                )}
                {activeIteration.critical_errors_array && (
                  <div className="iteration-errors">
                    <span className="material-symbols-outlined">report</span>
                    <div className="errors-content">
                      <strong>개선 필요 사항:</strong>
                      <p>
                        {(() => {
                          try {
                            const parsed = JSON.parse(activeIteration.critical_errors_array);
                            return Array.isArray(parsed) ? parsed.join(', ') : activeIteration.critical_errors_array;
                          } catch {
                            return activeIteration.critical_errors_array;
                          }
                        })()}
                      </p>
                    </div>
                  </div>
                )}
                {isPausedHitl && (
                  <div className="iteration-confirm">
                    <Button onClick={handleConfirmIteration} disabled={loading} size="sm" variant="secondary">
                      <span className="material-symbols-outlined">check_circle</span>
                      이 회차를 공식 설계로 확정
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="sad-overview__actions">
        {node?.node_state !== 'COMPLETED' && (
          <div className="iteration-control">
            <label>Max Iterations:</label>
            <input 
              type="number" 
              value={node?.max_iterations || 5} 
              min="1" 
              max="10" 
              onChange={(e) => node && onUpdateMaxIterations(node.node_id, parseInt(e.target.value))}
            />
          </div>
        )}
        {node?.node_state !== 'IN_PROGRESS' && node?.node_state !== 'COMPLETED' && (
          <Button onClick={handleRunSad} disabled={loading} variant={isPausedHitl ? 'ghost' : 'primary'}>
            {loading ? (
              <><Spinner size="sm" /> SAD 생성 중...</>
            ) : (
              <>
                <span className="material-symbols-outlined">{isPausedHitl ? 'refresh' : 'play_arrow'}</span>
                {isPausedHitl ? 'SAD 다시 생성' : 'SAD 8종 생성'}
              </>
            )}
          </Button>
        )}
        {isPausedHitl && (
          <Button onClick={handleCreateModules} disabled={loading} variant="primary">
            <span className="material-symbols-outlined">check</span> 승인 → 모듈 생성
          </Button>
        )}
      </div>

      {displayContexts.length > 0 && (
        <div className="sad-overview__grid">
          {displayContexts.map((ctx, idx) => (
            <motion.div
              key={ctx.context_id}
              className={`sad-card ${expandedCtx === ctx.context_id ? 'expanded' : ''}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => setExpandedCtx(expandedCtx === ctx.context_id ? null : ctx.context_id)}
            >
              <div className="sad-card__header">
                <span className="material-symbols-outlined sad-card__icon">{getCtxIcon(ctx.context_type)}</span>
                <span className="sad-card__name">{CONTEXT_TYPE_LABELS[ctx.context_type] || ctx.context_type}</span>
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
          ))}
        </div>
      )}

      {contexts.length === 0 && !loading && isReady && (
        <div className="sad-overview__empty">
          <span className="material-symbols-outlined">architecture</span>
          <p>위 버튼을 클릭하여 SAD를 생성하세요.</p>
        </div>
      )}
    </div>
  );
};

export default SadOverview;
