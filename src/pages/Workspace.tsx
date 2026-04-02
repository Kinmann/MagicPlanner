import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Store } from '@tauri-apps/plugin-store';
import { save } from '@tauri-apps/plugin-dialog';
import { DocumentNode } from '../types/project';
import PipelineBoard from '../components/Project/PipelineBoard';
import Button from '../components/common/Button';
import Spinner from '../components/common/Spinner';
import CriticalErrorModal from '../components/Project/CriticalErrorModal';
import HitlWarningModal from '../components/Project/HitlWarningModal';
import { convertToMarkdown } from '../utils/markdownConverter';
import "./Workspace.scss";

interface WorkspaceProps {
  projectId: string;
  onBack: () => void;
  onOpenSettings: () => void;
  onViewPrompt: () => void;
}

const renderJson = (val: any, indent = 0): React.ReactNode => {
  if (val === null) return <span className="token-boolean">null</span>;
  if (typeof val === 'boolean') return <span className="token-boolean">{String(val)}</span>;
  if (typeof val === 'number') return <span className="token-number">{val}</span>;
  if (typeof val === 'string') return <span className="token-string">"{val}"</span>;
  
  if (Array.isArray(val)) {
    if (val.length === 0) return <span className="token-bracket">[]</span>;
    return (
      <>
        <span className="token-bracket">[</span>
        {val.map((item, i) => (
          <div key={i}>
            <span className="indent" style={{ marginLeft: `${(indent + 1) * 2}ch` }}></span>
            {renderJson(item, indent + 1)}
            {i < val.length - 1 && ","}
          </div>
        ))}
        <div style={{ marginLeft: `${indent * 2}ch` }}>
          <span className="token-bracket">]</span>
        </div>
      </>
    );
  }
  
  if (typeof val === 'object') {
    const keys = Object.keys(val);
    if (keys.length === 0) return <span className="token-bracket">{"{}"}</span>;
    return (
      <>
        <span className="token-bracket">{"{"}</span>
        {keys.map((key, i) => (
          <div key={key}>
            <span className="indent" style={{ marginLeft: `${(indent + 1) * 2}ch` }}></span>
            <span className="token-key">"{key}"</span>: {renderJson(val[key], indent + 1)}
            {i < keys.length - 1 && ","}
          </div>
        ))}
        <div style={{ marginLeft: `${indent * 2}ch` }}>
          <span className="token-bracket">{"}"}</span>
        </div>
      </>
    );
  }
  
  return String(val);
};

