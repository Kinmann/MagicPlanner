import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Store } from '@tauri-apps/plugin-store';
import { save } from '@tauri-apps/plugin-dialog';
import { DocumentNode, Project, LocalModule, PipelinePhase } from '../types/project';
import PipelineBoard from '../components/Project/PipelineBoard';
import PhaseProgressBar from '../components/Project/PhaseProgressBar';
import GenesisPrdView from '../components/Project/GenesisPrdView';
import SadOverview from '../components/Project/SadOverview';
import ModuleTree from '../components/Project/ModuleTree';
import Button from '../components/common/Button';
import Header from "../components/layout/Header";
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

  // v2: Phase-based state
  const [project, setProject] = useState<Project | null>(null);
  const [currentPhase, setCurrentPhase] = useState<PipelinePhase>('GENESIS_PRD');
  const [activePhase, setActivePhase] = useState<PipelinePhase | null>(null);
  const [modules, setModules] = useState<LocalModule[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

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

  // v2: Fetch project info
  const fetchProject = useCallback(async () => {
    try {
      const proj = await invoke<Project>('get_project', { projectId });
      setProject(proj);
      setCurrentPhase(proj.pipeline_phase as PipelinePhase);
    } catch {}
  }, [projectId]);

  // v2: Fetch modules
  const fetchModules = useCallback(async () => {
    try {
      const mods = await invoke<LocalModule[]>('get_project_modules', { projectId });
      setModules(mods);
      if (mods.length > 0 && !selectedModuleId) {
        const active = mods.find(m => m.module_state === 'ACTIVE') || mods[0];
        setSelectedModuleId(active.module_id);
      }
    } catch {}
  }, [projectId, selectedModuleId]);

  const fetchNodes = useCallback(async () => {
    try {
      const result = await invoke<DocumentNode[]>('get_project_nodes', { projectId });
      setNodes(result);
      
      // MODULE_GENERATION phase에서는 선택된 모듈의 노드만 필터
      const relevantNodes = currentPhase === 'MODULE_GENERATION' && selectedModuleId
        ? result.filter(n => n.module_id === selectedModuleId)
        : result;

      const hasApiError = relevantNodes.some(n => n.node_state === 'PAUSED_API_ERROR');
      if (hasApiError) {
        if (!apiErrorDismissed.current) setShowApiErrorModal(true);
      } else {
        apiErrorDismissed.current = false;
      }

      const hitlNodeFound = relevantNodes.find(n => n.node_state === 'PAUSED_HITL' && n.node_category === 'MODULE');
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
  }, [projectId, currentPhase, selectedModuleId]);

  useEffect(() => {
    fetchProject();
    fetchNodes();
    fetchModules();
    const interval = setInterval(() => { fetchNodes(); fetchProject(); fetchModules(); }, 3000);
    const unlistenStatusPromise = listen<string>('pipeline-status', (event) => {
      setStatusMessage(event.payload);
      setTimeout(() => setStatusMessage(null), 5000);
    });
    
    const unlistenNodesPromise = listen<void>('nodes-updated', () => {
      fetchNodes();
      fetchProject();
      fetchModules();
    });

    return () => {
      clearInterval(interval);
      unlistenStatusPromise.then(u => u());
      unlistenNodesPromise.then(u => u());
    };
  }, [fetchNodes, fetchProject, fetchModules]);

  const handleRunNode = async (nodeType: string) => {
    setLoading(true);
    setError(null);
    try {
      const store = await Store.load('settings.json');
      const apiKeyValue = await store.get<{ value: string }>('gemini_api_key');
      if (!apiKeyValue?.value) throw new Error("API 키가 설정되지 않았습니다.");
      
      apiErrorDismissed.current = false;
      hitlDismissed.current = false;

      // v2: MODULE_GENERATION 페이즈인 경우 run_module_pipeline 호출
      if (currentPhase === 'MODULE_GENERATION' || currentPhase === 'COMPLETED') {
        if (!selectedModuleId) throw new Error("선택된 모듈이 없습니다.");
        await invoke('run_module_pipeline', { 
          projectId, 
          moduleId: selectedModuleId, 
          nodeType, 
          apiKey: apiKeyValue.value 
        });
      } else {
        // 기존 및 기타 페이즈 대응 (Genesis PRD, SAD 등은 각 View에서 별도 처리하지만 보조적 유지)
        await invoke('run_pipeline', { projectId, nodeType, apiKey: apiKeyValue.value });
      }
      
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

  const handlePhaseClick = (phase: PipelinePhase) => {
    setActivePhase(phase);
    setViewMode('BOARD');
    setSelectedNodeId(null);
  };

  const displayPhase = activePhase || currentPhase;

  return (
    <div className="workspace-layout">
      {/* Background Glows for visual depth (Global) */}
      <div className="background-glow background-glow--1" />
      <div className="background-glow background-glow--2" />

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
        <Header
          title={project?.project_name || "Pipeline Canvas"}
          subtitle={viewMode === 'BOARD' ? (
            <span className="status-badge">
              {loading ? 'Running' : 'Ready'}
            </span>
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
        >
          {viewMode === 'BOARD' && (
            <button 
              className="header-action-button"
              onClick={onViewPrompt}
            >
              <span className="material-symbols-outlined">article</span>
              View Prompt
            </button>
          )}
          {viewMode === 'CONTENT' && selectedNode && (
            <button 
              className="header-action-button"
              onClick={handleDownload}
            >
              <span className="material-symbols-outlined">download</span>
              Export Specs
            </button>
          )}
        </Header>

        {/* v2: Phase Progress Bar */}
        <PhaseProgressBar 
          currentPhase={currentPhase} 
          activePhase={displayPhase}
          onPhaseClick={handlePhaseClick}
        />

        {/* Content Area */}
        <div className="workspace-content canvas-grid custom-scrollbar">
        {error && (
          <div className="error-banner m-4">
            <span className="material-symbols-outlined">warning</span>
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>X</Button>
          </div>
        )}

        {/* v2: Phase-based content */}
        <AnimatePresence mode="wait">
          {displayPhase === 'GENESIS_PRD' && (
            <motion.div key="genesis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <GenesisPrdView
                projectId={projectId}
                node={nodes.find(n => n.target_node_type === 'Genesis_PRD') || null}
                onApprove={async () => {
                  setLoading(true);
                  await Promise.all([fetchProject(), fetchNodes()]);
                  setLoading(false);
                }}
                onRefresh={() => { fetchProject(); fetchNodes(); }}
                onUpdateMaxIterations={handleUpdateMaxIterations}
              />
            </motion.div>
          )}

          {displayPhase === 'SAD' && (
            <motion.div key="sad" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SadOverview
                projectId={projectId}
                globalNode={nodes.find(n => n.target_node_type === 'SAD_Global') || null}
                moduleNode={nodes.find(n => n.target_node_type === 'SAD_Module') || null}
                onModulesCreated={() => { fetchProject(); fetchModules(); fetchNodes(); }}
                onRefresh={() => { fetchProject(); fetchNodes(); }}
                onUpdateMaxIterations={handleUpdateMaxIterations}
              />
            </motion.div>
          )}

          {(displayPhase === 'MODULE_GENERATION' || displayPhase === 'COMPLETED') && (
            <motion.div key="modules" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="module-layout">
              {/* Module Tree Panel */}
              <div className="module-panel">
                <ModuleTree
                  modules={modules}
                  selectedModuleId={selectedModuleId}
                  onSelectModule={(id) => {
                    setSelectedModuleId(id);
                    setViewMode('BOARD');
                    setSelectedNodeId(null);
                  }}
                />
              </div>

              {/* Module Pipeline Content */}
              <div className="module-content">
                {viewMode === 'BOARD' ? (
                  <motion.div key="board" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <PipelineBoard 
                      nodes={selectedModuleId ? nodes.filter(n => n.module_id === selectedModuleId) : []} 
                      onRunNode={handleRunNode} 
                      onViewNode={handleViewNode}
                      onHITLAction={handleHITLAction}
                      onUpdateMaxIterations={handleUpdateMaxIterations}
                    />

                    {/* Progress Overlay */}
                    {selectedModuleId && (() => {
                      const moduleNodes = nodes.filter(n => n.module_id === selectedModuleId);
                      const completedCount = moduleNodes.filter(n => n.node_state === 'COMPLETED').length;
                      const total = moduleNodes.length || 1;
                      return (
                        <div className="global-progress-bar">
                          <div className="progress-card">
                            <div className="progress-info">
                              <span className="label">Module Progress</span>
                              <span className="value">{Math.round((completedCount / total) * 100)}%</span>
                            </div>
                            <div className="track">
                              <div className="bar" style={{ width: `${(completedCount / total) * 100}%` }}></div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
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
                      <div className="revision-history-bar scrollbar-hide" ref={sliderRef}>
                        <motion.div 
                          ref={wrapperRef}
                          className="revision-tabs-wrapper"
                          drag="x"
                          dragConstraints={dragConstraints}
                          dragElastic={0.1}
                          onDragStart={updateDragConstraints}
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
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="content-header"
                        >
                          <div className="header-left">
                            <h2>{selectedNode?.target_node_type} Synthesis</h2>
                            <p>Orchestrated intelligence output for precise software architecture and planning.</p>
                          </div>
                          <div className="header-right">
                            <div className="pass-score-gauge">
                              <span className="gauge-label">Score</span>
                              <span className="gauge-value">{selectedIteration?.calculated_score || 0}</span>
                              <div className="gauge-dots">
                                <div className="dot"></div><div className="dot"></div><div className="dot"></div>
                              </div>
                            </div>
                          </div>
                        </motion.div>

                        <div className="code-window">
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
