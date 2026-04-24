import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Store } from '@tauri-apps/plugin-store';
import { save, ask } from '@tauri-apps/plugin-dialog';
import { DocumentNode, Project, LocalModule, PipelinePhase } from '../types/project';
import PipelineBoard from '../components/Project/PipelineBoard';
import PhaseProgressBar from '../components/Project/PhaseProgressBar';
import GenesisPrdView from '../components/Project/GenesisPrdView';
import SadOverview from '../components/Project/SadOverview';
import ModuleTree from '../components/Project/ModuleTree';
import Button from '../components/common/Button';
import Header from "../components/layout/Header";
import BaseModal from '../components/common/BaseModal';
import FeedbackRenderer from '../components/common/FeedbackRenderer';
import SadSpecRenderer from '../components/Project/SadSpecRenderer';
import CriticalErrorModal from '../components/Project/CriticalErrorModal';
import HitlWarningModal from '../components/Project/HitlWarningModal';
import RefinementResultModal from '../components/Project/RefinementResultModal';
import { convertToMarkdown } from '../utils/markdownConverter';
import { formatNodeTitle } from '../utils/formatters';
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
      <div className="json-array">
        <span className="token-bracket">[</span>
        <div className="json-items">
          {val.map((item, i) => (
            <div key={i} className="json-item">
              <span className="indent" style={{ marginLeft: `${(indent + 1) * 2}ch` }}></span>
              {renderJson(item, indent + 1)}
              {i < val.length - 1 && ","}
            </div>
          ))}
        </div>
        <div style={{ marginLeft: `${indent * 2}ch` }}>
          <span className="token-bracket">]</span>
        </div>
      </div>
    );
  }
  
  if (typeof val === 'object') {
    const keys = Object.keys(val);
    if (keys.length === 0) return <span className="token-bracket">{"{}"}</span>;
    return (
      <div className="json-object">
        <span className="token-bracket">{"{"}</span>
        <div className="json-items">
          {keys.map((key, i) => (
            <div key={key} className="json-item">
              <span className="indent" style={{ marginLeft: `${(indent + 1) * 2}ch` }}></span>
              <span className="token-property">"{key}"</span>: {renderJson(val[key], indent + 1)}
              {i < keys.length - 1 && ","}
            </div>
          ))}
        </div>
        <div style={{ marginLeft: `${indent * 2}ch` }}>
          <span className="token-bracket">{"}"}</span>
        </div>
      </div>
    );
  }
  return String(val);
};