const Workspace: React.FC<WorkspaceProps> = ({ projectId, onBack, onOpenSettings, onViewPrompt }) => {
  const [nodes, setNodes] = useState<DocumentNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeContent, setNodeContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'BOARD' | 'CONTENT'>('BOARD');
  const [showApiErrorModal, setShowApiErrorModal] = useState(false);
  const apiErrorDismissed = useRef(false);
  const [showHitlModal, setShowHitlModal] = useState(false);
  const hitlDismissed = useRef(false);
  const [hitlNode, setHitlNode] = useState<DocumentNode | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [iterations, setIterations] = useState<any[]>([]);
  const [selectedIteration, setSelectedIteration] = useState<any | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dragConstraints, setDragConstraints] = useState({ left: 0, right: 0 });

  const maxScore = useMemo(() => {
    if (iterations.length === 0) return 0;
    return Math.max(...iterations.map(it => it.calculated_score || 0));
  }, [iterations]);

  const updateDragConstraints = useCallback(() => {
    if (sliderRef.current && wrapperRef.current) {
      const containerWidth = sliderRef.current.offsetWidth;
      const contentWidth = wrapperRef.current.scrollWidth;
      
      setDragConstraints({ 
        left: Math.min(0, containerWidth - contentWidth), 
        right: 0 
      });
    }
  }, []);

  useEffect(() => {
    // Initial and iterations change update
    const timer = setTimeout(updateDragConstraints, 300);
    
    window.addEventListener('resize', updateDragConstraints);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateDragConstraints);
    };
  }, [iterations, viewMode, selectedNodeId, updateDragConstraints]);


  const selectedNode = useMemo(() => {
    return nodes.find(n => n.node_id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const fetchNodes = useCallback(async () => {
    try {
      const result = await invoke<DocumentNode[]>('get_project_nodes', { projectId });
      setNodes(result);
      
      const hasApiError = result.some(n => n.node_state === 'PAUSED_API_ERROR');
      if (hasApiError) {
        if (!apiErrorDismissed.current) setShowApiErrorModal(true);
      } else {
        apiErrorDismissed.current = false;
      }

      const hitlNodeFound = result.find(n => n.node_state === 'PAUSED_HITL');
      if (hitlNodeFound) {
        setHitlNode(hitlNodeFound);
        if (!hitlDismissed.current) setShowHitlModal(true);
      } else {
        hitlDismissed.current = false;
        setHitlNode(null);
      }
    } catch (err) {
      console.error(err);
    }
  }, [projectId]);

  useEffect(() => {
    fetchNodes();
    const interval = setInterval(fetchNodes, 3000);
    const unlistenStatusPromise = listen<string>('pipeline-status', (event) => {
      setStatusMessage(event.payload);
      setTimeout(() => setStatusMessage(null), 5000);
    });
    
    const unlistenNodesPromise = listen<void>('nodes-updated', () => {
      fetchNodes();
    });

    return () => {
      clearInterval(interval);
      unlistenStatusPromise.then(u => u());
      unlistenNodesPromise.then(u => u());
    };
  }, [fetchNodes]);

  const handleRunNode = async (nodeType: string) => {
    setLoading(true);
    setError(null);
    try {
      const store = await Store.load('settings.json');
      const apiKeyValue = await store.get<{ value: string }>('gemini_api_key');
      if (!apiKeyValue?.value) throw new Error("API 키가 설정되지 않았습니다.");
      apiErrorDismissed.current = false;
      hitlDismissed.current = false;
      await invoke('run_pipeline', { projectId, nodeType, apiKey: apiKeyValue.value });
      fetchNodes();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleHITLAction = async (nodeId: string, action: 'APPROVE' | 'RETRY') => {
    setLoading(true);
    setShowHitlModal(false);
    hitlDismissed.current = false;
    try {
      await invoke('handle_hitl_action', { nodeId, action });
      fetchNodes();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMaxIterations = async (nodeId: string, maxIterations: number) => {
    try {
      await invoke('update_node_max_iterations', { nodeId, maxIterations });
      fetchNodes();
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const handleViewNode = async (node: DocumentNode) => {
    setSelectedNodeId(node.node_id);
    setViewMode('CONTENT');
    setNodeContent(null);
    setIterations([]);
    setSelectedIteration(null);
    try {
      const iters = await invoke<any[]>('get_node_iterations', { nodeId: node.node_id });
      const sortedIters = [...iters].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setIterations(sortedIters);
      if (sortedIters && sortedIters.length > 0) {
        const best = [...sortedIters].sort((a, b) => (b.calculated_score || 0) - (a.calculated_score || 0))[0];
        handleSelectIteration(best);
      } else {
        setNodeContent("생성된 내용이 없습니다.");
      }
    } catch (err: any) {
      setNodeContent("오류 발생: " + err.toString());
    }
  };

  const handleSelectIteration = (iteration: any) => {
    setSelectedIteration(iteration);
    setNodeContent(iteration.generated_draft_json);
  };

  const handleDownload = async () => {
    if (!selectedNode || !nodeContent) return;
    try {
      const markdown = convertToMarkdown(selectedNode, nodeContent);
      const filePath = await save({
        defaultPath: `${selectedNode.target_node_type}_spec.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      });
      if (filePath) {
        await invoke('save_file', { path: filePath, contents: markdown });
      }
    } catch (err: any) {
      setError(err.toString());
    }
  };

  return (
    <div className="workspace-layout">
      {/* 1. Left Side Navigation (Narrow) */}
      <aside className="workspace-sidebar">
        <div className="sidebar-inner">
          <div className="logo-container" onClick={onBack}>
            <span className="material-symbols-outlined text-on-primary">auto_awesome</span>
          </div>
          <nav className="nav-items">
            <button 
              className="nav-button"
              title="Dashboard"
              onClick={onBack}
            >
              <span className="material-symbols-outlined">grid_view</span>
            </button>
            <button 
              className={`nav-button ${viewMode === 'BOARD' ? 'active' : ''}`}
              title="Monitoring"
              onClick={() => setViewMode('BOARD')}
            >
              <span className="material-symbols-outlined">analytics</span>
            </button>
          </nav>
          
          <div className="sidebar-footer">
             <button className="nav-button" title="Settings" onClick={onOpenSettings}>
                <span className="material-symbols-outlined">settings</span>
             </button>
          </div>
        </div>
      </aside>
      
      {/* 2. Main Workspace (Header + Canvas) */}
      <main className="workspace-main">
        {/* Top Toolbar */}
        <header className="workspace-toolbar">
          <div className="toolbar-left">
            <span className="toolbar-label">MAGIC PLANNER</span>
            <div className="divider"></div>
            <div className="toolbar-info">
              {viewMode === 'BOARD' ? (
                <>
                  <span className="title">Pipeline Canvas</span>
                  <span className="status-badge">
                    {loading ? 'Running' : 'Ready'}
                  </span>
                </>
              ) : (
                <div className="breadcrumb">
                  <button 
                    className="breadcrumb-link"
                    onClick={() => setViewMode('BOARD')}
                  >
                    Pipeline Canvas
                  </button>
                  <span className="material-symbols-outlined breadcrumb-sep">chevron_right</span>
                  <span className="breadcrumb-current">{selectedNode?.target_node_type}</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="toolbar-right">
            {viewMode === 'BOARD' && (
              <button 
                className="export-button"
                onClick={onViewPrompt}
              >
                <span className="material-symbols-outlined">article</span>
                View Prompt
              </button>
            )}
            {viewMode === 'CONTENT' && selectedNode && (
              <button 
                className="export-button"
                onClick={handleDownload}
              >
                <span className="material-symbols-outlined">download</span>
                Export Specs
              </button>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className="workspace-content canvas-grid custom-scrollbar">
        {error && (
          <div className="error-banner m-4">
            <span className="material-symbols-outlined">warning</span>
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>X</Button>
          </div>
        )}
        <AnimatePresence mode="wait">
          {viewMode === 'BOARD' ? (
            <motion.div 
              key="board"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full w-full"
            >
              <PipelineBoard 
                nodes={nodes} 
                onRunNode={handleRunNode} 
                onViewNode={handleViewNode}
                onHITLAction={handleHITLAction}
                onUpdateMaxIterations={handleUpdateMaxIterations}
              />

              {/* Progress Overlay (Bottom Center) */}
              <div className="global-progress-bar">
                <div className="progress-card">
                  <div className="progress-info">
                    <span className="label">Global Progress</span>
                    <span className="value">
                      {Math.round((nodes.filter(n => n.node_state === 'COMPLETED').length / (nodes.length || 1)) * 100)}%
                    </span>
                  </div>
                  <div className="track">
                    <div 
                      className="bar" 
                      style={{ width: `${(nodes.filter(n => n.node_state === 'COMPLETED').length / (nodes.length || 1)) * 100}%` }}
                    ></div>
                  </div>
                  <div className="avatars">
                    <div className="avatar">
                      <span className="material-symbols-outlined">smart_toy</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key={`content-${selectedNodeId}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="document-view"
            >
              <div className="document-view-container">
                {/* 1. Revision History Bar */}
                <div className="revision-history-bar scrollbar-hide" ref={sliderRef}>
                  <motion.div 
                    ref={wrapperRef}
                    className="revision-tabs-wrapper"
                    drag="x"
                    dragConstraints={dragConstraints}
                    dragElastic={0.1}
                    onDragStart={updateDragConstraints} // Refresh on start just in case
                  >
                    {iterations.map((it) => {
                      const isBest = it.calculated_score === maxScore && maxScore > 0;
                      return (
                        <button
                          key={it.iteration_id}
                          onClick={() => handleSelectIteration(it)}
                          className={`revision-tab ${
                            selectedIteration?.iteration_id === it.iteration_id ? 'active' : ''
                          } ${isBest ? 'best' : ''}`}
                        >
                          <span className="rev-num">Rev #{it.iteration_number}</span>
                          <div className="rev-score">
                            <span>{it.calculated_score} PTS</span>
                            {selectedIteration?.iteration_id === it.iteration_id && <span className="pulse-dot"></span>}
                          </div>
                        </button>
                      );
                    })}
                  </motion.div>
                </div>

                <div className="document-body">
                  {/* 2. Pass Score Gauge */}
                  <div className="pass-score-gauge">
                    <span className="gauge-label">Pass Score</span>
                    <span className="gauge-value">{selectedIteration?.calculated_score || 0}</span>
                    <div className="gauge-dots">
                      <div className="dot"></div>
                      <div className="dot"></div>
                      <div className="dot"></div>
                    </div>
                  </div>

                  {/* 3. Code Window */}
                  <div className="code-window">
                    <div className="window-header">
                      <div className="dot red"></div>
                      <div className="dot amber"></div>
                      <div className="dot emerald"></div>
                      <span className="filename">
                        {selectedNode?.target_node_type.toLowerCase().replace(' ', '_')}_spec_v{selectedIteration?.iteration_number || 1}.json
                      </span>
                    </div>

                    <div className="code-content">
                      {nodeContent ? (
                        <pre>
                          {(() => {
                            try {
                              const json = typeof nodeContent === 'string' ? JSON.parse(nodeContent) : nodeContent;
                              return renderJson(json);
                            } catch (e) {
                              return nodeContent;
                            }
                          })()}
                        </pre>
                      ) : (
                        <div className="opacity-30 italic">생성된 내용이 없습니다.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </main>

      {/* 3. Right Sidebar (Activity Log) */}
      <aside className="workspace-log-sidebar">
        <header className="sidebar-header">
          <h3 className="title">Live Activity</h3>
          <p className="subtitle">Streaming parallel agent logs</p>
        </header>

        <div className="log-container custom-scrollbar">
          {statusMessage ? (
            <div className="log-item">
              <div className="log-meta">
                <span className="time">NOW</span>
                <span className="source">[Orchestrator]</span>
              </div>
              <p className="message">{statusMessage}</p>
            </div>
          ) : (
             <div className="log-placeholder">Waiting for pipeline events...</div>
          )}
          
          {/* Example completed logs for flavor */}
          {nodes.filter(n => n.node_state === 'COMPLETED').map(n => (
            <div key={`log-${n.node_id}`} className="log-item log-item--success">
              <div className="log-meta">
                <span className="time">DONE</span>
                <span className="source">[{n.target_node_type}]</span>
              </div>
              <p className="message">Synthesis complete. Score: {n.current_best_score}</p>
            </div>
          ))}
        </div>
        
        {/* Stats Mini Panel */}
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

        {/* Specialized Modals */}
        <CriticalErrorModal
          isOpen={showApiErrorModal}
          onClose={() => {
            setShowApiErrorModal(false);
            apiErrorDismissed.current = true;
          }}
          errorMessage={nodes.find(n => n.node_state === 'PAUSED_API_ERROR')?.api_error_message}
          onRetry={() => {
            setShowApiErrorModal(false);
            apiErrorDismissed.current = false;
            const errorNode = nodes.find(n => n.node_state === 'PAUSED_API_ERROR');
            if (errorNode) handleRunNode(errorNode.target_node_type);
          }}
          onSettings={onOpenSettings}
        />

        <HitlWarningModal
          isOpen={showHitlModal}
          onClose={() => {
            setShowHitlModal(false);
            hitlDismissed.current = true;
          }}
          onRetry={() => hitlNode && handleHITLAction(hitlNode.node_id, 'RETRY')}
          onApprove={() => hitlNode && handleHITLAction(hitlNode.node_id, 'APPROVE')}
          nodeType={hitlNode?.target_node_type || ''}
          currentScore={hitlNode?.current_best_score || 0}
        />

        {loading && (
          <div className="engine-status">
            <div className="status-row">
              <Spinner size="sm" />
              Engine Orchestrating...
            </div>
            {statusMessage && (
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="status-message">
                 {statusMessage}
               </motion.div>
            )}
          </div>
        )}
    </div>
  );
};

export default Workspace;
