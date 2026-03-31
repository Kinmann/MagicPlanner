import React from 'react';
import { DocumentNode } from '../../types/project';
import { Play, CheckCircle2, Circle, Loader2, AlertCircle, PauseCircle, RefreshCw } from 'lucide-react';
import './PipelineCard.scss';

interface PipelineCardProps {
  node: DocumentNode;
  onRun: (nodeType: string) => void;
  onView: (node: DocumentNode) => void;
  onHITLAction: (nodeId: string, action: 'APPROVE' | 'RETRY') => void;
}

const PipelineCard: React.FC<PipelineCardProps> = ({ node, onRun, onView, onHITLAction }) => {
  const getStatusConfig = (state: DocumentNode['node_state']) => {
    switch (state) {
      case 'PENDING':
        return { variant: 'pending', icon: <Circle size={14} />, label: '대기 중' };
      case 'READY':
        return { variant: 'ready', icon: <Play size={14} />, label: '시작 가능' };
      case 'IN_PROGRESS':
        return { variant: 'in-progress', icon: <Loader2 size={14} className="spinning" />, label: '생성 중' };
      case 'COMPLETED':
        return { variant: 'completed', icon: <CheckCircle2 size={14} />, label: '완료됨' };
      case 'PAUSED_HITL':
        return { variant: 'hitl', icon: <PauseCircle size={14} />, label: '품질 미달(HITL)' };
      case 'PAUSED_API_ERROR':
        return { variant: 'error', icon: <AlertCircle size={14} />, label: 'API 에러' };
      default:
        return { variant: 'pending', icon: <Circle size={14} />, label: '-' };
    }
  };

  const config = getStatusConfig(node.node_state);

  return (
    <div className={`pipeline-card ${config.variant}`}>
      <div className="card-header">
        <h3>{node.target_node_type}</h3>
        <span className="status">
          {config.icon}
          {config.label}
        </span>
      </div>

      <div className="metrics-section">
        <div className="metric-label">
          <span>최종 점수</span>
          <span className={`value ${node.current_best_score >= 85 ? 'high' : ''}`}>
            {node.current_best_score} / 100
          </span>
        </div>
        <div className="progress-bar">
          <div 
            className={`fill ${node.current_best_score >= 85 ? 'success' : ''}`}
            style={{ width: `${node.current_best_score}%` }}
          />
        </div>
        <div className="sub-metric">
          <span>반복 횟수</span>
          <span>{node.current_iteration} / {node.max_iterations}</span>
        </div>
      </div>

      <div className="card-actions">
        {node.node_state === 'READY' && (
          <button
            onClick={() => onRun(node.target_node_type)}
            className="btn primary"
          >
            <Play size={12} fill="currentColor" />
            실행
          </button>
        )}
        
        {node.node_state === 'PAUSED_HITL' && (
          <div className="grid-2">
            <button
              onClick={() => onHITLAction(node.node_id, 'RETRY')}
              className="btn primary"
            >
              <RefreshCw size={12} />
              재시도
            </button>
            <button
              onClick={() => onHITLAction(node.node_id, 'APPROVE')}
              className="btn success"
            >
              <CheckCircle2 size={12} />
              강제 승인
            </button>
          </div>
        )}

        {(node.node_state === 'PAUSED_API_ERROR' || node.node_state === 'IN_PROGRESS') && (
          <button
            onClick={() => onRun(node.target_node_type)}
            className="btn danger"
          >
            <RefreshCw size={12} />
            {node.node_state === 'IN_PROGRESS' ? '강제 재시도' : '다시 시도'}
          </button>
        )}

        {node.node_state === 'COMPLETED' && (
          <button
            onClick={() => onView(node)}
            className="btn ghost"
          >
            내용 보기
          </button>
        )}
      </div>
      
      {node.api_error_message && (
        <div className="api-error-box">
          {node.api_error_message}
        </div>
      )}
    </div>
  );
};

export default PipelineCard;