const PrdBentoRenderer = ({ content }: { content: any }) => {
  return (
    <div className="visual-view">
      <div className="genesis-prd-view__bento-grid">
        {/* Business Context (col-span-8) */}
        <div className="bento-card bento-card--overview intent-strip-primary">
          <div className="card-header">
            <h2 className="card-title">
              <span className="material-symbols-outlined icon">business_center</span>
              Business Strategy
            </h2>
          </div>
          <div className="card-body">
            <div className="overview-content">
              <div className="info-group">
                <h3>Product Goal</h3>
                <p>{content.business_context?.product_goal || 'Goal not defined'}</p>
              </div>
              <div className="info-group">
                <h3>Target Market</h3>
                <p>{content.business_context?.target_market || 'N/A'}</p>
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
              <div key={i} className="epic-card">
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
                      </div>
                    </div>
                  </div>
                </div>
                <div className="epic-desc">
                  {epic.description}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tech Stack (col-span-12) */}
        <div className="bento-card bento-card--tech intent-strip-primary">
          <h2 className="card-title">Core Technology Stack</h2>
          <div className="tech-grid">
            {content.tech_stack?.frontend && (
              <div className="tech-category">
                <div className="category-header">
                  <span className="material-symbols-outlined">splitscreen</span>
                  <span className="name">Frontend</span>
                </div>
                <div className="category-body">
                  <div className="category-main">
                    <span className="label">Framework</span>
                    <span className="value">{content.tech_stack.frontend.framework || 'N/A'}</span>
                  </div>
                  {content.tech_stack.frontend.ui_library && (
                    <div className="sub-item">
                      <span className="label">UI Library</span>
                      <span className="value">{content.tech_stack.frontend.ui_library}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {content.tech_stack?.backend && (
              <div className="tech-category">
                <div className="category-header">
                  <span className="material-symbols-outlined">dns</span>
                  <span className="name">Backend</span>
                </div>
                <div className="category-body">
                  <div className="category-main">
                    <span className="label">Framework</span>
                    <span className="value">{content.tech_stack.backend.framework || 'N/A'}</span>
                  </div>
                  {content.tech_stack.backend.database && (
                    <div className="sub-item">
                      <span className="label">Database</span>
                      <span className="value">{content.tech_stack.backend.database}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const SadGlobalRenderer = ({ content }: { content: any }) => {
  const contexts = Array.isArray(content) ? content : (content.contexts || []);
  
  return (
    <div className="visual-view">
      <div className="sad-overview-grid">
        {contexts.map((ctx: any, idx: number) => (
          <div key={idx} className="context-card">
            <div className="spec-card-top">
              <span className="group-label">Architecture Definition</span>
              <span className="file-name">{ctx.context_type?.toUpperCase()}.JSON</span>
            </div>
            <div className="spec-card-inner">
              <div className="card-header">
                <div className="title-group">
                  <span className="material-symbols-outlined icon">
                    {ctx.context_type === 'erd' ? 'database' :
                     ctx.context_type === 'api' ? 'api' : 'architecture'}
                  </span>
                  <span className="name">{ctx.context_type?.toUpperCase()} Specification</span>
                </div>
              </div>
              <div className="card-content-wrapper custom-scrollbar">
                <SadSpecRenderer
                  type={ctx.context_type}
                  data={ctx.context_data_json}
                  isRaw={false}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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
  const [iterations, setIterations] = useState<any[]>([]);
  const [selectedIteration, setSelectedIteration] = useState<any | null>(null);
  const [showRefinementModal, setShowRefinementModal] = useState(false);
  const [refinementResult, setRefinementResult] = useState<any>(null);

  // v2: Phase-based state
  const [project, setProject] = useState<Project | null>(null);
  const [currentPhase, setCurrentPhase] = useState<PipelinePhase>('GENESIS_PRD');
  const [activePhase, setActivePhase] = useState<PipelinePhase | null>(null);
  const [modules, setModules] = useState<LocalModule[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [showRawSpec, setShowRawSpec] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);
  
  // v2: Closure staleness protection for event listeners
  const phaseRef = useRef(currentPhase);
  const selectedModuleIdRef = useRef(selectedModuleId);

  // Optimization: Data snapshots to prevent redundant re-renders
  const lastNodesJson = useRef("");
  const lastProjectJson = useRef("");
  const lastModulesJson = useRef("");

  useEffect(() => {
    phaseRef.current = currentPhase;
    selectedModuleIdRef.current = selectedModuleId;
  }, [currentPhase, selectedModuleId]);

  const selectedNode = useMemo(() => {
    return nodes.find(n => n.node_id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const bestIterationId = useMemo(() => {
    if (!selectedNode || iterations.length === 0) return null;
    
    // Genesis PRD나 SAD문서는 기존대로 is_pass 기준 (사용자 요청)
    if (selectedNode.node_category !== 'MODULE') {
      const passed = iterations.find(it => it.is_pass);
      return passed ? passed.iteration_id : iterations[iterations.length - 1]?.iteration_id;
    }

    // 모듈 내 문서 노드는 새로운 로직 적용: 기준점 이상 중 최고점 -> 최신 순
    const threshold = selectedNode.threshold_score || 0;
    const qualified = iterations.filter(it => (it.calculated_score || 0) >= threshold);
    
    if (qualified.length === 0) return null;

    const best = [...qualified].sort((a, b) => {
      if (b.calculated_score !== a.calculated_score) {
        return (b.calculated_score || 0) - (a.calculated_score || 0);
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })[0];
    
    return best?.iteration_id;
  }, [selectedNode, iterations]);




  const fetchProject = useCallback(async () => {
    try {
      const proj = await invoke<Project>('get_project', { projectId });
      const json = JSON.stringify(proj);
      if (json !== lastProjectJson.current) {
        lastProjectJson.current = json;
        setProject(proj);
        setCurrentPhase(proj.pipeline_phase as PipelinePhase);
      }
    } catch {}
  }, [projectId]);

  // v2: Fetch modules
  const fetchModules = useCallback(async () => {
    try {
      const mods = await invoke<LocalModule[]>('get_project_modules', { projectId });
      const json = JSON.stringify(mods);
      if (json !== lastModulesJson.current) {
        lastModulesJson.current = json;
        setModules(mods);
      }
      
      if (mods.length > 0 && !selectedModuleIdRef.current) {
        const active = mods.find(m => m.module_state === 'ACTIVE') || mods[0];
        setSelectedModuleId(active.module_id);
      }
    } catch {}
  }, [projectId]);

  const fetchNodes = useCallback(async () => {
    try {
      const result = await invoke<DocumentNode[]>('get_project_nodes', { projectId });
      const json = JSON.stringify(result);
      
      if (json !== lastNodesJson.current) {
        lastNodesJson.current = json;
        setNodes(result);
      }
      
      // MODULE_GENERATION phase에서는 선택된 모듈의 노드만 필터
      const relevantNodes = phaseRef.current === 'MODULE_GENERATION' && selectedModuleIdRef.current
        ? result.filter(n => n.module_id === selectedModuleIdRef.current)
        : result;

      const hasApiError = relevantNodes.some(n => n.node_state === 'PAUSED_API_ERROR');
      if (hasApiError) {
        if (!apiErrorDismissed.current) setShowApiErrorModal(true);
      } else {
        apiErrorDismissed.current = false;
      }

      const hitlNodeFound = relevantNodes.find(n => n.node_state === 'PAUSED_HITL' && n.node_category === 'MODULE');
      if (hitlNodeFound) {
        // hitlNode도 변경되었을 때만 업데이트 (JSON 비교)
        const hitlJson = JSON.stringify(hitlNodeFound);
        setHitlNode(prev => JSON.stringify(prev) === hitlJson ? prev : hitlNodeFound);
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
    fetchProject();
    fetchNodes();
    fetchModules();
    const interval = setInterval(() => { fetchNodes(); fetchProject(); fetchModules(); }, 3000);
    
    return () => {
      clearInterval(interval);
    };
  }, [fetchNodes, fetchProject, fetchModules]);

  useEffect(() => {
    const unlistenStatusPromise = listen<string>('pipeline-status', (event) => {
      console.log(">>> Global Pipeline Status:", event.payload);
      // setSystemLogs 사용 중단: 노드 로그로 충분하므로 UI에서 시스템 로그를 제거함
    });
    
    const unlistenNodesPromise = listen<void>('nodes-updated', () => {
      fetchNodes();
      fetchProject();
      fetchModules();
    });

    const unlistenRefinementPromise = listen<any>('refinement-validation-result', (event) => {
      console.log(">>> Refinement Result Received:", event.payload);
      setRefinementResult(event.payload);
      setShowRefinementModal(true);
    });

    return () => {
      unlistenStatusPromise.then(u => u());
      unlistenNodesPromise.then(u => u());
      unlistenRefinementPromise.then(u => u());
    };
  }, []); // Listeners are registered once on mount

  const handleRunNode = async (nodeIdOrType: string) => {
    setLoading(true);
    setError(null);
    try {
      // nodeId인지 nodeType인지 확인 (UUID v4 형식 여부로 판단하거나 nodes에서 먼저 검색)
      let node = nodes.find(n => n.node_id === nodeIdOrType);
      let nodeType = node ? node.target_node_type : nodeIdOrType;
      
      if (!node && currentPhase === 'MODULE_GENERATION') {
        // nodeType으로 넘어왔을 경우 현재 선택된 모듈 내에서 해당 타입 노드를 찾음
        node = nodes.find(n => n.target_node_type === nodeIdOrType && n.module_id === selectedModuleId);
      }
      const store = await Store.load('settings.json');
      const apiKeyValue = await store.get<{ value: string }>('gemini_api_key');
      if (!apiKeyValue?.value) throw new Error("API 키가 설정되지 않았습니다.");
      
      apiErrorDismissed.current = false;
      hitlDismissed.current = false;

      // v2: MODULE_GENERATION 페이즈인 경우 run_module_pipeline 호출
      if (currentPhase === 'MODULE_GENERATION' || currentPhase === 'COMPLETED') {
        if (!selectedModuleId) throw new Error("선택된 모듈이 없습니다.");
        
        if (node?.node_state === 'STALE') {
          try {
            await invoke('generate_and_apply_patch', {
              projectId,
              nodeId: node.node_id,
              apiKey: apiKeyValue.value
            });
          } catch (patchErr: any) {
            console.error("Patch failed:", patchErr);
            const shouldRegenerate = await window.confirm(
              `패치 적용에 실패했습니다: ${patchErr}\n\n시스템 무결성을 위해 전체 재생성을 진행하시겠습니까?`
            );
            
            if (shouldRegenerate) {
              await invoke('run_module_pipeline', { 
                projectId, 
                moduleId: selectedModuleId, 
                nodeType, 
                apiKey: apiKeyValue.value 
              });
              fetchNodes();
            }
          }
        } else {
          await invoke('run_module_pipeline', { 
            projectId, 
            moduleId: selectedModuleId, 
            nodeType, 
            apiKey: apiKeyValue.value 
          });
          fetchNodes();
        }
      } else {
        // 기존 및 기타 페이즈 대응 (Genesis PRD, SAD 등은 각 View에서 별도 처리하지만 보조적 유지)
        await invoke('run_pipeline', { projectId, nodeType, apiKey: apiKeyValue.value });
        fetchNodes();
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
      const store = await Store.load('settings.json');
      const apiKeyValue = await store.get<{ value: string }>('gemini_api_key');
      const apiKey = apiKeyValue?.value || "";

      await invoke('handle_hitl_action', { nodeId, action, apiKey });
      fetchNodes();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleRetryLoop = async (nodeId: string, retryCount: number) => {
    setLoading(true);
    setError(null);
    try {
      const store = await Store.load('settings.json');
      const apiKeyValue = await store.get<{ value: string }>('gemini_api_key');
      if (!apiKeyValue?.value) throw new Error("API 키가 설정되지 않았습니다.");

      await invoke('retry_patch_loop', {
        projectId,
        nodeId,
        apiKey: apiKeyValue.value,
        retryCount
      });
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

  const handleStopNode = async (nodeId: string) => {
    try {
      await invoke('stop_node_pipeline', { nodeId });
      fetchNodes();
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const handleResumeNode = async (nodeId: string) => {
    try {
      await invoke('resume_node_pipeline', { nodeId });
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
      const iters = await invoke<any[]>('get_node_iterations', { nodeId: node.node_id }) || [];
      const sortedIters = [...iters].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setIterations(sortedIters);
      if (sortedIters && sortedIters.length > 0) {
        let target;
        // 모듈 노드인 경우 최적 리비전 선택 로직 적용
        if (node.node_category === 'MODULE') {
          const threshold = node.threshold_score || 0;
          const qualified = sortedIters.filter(it => (it.calculated_score || 0) >= threshold);
          if (qualified.length > 0) {
            target = [...qualified].sort((a, b) => {
              if (b.calculated_score !== a.calculated_score) {
                return (b.calculated_score || 0) - (a.calculated_score || 0);
              }
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            })[0];
          } else {
            target = sortedIters[sortedIters.length - 1];
          }
        } else {
          // 기존 로직: is_pass 우선 또는 전체 최고점
          const passed = sortedIters.find(it => it.is_pass);
          target = passed || [...sortedIters].sort((a, b) => (b.calculated_score || 0) - (a.calculated_score || 0))[0];
        }
        handleSelectIteration(target);
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

  const handleDeleteIteration = async (iteration: any) => {
    if (!iteration) return;

    const confirmed = await ask(`Draft #${iteration.iteration_number} 리비전을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`, {
      title: '리비전 삭제',
      kind: 'warning'
    });

    if (!confirmed) return;

    setLoading(true);
    try {
      await invoke('delete_generation_iteration', { iterationId: iteration.iteration_id });
      // 리비전 목록 다시 불러오기
      if (selectedNodeId) {
        const iters = await invoke<any[]>('get_node_iterations', { nodeId: selectedNodeId }) || [];
        const sortedIters = [...iters].sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        setIterations(sortedIters);
        
        // 다음 선택할 리비전 결정
        if (sortedIters.length > 0) {
          const oldIdx = iterations.findIndex(i => i.iteration_id === iteration.iteration_id);
          const nextIdx = Math.min(oldIdx >= 0 ? oldIdx : 0, sortedIters.length - 1);
          handleSelectIteration(sortedIters[nextIdx]);
        } else {
          setSelectedIteration(null);
          setNodeContent("생성된 내용이 없습니다.");
        }
      }
      fetchNodes();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
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
          {viewMode === 'BOARD' && project?.increment_intent && (
            <Button 
              variant="primary"
              className="header-action-button refinement-commit-btn"
              onClick={async () => {
                const confirmed = await window.confirm("모든 정제 사항을 시스템에 최종 반영하시겠습니까?");
                if (confirmed) {
                  setLoading(true);
                  try {
                    await invoke('finalize_refinement_update', { projectId });
                    fetchNodes();
                    fetchProject();
                  } catch (err: any) {
                    setError(err.toString());
                  } finally {
                    setLoading(false);
                  }
                }
              }}
              leftIcon={<span className="material-symbols-outlined">verified</span>}
            >
              Finalize System
            </Button>
          )}
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
        <AnimatePresence mode="popLayout">
          {displayPhase === 'GENESIS_PRD' && (
            <motion.div key="genesis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <GenesisPrdView
                projectId={projectId}
                nodes={nodes.filter(n => n.target_node_type.startsWith('GPRD_'))}
                isLocked={currentPhase !== 'GENESIS_PRD'}
                onApprove={async () => {
                  setLoading(true);
                  await Promise.all([fetchProject(), fetchNodes()]);
                  setActivePhase(null); // 페이즈 전환 시 명시적으로 초기화하여 자동 전이 유도
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
                isApproved={currentPhase === 'MODULE_GENERATION' || currentPhase === 'COMPLETED'}
                isLocked={currentPhase === 'MODULE_GENERATION' || currentPhase === 'COMPLETED'}
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
                      nodes={selectedModuleId ? nodes.filter(n => n.node_id === selectedModuleId || n.module_id === selectedModuleId) : []} 
                      modules={modules}
                      onRunNode={handleRunNode} 
                      onStopNode={handleStopNode}
                      onResumeNode={handleResumeNode}
                      onViewNode={handleViewNode}
                      onHITLAction={handleHITLAction}
                      onRetryLoop={handleRetryLoop}
                      onUpdateMaxIterations={handleUpdateMaxIterations}
                      isRefinementMode={!!project?.increment_intent}
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
                      <div className="revisions-horizontal">
                        <div className="revisions-header">
                          <div className="left">
                            <span className="material-symbols-outlined">history</span>
                            <span>Revision History</span>
                          </div>
                          <div className="right">
                            <Button
                              variant="ghost"
                              className="ai-guidance-btn"
                              onClick={() => setShowGuidance(true)}
                              title="AI Guidance"
                              leftIcon={<span className="material-symbols-outlined">auto_awesome</span>}
                            >
                            </Button>
                            <button 
                              className={`raw-spec-btn ${showRawSpec ? 'active' : ''}`}
                              onClick={() => setShowRawSpec(!showRawSpec)}
                            >
                              <span className="material-symbols-outlined">
                                {showRawSpec ? 'account_tree' : 'data_object'}
                              </span>
                              {showRawSpec ? 'Visual' : 'RAW SPEC'}
                            </button>
                            <Button
                              onClick={() => handleDeleteIteration(selectedIteration)}
                              disabled={loading || !selectedIteration}
                              variant="ghost"
                              className="delete-btn"
                              title="이 리비전 삭제"
                              iconOnly
                              leftIcon={<span className="material-symbols-outlined" style={{ color: '#ef4444' }}>delete</span>}
                            />
                          </div>
                        </div>
                        <div className="revisions-list custom-scrollbar">
                          {iterations.map((it) => {
                            const isConfirmed = it.iteration_id === bestIterationId;
                            return (
                              <button
                                key={it.iteration_id}
                                className={`revision-btn ${selectedIteration?.iteration_id === it.iteration_id ? 'active' : ''} ${isConfirmed ? 'confirmed' : ''}`}
                                onClick={() => handleSelectIteration(it)}
                              >
                                <span className="iter-num">Draft #{it.iteration_number}</span>
                                {isConfirmed && (
                                  <span className="material-symbols-outlined selected-icon">
                                    check_circle
                                  </span>
                                )}
                                <span className="iter-meta">{it.calculated_score}</span>
                              </button>
                            );
                          })}
                        </div>
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
                          <div className={`code-content ${!showRawSpec ? 'visual-render' : ''}`}>
                            {nodeContent ? (
                              <>
                                {(() => {
                                  try {
                                    if (showRawSpec) {
                                      return (
                                        <pre>
                                          {typeof nodeContent === 'string' ? nodeContent : JSON.stringify(nodeContent, null, 2)}
                                        </pre>
                                      );
                                    }
                                    const json = typeof nodeContent === 'string' ? JSON.parse(nodeContent) : nodeContent;
                                    
                                    // Visual Renderers based on node type
                                    if (selectedNode?.target_node_type === 'genesis-prd') {
                                      return <PrdBentoRenderer content={json} />;
                                    } else if (selectedNode?.target_node_type === 'sad-global') {
                                      return <SadGlobalRenderer content={json} />;
                                    } else if (['PRD', 'FSD', 'IA', 'User Flow', 'ERD', 'Wireframe', 'API_Spec', 'TC'].includes(selectedNode?.target_node_type || '')) {
                                      return <SadSpecRenderer type={selectedNode?.target_node_type || ''} data={json} />;
                                    }
                                    
                                    return (
                                      <pre>
                                        {renderJson(json)}
                                      </pre>
                                    );
                                  } catch (e) {
                                    return <pre>{nodeContent}</pre>;
                                  }
                                })()}
                              </>
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
          
          {/* System Logs */}
          {/* 사용자 요청으로 시스템 로그 렌더링 제거 (노드 로그만 표시) */}

          {/* Node Activity Feed: Sorted by recent updates */}
          {nodes
            .filter(n => ['IN_PROGRESS', 'COMPLETED', 'PAUSED_HITL', 'PAUSED_API_ERROR', 'PAUSED_STOPPED'].includes(n.node_state))
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            .map(n => {
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
            })
          }

          {nodes.filter(n => ['IN_PROGRESS', 'COMPLETED', 'PAUSED_HITL', 'PAUSED_API_ERROR', 'PAUSED_STOPPED'].includes(n.node_state)).length === 0 && (
             <div className="log-placeholder">Waiting for pipeline events...</div>
          )}
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
            if (errorNode) handleRunNode(errorNode.node_id);
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

        {showGuidance && selectedIteration && (
          <BaseModal
            isOpen={showGuidance}
            onClose={() => setShowGuidance(false)}
            title="AI Intelligence Feedback"
            subtitle={`Draft #${selectedIteration.iteration_number} - Score: ${selectedIteration.calculated_score}`}
            size="md"
          >
            <div className="intelligence-feedback">
              {selectedIteration.critical_errors_array && (
                <div className="feedback-card error">
                  <div className="card-header">
                    <span className="material-symbols-outlined">error</span>
                    <h4>Critical Issues</h4>
                  </div>
                  <div className="card-content">
                    <FeedbackRenderer 
                      feedback={selectedIteration.critical_errors_array} 
                      type="error" 
                    />
                  </div>
                </div>
              )}
              {selectedIteration.actionable_feedback_text && (
                <div className="feedback-card info">
                  <div className="card-header">
                    <span className="material-symbols-outlined">tips_and_updates</span>
                    <h4>Optimization Guidance</h4>
                  </div>
                  <div className="card-content">
                    <FeedbackRenderer 
                      feedback={selectedIteration.actionable_feedback_text} 
                      type="info" 
                    />
                  </div>
                </div>
              )}
              {!selectedIteration.critical_errors_array && !selectedIteration.actionable_feedback_text && (
                <div className="feedback-card success">
                  <div className="card-header">
                    <span className="material-symbols-outlined">check_circle</span>
                    <h4>All Good</h4>
                  </div>
                  <div className="card-content">
                    <p>이 리비전에 특별한 결함이나 개선 제안이 없습니다.</p>
                  </div>
                </div>
              )}
            </div>
          </BaseModal>
        )}

      <RefinementResultModal 
        isOpen={showRefinementModal}
        onClose={() => setShowRefinementModal(false)}
        data={refinementResult}
      />
    </div>
  );
};

export default Workspace;
