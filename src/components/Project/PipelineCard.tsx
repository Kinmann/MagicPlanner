import React, { useState } from 'react';
import { DocumentNode } from '../../types/project';
import './PipelineCard.scss';

interface PipelineCardProps {
  node: DocumentNode;
  onRun: (nodeType: string) => void;
  onView: (node: DocumentNode) => void;
  onHITLAction: (nodeId: string, action: 'APPROVE' | 'RETRY') => void;
  onUpdateMaxIterations: (nodeId: string, maxIterations: number) => void;
  onDimensionsChange?: (nodeType: string, dimensions: { width: number, height: number }) => void;
}

const PipelineCard: React.FC<PipelineCardProps> = ({ 
  node, 
  onRun, 
  onView, 
  onHITLAction, 
  onUpdateMaxIterations,
  onDimensionsChange 
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isEditingMax, setIsEditingMax] = useState(false);
  const [tempMax, setTempMax] = useState(node.max_iterations);

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
            {node.target_node_type} Node
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
                    {(node.node_state === 'PENDING' || node.node_state === 'READY') && (
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
      </div>

      {/* Actions */}
      <div className="pipeline-node__actions">
        {node.node_state === 'READY' && (
          <button 
            className="btn btn-primary" 
            onClick={(e) => {
              e.stopPropagation();
              onRun(node.target_node_type);
            }}
          >
            <span className="material-symbols-outlined">play_arrow</span> Execute Node
          </button>
        )}
        
        {node.node_state === 'PAUSED_HITL' && (
          <div className="flex gap-2 w-full">
            <button 
              className="btn btn-secondary" 
              onClick={(e) => {
                e.stopPropagation();
                onHITLAction(node.node_id, 'RETRY');
              }}
            >
              Retry
            </button>
            <button 
              className="btn btn-primary font-black" 
              onClick={(e) => {
                e.stopPropagation();
                onHITLAction(node.node_id, 'APPROVE');
              }}
            >
              Pass
            </button>
          </div>
        )}

        {(node.node_state === 'PAUSED_API_ERROR' || node.node_state === 'IN_PROGRESS') && (
          <button 
            className="btn btn-error" 
            onClick={(e) => {
              e.stopPropagation();
              onRun(node.target_node_type);
            }}
          >
            <span className="material-symbols-outlined">refresh</span> 
            {node.node_state === 'IN_PROGRESS' ? 'Force Reboot' : 'Retry Cycle'}
          </button>
        )}

        {node.node_state === 'COMPLETED' && (
          <button 
            className="btn btn-ghost" 
            onClick={(e) => {
              e.stopPropagation();
              onView(node);
            }}
          >
            <span className="material-symbols-outlined">visibility</span> Inspect Output
          </button>
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
