import React, { useState } from 'react';
import { DocumentNode, LocalModule } from '../../types/project';
import { formatNodeTitle } from '../../utils/formatters';
import './PipelineCard.scss';

interface PipelineCardProps {
  node: DocumentNode;
  modules: LocalModule[];
  onRun: (nodeId: string) => void;
  onStop: (nodeId: string) => void;
  onResume: (nodeId: string) => void;
  onView: (node: DocumentNode) => void;
  onHITLAction: (nodeId: string, action: 'APPROVE' | 'RETRY') => void;
  onRetryLoop?: (nodeId: string, count: number) => void;
  onUpdateMaxIterations: (nodeId: string, maxIterations: number) => void;
  onDimensionsChange?: (nodeType: string, dimensions: { width: number, height: number }) => void;
  isLocked?: boolean;
  isRefinementMode?: boolean;
}

const PipelineCard: React.FC<PipelineCardProps> = ({ 
  node, 
  modules,
  onRun, 
  onStop,
  onResume,
  onView, 
  onHITLAction, 
  onRetryLoop,
  onUpdateMaxIterations,
  onDimensionsChange,
  isLocked = false,
  isRefinementMode = false
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isEditingMax, setIsEditingMax] = useState(false);
  const [tempMax, setTempMax] = useState(node.max_iterations);
  const [retryCount, setRetryCount] = useState(1);

  React.useLayoutEffect(() => {
    if (!containerRef.current || !onDimensionsChange) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        onDimensionsChange(node.target_node_type, { width, height });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [onDimensionsChange, node.target_node_type]);

  const handleUpdateMax = () => {
    onUpdateMaxIterations(node.node_id, tempMax);
    setIsEditingMax(false);
  };

  const getNodeConfig = (type: string) => {
    const configs: Record<string, { icon: string, agent: string }> = {
      'PRD': { icon: 'description', agent: 'SpecWriter-v4' },
      'FSD': { icon: 'settings_suggest', agent: 'System-Architect-v2' },
      'IA': { icon: 'schema', agent: 'Architect-Prime' },
      'User Flow': { icon: 'account_tree', agent: 'FlowDesigner-AI' },
      'ERD': { icon: 'database', agent: 'DB-Architect' },
      'Wireframe': { icon: 'grid_view', agent: 'UI-Gen-Pro' },
      'API_Spec': { icon: 'api', agent: 'Backend-Pilot' },
      'TC': { icon: 'task_alt', agent: 'QA-Validator' }
    };
    return configs[type] || { icon: 'help_outline', agent: 'AI-Agent' };
  };

  const getStatusConfig = (state: DocumentNode['node_state']) => {
    switch (state) {
      case 'PENDING':
        return { variant: 'is-pending', label: 'PENDING', active: false };
      case 'PAUSED_STOPPED':
        return { 
          icon: 'pause_circle', 
          label: 'Stopped', 
          color: '#cbd5e1' // Slate 300
        };
      case 'READY':
        return { variant: 'is-ready', label: 'READY', active: false };
      case 'IN_PROGRESS':
        return { variant: 'node-active', label: 'IN PROGRESS', active: true };
      case 'COMPLETED':
        return { variant: 'is-completed', label: 'COMPLETED', active: false };
      case 'PAUSED_HITL':
        return { variant: 'is-warning', label: 'WAITING', active: false };
      case 'PAUSED_API_ERROR':
        return { variant: 'is-error', label: 'ERROR', active: false };
      case 'STALE':
        return { variant: 'is-stale', label: 'STALE', active: false };
      case 'REFINING':
        return { variant: 'is-refining', label: 'REFINING', active: true };
      default:
        return { variant: 'is-pending', label: 'PENDING', active: false };
    }
  };

  const nodeConfig = getNodeConfig(node.target_node_type);
  const statusConfig = getStatusConfig(node.node_state);

  return (
    <div 
      className={`pipeline-node ${statusConfig.variant}`}
      onClick={() => onView(node)}
      style={{ cursor: 'pointer' }}
      ref={containerRef}
    >
      {/* Ports */}
      <div className="port port-in"></div>
      <div className="port port-out"></div>
      
      {/* Header */}
      <div className="pipeline-node__header">
        <div className="header-label-group">
          <div className="node-icon">
            <span className="material-symbols-outlined">{nodeConfig.icon}</span>
          </div>
          <span className="node-label">
            {formatNodeTitle(node, modules)}
          </span>
        </div>
        <div className="status-indicator">
          {statusConfig.active && <span className="pulse-dot"></span>}
          <span className="status-text">
            {statusConfig.label}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="pipeline-node__body">
        <div className="node-main-row">
          {/* Iteration Progress moved to where title was */}
          <div className="node-iteration-info">
            <div className="agent-info">
              <span className="label">AGENT:</span>
              <span className="value">{nodeConfig.agent}</span>
            </div>
            <div className="iteration-header">
              <span className="label">ITERATION PROGRESS</span>
              <div className="counter-container">
                {isEditingMax ? (
                  <input 
                    type="number" 
                    className="max-input inline"
                    value={tempMax} 
                    onChange={(e) => setTempMax(parseInt(e.target.value) || 1)}
                    onBlur={handleUpdateMax}
                    onKeyDown={(e) => e.key === 'Enter' && handleUpdateMax()}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <>
                    <span className="value">{node.current_iteration} / {node.max_iterations}</span>
                    {['PENDING', 'READY', 'PAUSED_HITL', 'PAUSED_API_ERROR'].includes(node.node_state) && !isLocked && (
                      <button 
                        className="edit-btn" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsEditingMax(true);
                        }}
                      >
                        <span className="material-symbols-outlined">edit</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="progress-track">
              <div 
                className="progress-fill" 
                style={{ width: `${(node.current_iteration / node.max_iterations) * 100}%` }}
              ></div>
            </div>
          </div>

          <div className="score-panel">
            <span className="label">SCORE</span>
            <span className="value">{node.current_best_score}</span>
          </div>
        </div>

        {isRefinementMode && node.node_state === 'PAUSED_HITL' && (
          <div className="refinement-info-panel">
            <div className="info-header">
              <span className="material-symbols-outlined">analytics</span>
              <span className="label">REFINE QUALITY</span>
            </div>
            <div className="quality-gauge">
              <div 
                className={`gauge-fill ${node.current_best_score < 80 ? 'low' : 'high'}`} 
                style={{ width: `${node.current_best_score}%` }}
              ></div>
            </div>
            {node.api_error_message && (
              <div className="refinement-error-msg">
                <span className="material-symbols-outlined">warning</span>
                <span>{node.api_error_message}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="pipeline-node__actions">
        {node.node_state === 'READY' && (
          <button 
            className="btn btn-primary" 
            disabled={isLocked || node.is_active}
            title={isLocked ? "다음 노드가 진행 중이므로 실행할 수 없습니다." : node.is_active ? "노드가 아직 종료 처리 중입니다." : ""}
            onClick={(e) => {
              e.stopPropagation();
              onRun(node.node_id);
            }}
          >
            <span className="material-symbols-outlined">{node.is_active ? 'hourglass_empty' : 'play_arrow'}</span> {node.is_active ? 'Stopping...' : 'Execute Node'}
          </button>
        )}

        {node.node_state === 'STALE' && (
          <button 
            className="btn btn-warning" 
            onClick={(e) => {
              e.stopPropagation();
              onRun(node.node_id);
            }}
          >
            <span className="material-symbols-outlined">update</span> Refine Node
          </button>
        )}

        {node.node_state === 'PAUSED_STOPPED' && (
          <button 
            className="btn btn-primary" 
            disabled={isLocked || node.is_active}
            title={isLocked ? "다음 노드가 진행 중이므로 재개할 수 없습니다." : node.is_active ? "노드가 아직 종료 처리 중입니다." : ""}
            onClick={(e) => {
              e.stopPropagation();
              onResume(node.node_id);
            }}
          >
            <span className="material-symbols-outlined">{node.is_active ? 'hourglass_empty' : 'settings_backup_restore'}</span> {node.is_active ? 'Stopping...' : 'Resume Node'}
          </button>
        )}
        
        {node.node_state === 'PAUSED_HITL' && (
          <div className="hitl-actions">
            {isRefinementMode ? (
              <div className="refinement-retry-control">
                <div className="retry-input-group">
                  <input 
                    type="number" 
                    min="1" 
                    max="5"
                    value={retryCount}
                    onChange={(e) => setRetryCount(parseInt(e.target.value) || 1)}
                    onClick={(e) => e.stopPropagation()}
                    className="retry-count-input"
                  />
                  <button 
                    className="btn btn-primary is-retry" 
                    disabled={isLocked || node.is_active}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onRetryLoop) onRetryLoop(node.node_id, retryCount);
                    }}
                  >
                    <span className="material-symbols-outlined">{node.is_active ? 'hourglass_empty' : 'refresh'}</span> 
                    {node.is_active ? 'Wait...' : 'Retry Patch'}
                  </button>
                </div>
                <button 
                  className="btn btn-primary is-confirm"
                  disabled={isLocked || node.is_active}
                  onClick={(e) => {
                    e.stopPropagation();
                    onHITLAction(node.node_id, 'APPROVE');
                  }}
                >
                  <span className="material-symbols-outlined">{node.is_active ? 'hourglass_empty' : 'done_all'}</span> 
                  {node.is_active ? 'Wait...' : 'Confirm Refinement'}
                </button>
              </div>
            ) : (
              <>
                <button 
                  className="btn btn-ghost is-pass"
                  disabled={isLocked || node.is_active}
                  onClick={(e) => {
                    e.stopPropagation();
                    onHITLAction(node.node_id, 'APPROVE');
                  }}
                >
                  <span className="material-symbols-outlined">{node.is_active ? 'hourglass_empty' : 'check'}</span> {node.is_active ? 'Wait...' : 'Pass'}
                </button>
                <button 
                  className="btn btn-primary is-retry" 
                  disabled={isLocked || node.is_active}
                  onClick={(e) => {
                    e.stopPropagation();
                    onHITLAction(node.node_id, 'RETRY');
                  }}
                >
                  <span className="material-symbols-outlined">{node.is_active ? 'hourglass_empty' : 'refresh'}</span> {node.is_active ? 'Wait...' : 'Retry'}
                </button>
              </>
            )}
          </div>
        )}

        {node.node_state === 'PAUSED_API_ERROR' && (
          <div className="status-actions">
            <button 
              className="btn btn-error" 
              onClick={(e) => {
                e.stopPropagation();
                onRun(node.target_node_type);
              }}
            >
              <span className="material-symbols-outlined">refresh</span> 
              Retry Cycle
            </button>
          </div>
        )}

        {node.node_state === 'IN_PROGRESS' && (
          <div className="status-actions">
            <button 
              className="btn btn-ghost is-stop" 
              onClick={(e) => {
                e.stopPropagation();
                onStop(node.node_id);
              }}
            >
              <span className="material-symbols-outlined">stop_circle</span> Stop
            </button>
          </div>
        )}

        {node.node_state === 'REFINING' && (
          <div className="status-actions">
            <button 
              className="btn btn-ghost is-stop" 
              onClick={(e) => {
                e.stopPropagation();
                onStop(node.node_id);
              }}
            >
              <span className="material-symbols-outlined">stop_circle</span> Stop Refinement
            </button>
          </div>
        )}

        {node.node_state === 'COMPLETED' && (
          <>
            <button 
              className="btn btn-square" 
              disabled={isLocked}
              onClick={(e) => {
                e.stopPropagation();
                onHITLAction(node.node_id, 'RETRY');
              }}
              title={isLocked ? "다음 노드가 진행 중이므로 작업할 수 없습니다." : "추가 이터레이션 돌리기"}
            >
              <span className="material-symbols-outlined">refresh</span>
            </button>
            <button 
              className="btn btn-ghost" 
              onClick={(e) => {
                e.stopPropagation();
                onView(node);
              }}
            >
              <span className="material-symbols-outlined">visibility</span> Inspect Output
            </button>
          </>
        )}
      </div>
      
      {node.api_error_message && (
        <div className="error-box">
          <span className="material-symbols-outlined">report</span>
          <p>{node.api_error_message}</p>
        </div>
      )}
    </div>
  );
};

export default PipelineCard;
