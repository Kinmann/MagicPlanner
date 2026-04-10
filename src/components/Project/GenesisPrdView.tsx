import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { Store } from '@tauri-apps/plugin-store';
import { DocumentNode } from '../../types/project';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import BaseModal from '../common/BaseModal';
import './GenesisPrdView.scss';

interface GenesisPrdViewProps {
  projectId: string;
  node: DocumentNode | null;
  onApprove: () => void;
  onRefresh: () => void;
  onUpdateMaxIterations: (nodeId: string, maxIterations: number) => void;
  isLocked?: boolean;
}

const GenesisPrdView: React.FC<GenesisPrdViewProps> = ({ 
  projectId, 
  node, 
  onApprove, 
  onRefresh, 
  onUpdateMaxIterations, 
  isLocked = false 
}) => {
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
        const sorted = [...iters].sort((a, b) => (b.calculated_score || 0) - (a.calculated_score || 0));
        setIterations(sorted);
        // is_pass=true인 유일한 항목을 선택
        const passIdx = sorted.findIndex((i: any) => i.is_pass);
        setSelectedIdx(passIdx >= 0 ? passIdx : -1);
        if (passIdx >= 0) {
          let rawData = sorted[passIdx].generated_draft_json;
          if (typeof rawData === 'string') {
            try { rawData = JSON.parse(rawData); } catch {}
          }
          setContent(normalizeKeys(rawData));
        }
      }
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  const loadContent = async () => {
    if (!node) return;
    try {
      const iters = await invoke<any[]>('get_node_iterations', { nodeId: node.node_id });
      if (iters && iters.length > 0) {
        const sorted = [...iters].sort((a, b) => (b.calculated_score || 0) - (a.calculated_score || 0));
        setIterations(sorted);

        // confirmed(is_pass=true) 항목이 있으면 그것을 선택, 없으면 선택 안 함
        const passIdx = sorted.findIndex((it: any) => it.is_pass);
        if (passIdx >= 0) {
          setSelectedIdx(passIdx);
          let rawData = sorted[passIdx].generated_draft_json;
          if (typeof rawData === 'string') {
            try { rawData = JSON.parse(rawData); } catch {}
          }
          setContent(normalizeKeys(rawData));
        } else {
          setSelectedIdx(-1);
          setContent(null);
        }
      } else {
        setIterations([]);
        setSelectedIdx(-1);
        setContent(null);
      }
    } catch {}
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

  React.useEffect(() => { loadContent(); }, [node?.node_id]);

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

  return (
    <div className="genesis-prd-view">

      {/* 2. Document Header & Generation Controls */}
      <div className="genesis-prd-view__header-row">
        <div className="header-info">
          <div className="title-group">
            <h1>Genesis PRD</h1>
            {node && (
              <span className={`status-badge status-badge--${node.node_state.toLowerCase().replace('_', '-')}`}>
                {node.node_state.replace('_', ' ')}
              </span>
            )}
          </div>
          <p className="description">
            프로젝트의 비전, Epic/Feature 계층, 기술 스택을 정의하는 최상위 기획서입니다.
          </p>

        </div>

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
                onBlur={() => node && !isLocked && onUpdateMaxIterations(node.node_id, tempMax)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && node && !isLocked) {
                    onUpdateMaxIterations(node.node_id, tempMax);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                disabled={loading || isLocked}
                title={isLocked ? "다음 단계가 진행 중이므로 수정할 수 없습니다." : ""}
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
                disabled={loading || isLocked || node?.node_state === 'IN_PROGRESS'} 
                variant={(isPausedHitl || isCompleted) ? "secondary" : "primary"}
                isLoading={loading || node?.node_state === 'IN_PROGRESS'}
                leftIcon={<span className="material-symbols-outlined">auto_fix</span>}
                title={isLocked ? "다음 단계가 진행 중이므로 새로운 생성을 시작할 수 없습니다." : ""}
              >
                {(loading || node?.node_state === 'IN_PROGRESS') ? '진행 중' : ((isPausedHitl || isCompleted) ? 'Regenerate' : '생성 시작')}
              </Button>
            )}

            {(isPausedHitl || isCompleted) && (
              <Button 
                onClick={handleApprove} 
                disabled={loading || isLocked} 
                variant="primary" 
                className="proceed-btn"
                rightIcon={<span className="material-symbols-outlined">arrow_forward</span>}
                title={isLocked ? "이미 다음 단계로 진행되었습니다." : ""}
              >
                Proceed to SAD
              </Button>
            )}

            {isPausedStopped && (
              <Button 
                onClick={handleResume} 
                disabled={loading || isLocked}
                variant="primary"
                title={isLocked ? "다음 단계가 진행 중이므로 재개할 수 없습니다." : ""}
              >
                Resume Pipeline
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

      {/* Status Message Overlay-like placement if needed, or inline */}
      {statusMsg && (
        <div className="genesis-prd-view__status-msg">
          <Spinner size="sm" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* v2: Modernized Revision History (Matching SAD) */}
      {iterations.length > 0 && (
        <div className="revisions-horizontal">
          <div className="revisions-header">
            <div className="left">
              <span className="material-symbols-outlined">history</span>
              <span>Revision History</span>
            </div>
            <button className="raw-toggle" onClick={() => setShowRawView(!showRawView)}>
              <span className="material-symbols-outlined">
                {showRawView ? 'dashboard' : 'code'}
              </span>
              {showRawView ? 'Visual' : 'RAW SPEC'}
            </button>
          </div>
          <div className="revisions-list custom-scrollbar">
            {iterations.map((it, idx) => (
              <div 
                key={it.iteration_id} 
                className={`revision-btn ${selectedIdx === idx ? 'active' : ''} ${it.is_pass ? 'confirmed' : ''}`}
                onClick={() => selectIteration(idx)}
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

          {/* Draft 확정 버튼 하단 배치 */}
          {iterations[selectedIdx] && !iterations[selectedIdx].is_pass && (
            <div className="revisions-action" style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem', paddingRight: '0.25rem' }}>
              <Button
                onClick={() => handleConfirmIteration(selectedIdx)}
                disabled={loading || isLocked}
                variant="secondary"
                leftIcon={<span className="material-symbols-outlined">check_circle</span>}
              >
                Draft 확정
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 3. Main Bento Grid / Raw Viewer */}
      {content && (
        <motion.div 
          className="genesis-prd-view__bento-grid"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Project Overview (col-span-8) */}
          <div className="bento-card bento-card--overview intent-strip-primary">
            <div className="card-header">
              <h2 className="card-title">
                <span className="material-symbols-outlined icon">rocket_launch</span>
                Project: {content.metadata?.project_name || 'Vision'}
              </h2>
              {content.metadata?.version && <span className="version-tag">v{content.metadata.version}</span>}
            </div>
            
            <div className="overview-content">
              <div className="main-info">
                <div className="info-group">
                  <h3>Product Vision</h3>
                  <p>{content.business_context?.product_vision || 'N/A'}</p>
                </div>
                <div className="info-group">
                  <h3>Target Market</h3>
                  <p>{content.business_context?.target_market || 'N/A'}</p>
                </div>
              </div>
              
              <div className="metrics-box">
                <h3>Success Metrics</h3>
                <ul className="metrics-list">
                  {content.business_context?.success_metrics?.map((m: string, i: number) => (
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
                  {content.global_constraints?.compliance?.map((c: string, i: number) => (
                    <span key={i} className="tag">{c}</span>
                  ))}
                </div>
              </div>
              <div className="constraint-group">
                <h3>Performance</h3>
                <p>{content.global_constraints?.performance?.join(', ') || 'Standard'}</p>
              </div>
              <div className="constraint-group">
                <h3>Integration</h3>
                <p>{content.global_constraints?.legacy_integrations?.join(', ') || 'Standalone'}</p>
              </div>
            </div>
          </div>

          {/* Persona Mapping (col-span-12) */}
          <div className="bento-card bento-card--personas">
            <h2 className="card-title">System Persona Mapping</h2>
            <div className="personas-grid">
              {content.user_roles?.map((role: any, i: number) => (
                <div key={i} className="persona-chip">
                  <div className="persona-header">
                    <span className="material-symbols-outlined icon">
                      {role.permissions_level === 'ADMIN' ? 'admin_panel_settings' : 
                       role.permissions_level === 'MANAGER' ? 'hub' : 'person'}
                    </span>
                    <div className="persona-info">
                      <span className="name">{role.role_name}</span>
                      <span className="role-id">{role.role_id || 'N/A'}</span>
                    </div>
                  </div>
                  <span className="badge">{role.permissions_level}</span>
                </div>
              ))}
            </div>
          </div>

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
                        <span className="material-symbols-outlined">
                          {epic.epic_id.includes('SEC') ? 'security' : 
                           epic.epic_id.includes('PROJ') ? 'task' : 'description'}
                        </span>
                      </div>
                      <div className="epic-text">
                        <h3>{epic.title}</h3>
                        <div className="epic-meta">
                          <span className="epic-id">{epic.epic_id}</span>
                          <span className="ac-count">
                            <span className="material-symbols-outlined">fact_check</span>
                            {epic.acceptance_criteria?.length || 0} Acceptance Criteria
                          </span>
                          <span className="role-count">
                            <span className="material-symbols-outlined">groups</span>
                            {epic.target_roles?.length || 0} Impacted Roles
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

          <div className="bento-card bento-card--tech intent-strip-primary">
            <h2 className="card-title">Core Technology Stack</h2>
            <div className="tech-grid">
              {/* Frontend */}
              <div className="tech-category">
                <div className="category-header">
                  <span className="material-symbols-outlined">splitscreen</span>
                  <span className="name">Frontend</span>
                </div>
                <div className="category-body">
                  <div className="category-main">
                    <span className="label">Framework</span>
                    <span className="value">{content.tech_stack?.frontend?.framework || 'React'}</span>
                  </div>
                  <div className="category-subs">
                    <div className="sub-item">
                      <span className="label">State Mgmt</span>
                      <span className="value">{content.tech_stack?.frontend?.state_management || 'Context/Hooks'}</span>
                    </div>
                    <div className="sub-item">
                      <span className="label">UI Library</span>
                      <span className="value">{content.tech_stack?.frontend?.ui_library || 'Material UI'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Backend */}
              <div className="tech-category">
                <div className="category-header">
                  <span className="material-symbols-outlined">dns</span>
                  <span className="name">Backend</span>
                </div>
                <div className="category-body">
                  <div className="category-main">
                    <span className="label">Framework</span>
                    <span className="value">{content.tech_stack?.backend?.framework || 'Node.js'}</span>
                  </div>
                  <div className="category-subs">
                    <div className="sub-item">
                      <span className="label">Language</span>
                      <span className="value">{content.tech_stack?.backend?.language_version || 'TypeScript 5.x'}</span>
                    </div>
                    <div className="sub-item">
                      <span className="label">Runtime</span>
                      <span className="value">{content.tech_stack?.backend?.runtime || 'Bun'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Database */}
              <div className="tech-category">
                <div className="category-header">
                  <span className="material-symbols-outlined">database</span>
                  <span className="name">Database</span>
                </div>
                <div className="category-body">
                  <div className="category-main">
                    <span className="label">Primary</span>
                    <span className="value">{content.tech_stack?.database?.primary || 'PostgreSQL'}</span>
                  </div>
                  <div className="category-subs">
                    <div className="sub-item">
                      <span className="label">Caching</span>
                      <span className="value">{content.tech_stack?.database?.caching || 'Redis'}</span>
                    </div>
                    <div className="sub-item">
                      <span className="label">Vector DB</span>
                      <span className="value">{content.tech_stack?.database?.vector_db || 'Pinecone'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Model */}
              <div className="tech-category">
                <div className="category-header">
                  <span className="material-symbols-outlined">psychology</span>
                  <span className="name">AI Model</span>
                </div>
                <div className="category-body">
                  <div className="category-main">
                    <span className="label">Model Family</span>
                    <span className="value">{content.tech_stack?.ai_model_spec?.model_family || 'Gemini'}</span>
                  </div>
                  <div className="category-subs">
                    <div className="sub-item">
                      <span className="label">Version</span>
                      <span className="value">{content.tech_stack?.ai_model_spec?.version || '2.0 Ultra'}</span>
                    </div>
                    <div className="sub-item">
                      <span className="label">Temperature</span>
                      <span className="value">{content.tech_stack?.ai_model_spec?.temperature || '0.7'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Infrastructure */}
              <div className="tech-category">
                <div className="category-header">
                  <span className="material-symbols-outlined">cloud_circle</span>
                  <span className="name">Infrastructure</span>
                </div>
                <div className="category-body">
                  <div className="category-main">
                    <span className="label">API Type</span>
                    <span className="value">{content.tech_stack?.infrastructure?.api_type || 'REST/gRPC'}</span>
                  </div>
                  <div className="category-subs">
                    <div className="sub-item">
                      <span className="label">Auth</span>
                      <span className="value">{content.tech_stack?.infrastructure?.auth_protocol || 'OAuth 2.1'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
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
          
        </motion.div>
      )}

      {showRawView && content && (
        <div className="genesis-json-overlay">
          <div className="overlay-header">
            <h3>Genesis PRD Raw Specification</h3>
            <button className="close-btn" onClick={() => setShowRawView(false)}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="code-window">
            <div className="code-content">
              <pre>{renderJson(content)}</pre>
            </div>
          </div>
        </div>
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
