import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { Store } from '@tauri-apps/plugin-store';
import { DocumentNode } from '../../types/project';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import './GenesisPrdView.scss';

interface GenesisPrdViewProps {
  projectId: string;
  node: DocumentNode | null;
  onApprove: () => void;
  onRefresh: () => void;
  onUpdateMaxIterations: (nodeId: string, maxIterations: number) => void;
}

const GenesisPrdView: React.FC<GenesisPrdViewProps> = ({ projectId, node, onApprove, onRefresh, onUpdateMaxIterations }) => {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<any>(null);
  const [iterations, setIterations] = useState<any[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    setStatusMsg('Genesis PRD 생성 중...');
    try {
      const store = await Store.load('settings.json');
      const apiKeyValue = await store.get<{ value: string }>('gemini_api_key');
      if (!apiKeyValue?.value) throw new Error('API 키가 설정되지 않았습니다.');

      await invoke<string>('run_genesis_prd_pipeline', {
        projectId,
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

  const loadContent = async () => {
    if (!node) return;
    try {
      const iters = await invoke<any[]>('get_node_iterations', { nodeId: node.node_id });
      if (iters && iters.length > 0) {
        // 기본값: 최고점 순으로 정렬하여 표시
        const sorted = [...iters].sort((a, b) => (b.calculated_score || 0) - (a.calculated_score || 0));
        setIterations(sorted);
        setSelectedIdx(0);
        try { setContent(JSON.parse(sorted[0].generated_draft_json)); } catch { setContent(sorted[0].generated_draft_json); }
      }
    } catch {}
  };

  const selectIteration = (idx: number) => {
    setSelectedIdx(idx);
    const item = iterations[idx];
    if (item) {
      try { setContent(JSON.parse(item.generated_draft_json)); } catch { setContent(item.generated_draft_json); }
    }
  };

  React.useEffect(() => { loadContent(); }, [node?.node_id]);

  const isReady = node?.node_state === 'READY';
  const isPausedHitl = node?.node_state === 'PAUSED_HITL';
  const isCompleted = node?.node_state === 'COMPLETED';

  return (
    <div className="genesis-prd-view">
      <div className="genesis-prd-view__header">
        <div className="genesis-prd-view__title">
          <span className="material-symbols-outlined icon">rocket_launch</span>
          <h2>Genesis PRD</h2>
          {node && (
            <span className={`state-badge state-badge--${node.node_state.toLowerCase().replace('_', '-')}`}>
              {node.node_state.replace('_', ' ')}
            </span>
          )}
        </div>
        <p className="genesis-prd-view__desc">
          프로젝트의 비전, Epic/Feature 계층, 기술 스택을 정의하는 최상위 기획서입니다.
        </p>
      </div>

      {error && (
        <div className="genesis-prd-view__error">
          <span className="material-symbols-outlined">error</span>
          {error}
        </div>
      )}

      {statusMsg && (
        <div className="genesis-prd-view__status">
          <Spinner size="sm" />
          <span>{statusMsg}</span>
        </div>
      )}

      <div className="genesis-prd-view__actions">
        <div className="iteration-control">
          <label>Max Iterations:</label>
          <input 
            type="number" 
            value={node?.max_iterations || 10} 
            min="1" 
            max="20"
            onChange={(e) => node && onUpdateMaxIterations(node.node_id, parseInt(e.target.value))}
          />
        </div>
        {(isReady || node?.node_state === 'PAUSED_API_ERROR') && (
          <Button onClick={handleRun} disabled={loading}>
            {loading ? <><Spinner size="sm" /> 생성 중...</> : <><span className="material-symbols-outlined">play_arrow</span> Genesis PRD 생성</>}
          </Button>
        )}
        {(isPausedHitl || isCompleted) && (
          <div className="action-buttons">
            <Button onClick={handleApprove} disabled={loading} variant="primary">
              <span className="material-symbols-outlined">check</span> {isCompleted ? '이 문서로 SAD 진행' : '승인 → SAD 진행'}
            </Button>
            <Button onClick={handleRun} disabled={loading} variant="secondary">
              <span className="material-symbols-outlined">refresh</span> 재생성
            </Button>
          </div>
        )}
      </div>

      {iterations.length > 0 && (
        <div className="iteration-selector">
          <h3 className="selector-title">Generated Documents:</h3>
          <div className="iteration-tabs">
            {iterations.map((it, idx) => (
              <button 
                key={idx} 
                className={`iteration-tab ${selectedIdx === idx ? 'active' : ''}`}
                onClick={() => selectIteration(idx)}
              >
                Draft #{idx + 1} ({it.calculated_score}점)
              </button>
            ))}
          </div>
        </div>
      )}

      {content && (
        <motion.div 
          className="genesis-prd-view__content"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {typeof content === 'object' ? (
            <div className="genesis-prd-view__grid">
              
              {/* 1. Metadata & Business Context */}
              <div className="info-section full-width">
                <div className="section-header">
                  <span className="material-symbols-outlined">info</span>
                  <h3>Project Overview</h3>
                  {content.metadata?.version && <span className="version-tag">v{content.metadata.version}</span>}
                  {content.metadata?.status && <span className={`status-tag status-${content.metadata.status.toLowerCase()}`}>{content.metadata.status}</span>}
                </div>
                <div className="overview-container">
                  <div className="overview-item main">
                    <h4>프로젝트명</h4>
                    <p className="highlight-text">{content.metadata?.project_name || 'N/A'}</p>
                  </div>
                  <div className="overview-item">
                    <h4>제품 비전</h4>
                    <p>{content.business_context?.product_vision || 'N/A'}</p>
                  </div>
                  <div className="overview-item">
                    <h4>타겟 시장</h4>
                    <p>{content.business_context?.target_market || 'N/A'}</p>
                  </div>
                  {content.business_context?.success_metrics && (
                    <div className="overview-item">
                      <h4>성공 지표</h4>
                      <div className="metrics-list">
                        {content.business_context.success_metrics.map((m: string, i: number) => (
                          <div key={i} className="metric-chip">{m}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. User Roles */}
              {content.user_roles && (
                <div className="info-section">
                  <div className="section-header">
                    <span className="material-symbols-outlined">groups</span>
                    <h3>User Roles</h3>
                  </div>
                  <div className="roles-grid">
                    {content.user_roles.map((role: any, i: number) => (
                      <div key={i} className="role-card">
                        <div className="role-header">
                          <span className="role-id">{role.role_id}</span>
                          <span className={`perm-badge perm-${role.permissions_level?.toLowerCase()}`}>
                            {role.permissions_level}
                          </span>
                        </div>
                        <p className="role-name">{role.role_name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Global Constraints */}
              {content.global_constraints && (
                <div className="info-section">
                  <div className="section-header">
                    <span className="material-symbols-outlined">gavel</span>
                    <h3>Constraints</h3>
                  </div>
                  <div className="constraints-content">
                    <div className="sub-section">
                      <h4>Compliance</h4>
                      <ul>{content.global_constraints.compliance?.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>
                    </div>
                    <div className="sub-section">
                      <h4>Performance</h4>
                      <ul>{content.global_constraints.performance?.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
                    </div>
                    {content.global_constraints.legacy_integrations?.length > 0 && (
                      <div className="sub-section">
                        <h4>Integrations</h4>
                        <div className="tags">
                          {content.global_constraints.legacy_integrations.map((lt: string, i: number) => <span key={i} className="tag">{lt}</span>)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 4. Core Epics */}
              {content.core_epics && (
                <div className="info-section full-width">
                  <div className="section-header">
                    <span className="material-symbols-outlined">account_tree</span>
                    <h3>Core Epics</h3>
                  </div>
                  <div className="epics-container">
                    {content.core_epics.map((epic: any, i: number) => (
                      <div key={i} className="epic-card">
                        <div className="epic-header">
                          <span className="epic-id">{epic.epic_id}</span>
                          <h4>{epic.title}</h4>
                        </div>
                        <p className="epic-desc">{epic.description}</p>
                        <div className="epic-footer">
                          <div className="target-roles">
                            {epic.target_roles?.map((r: string, j: number) => <span key={j} className="role-ref">{r}</span>)}
                          </div>
                          {epic.acceptance_criteria && (
                            <div className="ac-trigger">
                              <span className="ac-count">AC: {epic.acceptance_criteria.length} items</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. Tech Stack */}
              {content.tech_stack && (
                <div className="info-section full-width">
                  <div className="section-header">
                    <span className="material-symbols-outlined">settings_input_component</span>
                    <h3>Technology Stack</h3>
                  </div>
                  <div className="tech-stack-grid">
                    <div className="tech-group">
                      <h5>Frontend</h5>
                      <p><strong>{content.tech_stack.frontend?.framework}</strong></p>
                      <small>State: {content.tech_stack.frontend?.state_management}</small>
                      {content.tech_stack.frontend?.ui_library && <small>UI: {content.tech_stack.frontend.ui_library}</small>}
                    </div>
                    <div className="tech-group">
                      <h5>Backend</h5>
                      <p><strong>{content.tech_stack.backend?.runtime}</strong> ({content.tech_stack.backend?.framework})</p>
                      {content.tech_stack.backend?.language_version && <small>Ver: {content.tech_stack.backend.language_version}</small>}
                    </div>
                    <div className="tech-group">
                      <h5>Database</h5>
                      <p>Primary: {content.tech_stack.database?.primary}</p>
                      <p>Vector: {content.tech_stack.database?.vector_db}</p>
                      {content.tech_stack.database?.caching && <small>Cache: {content.tech_stack.database.caching}</small>}
                    </div>
                    <div className="tech-group">
                      <h5>Infrastructure</h5>
                      <p>Platform: {content.tech_stack.infrastructure?.platform}</p>
                      <p>Container: {content.tech_stack.infrastructure?.containerization}</p>
                    </div>
                    <div className="tech-group">
                      <h5>AI Specification</h5>
                      <p>Model: {content.tech_stack.ai_model_spec?.model_family}</p>
                      <small>Ver: {content.tech_stack.ai_model_spec?.version}</small>
                      {content.tech_stack.ai_model_spec?.temperature !== undefined && <small>Temp: {content.tech_stack.ai_model_spec.temperature}</small>}
                    </div>
                    <div className="tech-group">
                      <h5>Protocols</h5>
                      <p>API: {content.tech_stack.interface_protocols?.api_type}</p>
                      <p>Auth: {content.tech_stack.interface_protocols?.auth_protocol}</p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          ) : (
            <pre className="raw-content">{typeof content === 'string' ? content : JSON.stringify(content, null, 2)}</pre>
          )}
        </motion.div>
      )}

      {!content && !loading && isReady && (
        <div className="genesis-prd-view__empty">
          <span className="material-symbols-outlined">description</span>
          <p>위 버튼을 클릭하여 Genesis PRD를 생성하세요.</p>
        </div>
      )}
    </div>
  );
};

export default GenesisPrdView;
