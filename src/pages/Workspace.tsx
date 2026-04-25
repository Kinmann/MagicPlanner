import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';

import { DocumentNode, PipelinePhase } from '../types/project';
import GenesisPrdView from '../components/Project/GenesisPrdView';
import SadOverview from '../components/Project/SadOverview';
import ModuleGenerationView from '../components/Project/ModuleGenerationView';
import WorkspaceContent from '../components/Project/WorkspaceContent';
import WorkspaceToolbar from '../components/Project/WorkspaceToolbar';
import WorkspaceSidebar from '../components/Project/WorkspaceSidebar';
import CriticalErrorModal from '../components/Project/CriticalErrorModal';
import HitlWarningModal from '../components/Project/HitlWarningModal';
import ErrorBoundary from '../components/common/ErrorBoundary';

import { useProjectStore } from '../store/projectStore';
import { useUIStore } from '../store/uiStore';
import Button from '../components/common/Button';
import "./Workspace.scss";

interface WorkspaceProps {
  projectId: string;
}

const Workspace: React.FC<WorkspaceProps> = ({ projectId }) => {
  // Store Subscriptions
  const { 
    nodes, modules, currentProject, error,
    fetchNodes, fetchProject, fetchModules,
    runNode, handleHITLAction, deleteIteration,
    clearError
  } = useProjectStore(useShallow(state => ({
    nodes: state.nodes,
    modules: state.modules,
    currentProject: state.currentProject,
    error: state.error,
    fetchNodes: state.fetchNodes,
    fetchProject: state.fetchProject,
    fetchModules: state.fetchModules,
    runNode: state.runNode,
    handleHITLAction: state.handleHITLAction,
    deleteIteration: state.deleteIteration,
    clearError: state.clearError
  })));

  const { 
    selectedNodeId, 
    viewMode, toggleSettings,
    activePhase
  } = useUIStore(useShallow(state => ({
    selectedNodeId: state.selectedNodeId,
    viewMode: state.workspaceViewMode,
    toggleSettings: state.toggleSettings,
    activePhase: state.activePhase
  })));


  // Local UI State
  const [loading, setLoading] = useState(false);
  const [nodeContent, setNodeContent] = useState<string | null>(null);
  const [iterations, setIterations] = useState<any[]>([]);
  const [selectedIteration, setSelectedIteration] = useState<any | null>(null);
  const [showRawSpec, setShowRawSpec] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  
  const [showApiErrorModal, setShowApiErrorModal] = useState(false);
  const [showHitlModal, setShowHitlModal] = useState(false);
  const [hitlNode, setHitlNode] = useState<DocumentNode | null>(null);

  const currentPhase = (currentProject?.pipeline_phase as PipelinePhase) || 'GENESIS_PRD';
  const displayPhase = activePhase || currentPhase;

  // Refs
  const apiErrorDismissed = useRef(false);
  const hitlDismissed = useRef(false);

  useEffect(() => {
    fetchProject(projectId);
    fetchNodes(projectId);
    fetchModules(projectId);
  }, [projectId]);

  const selectedNode = useMemo(() => nodes.find(n => n.node_id === selectedNodeId) || null, [nodes, selectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId) {
      setIterations([]); setSelectedIteration(null); setNodeContent(null);
      return;
    }
    const fetchContent = async () => {
      setLoading(true);
      try {
        const iters = await invoke<any[]>('get_node_iterations', { projectId, nodeId: selectedNodeId });
        setIterations(iters);
        if (iters.length > 0) {
          const pass = iters.find(it => it.is_pass);
          const target = pass || iters[iters.length - 1];
          setSelectedIteration(target);
          setNodeContent(target.content_json);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchContent();
  }, [selectedNodeId, nodes]);

  const handleRunNode = async (nodeIdOrType: string) => {
    const result = await runNode(nodeIdOrType);
    if (result.status === 'STALE_REQUIRED') {
      const confirmed = await ask("기존 내용과 차이가 커서 패치 적용에 실패했습니다. 전체 재생성을 진행할까요?", { 
        title: "Regeneration Required", kind: 'warning' 
      });
      if (confirmed) {
        const node = nodes.find(n => n.node_id === nodeIdOrType);
        if (node) await runNode(node.target_node_type);
      }
    }
  };

  useEffect(() => {
    const errorNode = nodes.find(n => n.node_state === 'PAUSED_API_ERROR');
    if (errorNode && !apiErrorDismissed.current) {
      setShowApiErrorModal(true);
    } else if (!errorNode) {
      apiErrorDismissed.current = false;
      setShowApiErrorModal(false);
    }

    const hitl = nodes.find(n => n.node_state === 'PAUSED_HITL');
    // 자동 검증 통과(점수 >= Threshold)인 경우 모달을 띄우지 않음
    if (hitl && !hitlDismissed.current && (hitl.current_best_score < hitl.threshold_score)) {
      setHitlNode(hitl);
      setShowHitlModal(true);
    } else if (!hitl || (hitl && hitl.current_best_score >= hitl.threshold_score)) {
      hitlDismissed.current = false;
      setHitlNode(null);
      setShowHitlModal(false);
    }
  }, [nodes]); // nodes 배열의 참조 안정성이 보장되었으므로 그대로 사용해도 무방하지만, 내부 상태 업데이트 로직을 보강함

  return (
    <div className="workspace-layout">
      <main className="workspace-main">
        <WorkspaceToolbar />

        <div className="workspace-content canvas-grid custom-scrollbar">
          {error && (
            <div className="error-banner m-4">
              <span className="material-symbols-outlined">warning</span>
              <span>{error}</span>
              <Button onClick={() => clearError()}>X</Button>
            </div>
          )}

          <AnimatePresence mode="popLayout">
            <ErrorBoundary>
              {displayPhase === 'GENESIS_PRD' && (
                <motion.div key="genesis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <GenesisPrdView isLocked={currentPhase !== 'GENESIS_PRD'} />
                </motion.div>
              )}

              {displayPhase === 'SAD' && (
                <motion.div key="sad" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <SadOverview isLocked={currentPhase === 'MODULE_GENERATION' || currentPhase === 'COMPLETED'} />
                </motion.div>
              )}

              {(displayPhase === 'MODULE_GENERATION' || displayPhase === 'COMPLETED') && (
                <ModuleGenerationView />
              )}

              {viewMode === 'CONTENT' && (
                <WorkspaceContent 
                  selectedNode={selectedNode}
                  iterations={iterations}
                  selectedIteration={selectedIteration}
                  bestIterationId={selectedIteration?.iteration_id || null}
                  nodeContent={nodeContent}
                  showRawSpec={showRawSpec}
                  showGuidance={showGuidance}
                  loading={loading}
                  onSelectIteration={(it) => { setSelectedIteration(it); setNodeContent(it.content_json); }}
                  onDeleteIteration={(it) => deleteIteration(it.iteration_id)}
                  setShowRawSpec={setShowRawSpec}
                  setShowGuidance={setShowGuidance}
                />
              )}
            </ErrorBoundary>
          </AnimatePresence>
        </div>
      </main>

      <WorkspaceSidebar nodes={nodes} modules={modules} loading={loading} />

      <CriticalErrorModal
        isOpen={showApiErrorModal}
        onClose={() => { setShowApiErrorModal(false); apiErrorDismissed.current = true; }}
        errorMessage={nodes.find(n => n.node_state === 'PAUSED_API_ERROR')?.api_error_message}
        onRetry={() => { setShowApiErrorModal(false); apiErrorDismissed.current = false; const en = nodes.find(n => n.node_state === 'PAUSED_API_ERROR'); if (en) handleRunNode(en.node_id); }}
        onSettings={() => toggleSettings(true)}
      />

      <HitlWarningModal
        isOpen={showHitlModal}
        onClose={() => { setShowHitlModal(false); hitlDismissed.current = true; }}
        onRetry={() => hitlNode && handleHITLAction(hitlNode.node_id, 'RETRY')}
        onApprove={() => hitlNode && handleHITLAction(hitlNode.node_id, 'APPROVE')}
        nodeType={hitlNode?.target_node_type || ''}
        currentScore={hitlNode?.current_best_score || 0}
        threshold={hitlNode?.threshold_score}
      />
    </div>
  );
};

export default Workspace;
