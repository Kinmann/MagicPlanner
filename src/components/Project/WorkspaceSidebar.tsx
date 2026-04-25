import React from 'react';
import { DocumentNode, LocalModule } from '../../types/project';
import { formatNodeTitle } from '../../utils/formatters';

interface WorkspaceSidebarProps {
  nodes: DocumentNode[];
  modules: LocalModule[];
  loading: boolean;
}

const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  nodes,
  modules,
  loading
}) => {
  const activeNodes = nodes.filter(n => 
    ['IN_PROGRESS', 'COMPLETED', 'PAUSED_HITL', 'PAUSED_API_ERROR', 'PAUSED_STOPPED'].includes(n.node_state)
  ).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return (
    <aside className="workspace-log-sidebar">
      <header className="sidebar-header">
        <h3 className="title">Live Activity</h3>
        <p className="subtitle">Streaming parallel agent logs</p>
      </header>

      <div className="log-container custom-scrollbar">
        {activeNodes.map(n => {
          const status = n.node_state;
          const isWorking = status === 'IN_PROGRESS';
          const isDone = status === 'COMPLETED';

          return (
            <div 
              key={`log-${n.node_id}`} 
              className={`log-item ${isWorking ? 'log-item--working' : isDone ? 'log-item--success' : 'log-item--warning'}`}
            >
              <div className="log-meta">
                <span className="time">
                  {isWorking ? 'WORKING' : isDone ? 'DONE' : 'PAUSED'}
                </span>
                <span className="source">{formatNodeTitle(n, modules)}</span>
              </div>
              <p className="message">
                {isWorking 
                  ? `${n.last_action || 'Synthesizing...'} (Iteration ${Math.min(n.current_iteration + 1, n.max_iterations)}/${n.max_iterations})`
                  : isDone
                    ? `Synthesis complete. Score: ${n.current_best_score}`
                    : status === 'PAUSED_API_ERROR' ? 'Paused due to API Error' : 'Paused for Human-in-the-loop'
                }
              </p>
            </div>
          );
        })}

        {activeNodes.length === 0 && (
           <div className="log-placeholder">Waiting for pipeline events...</div>
        )}
      </div>
      
      <div className="stats-panel">
        <div className="stats-grid">
          <div className="stat-box">
            <span className="label">System Load</span>
            <div className="value-row">
              <span className="value">{loading ? 85 : 12}</span>
              <span className="unit">%</span>
            </div>
          </div>
          <div className="stat-box">
            <span className="label">Inference</span>
            <div className="value-row">
              <span className="value">1.2</span>
              <span className="unit">k/s</span>
            </div>
          </div>
        </div>
        
        <div className="resource-flux-bar">
           {[...Array(24)].map((_, i) => (
              <div key={i} className="flux-line" />
           ))}
        </div>
      </div>
    </aside>
  );
};

export default WorkspaceSidebar;
