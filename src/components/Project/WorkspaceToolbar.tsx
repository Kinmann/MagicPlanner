import React, { useState } from 'react';
import Header from '../layout/Header';
import PhaseProgressBar from './PhaseProgressBar';
import Button from '../common/Button';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useEngineStore } from '../../store/engineStore';
import { PipelinePhase } from '../../types/project';
import { invoke } from '@tauri-apps/api/core';

const WorkspaceToolbar: React.FC = () => {
  const { 
    viewMode, setViewingPromptProject, closeProject, selectedNodeId,
    activePhase, setActivePhase, currentProjectId
  } = useUIStore(useShallow(state => ({
    viewMode: state.workspaceViewMode,
    setViewingPromptProject: state.setViewingPromptProject,
    closeProject: state.closeProject,
    selectedNodeId: state.selectedNodeId,
    activePhase: state.activePhase,
    setActivePhase: state.setActivePhase,
    currentProjectId: state.currentProjectId
  })));

  const { currentProject, downloadSpecs, fetchProject, fetchNodes } = useProjectStore(useShallow(state => ({
    currentProject: state.currentProject,
    downloadSpecs: state.downloadSpecs,
    fetchProject: state.fetchProject,
    fetchNodes: state.fetchNodes
  })));

  const { isProcessing } = useEngineStore();
  const [isFinalizing, setIsFinalizing] = useState(false);

  const currentPhase = (currentProject?.pipeline_phase as PipelinePhase) || 'GENESIS_PRD';
  const displayPhase = activePhase || currentPhase;

  const handleFinalize = async () => {
    if (!currentProjectId) return;
    setIsFinalizing(true);
    try {
      await invoke('finalize_module_generation', { projectId: currentProjectId });
      fetchProject(currentProjectId);
      fetchNodes(currentProjectId);
      setActivePhase(null);
    } catch (e) { console.error(e); }
    finally { setIsFinalizing(false); }
  };

  const handlePhaseClick = (phase: PipelinePhase) => {
    const phases = ['GENESIS_PRD', 'SAD', 'MODULE_GENERATION', 'COMPLETED'];
    if (phases.indexOf(phase) <= phases.indexOf(currentPhase)) {
      setActivePhase(phase);
    }
  };

  return (
    <>
      <Header 
        title={currentProject?.project_name || "Workspace"}
        onBack={() => closeProject()}
      >
        <div className="header-status-badge">
          <span className="dot active"></span>
          <span className="text">{currentPhase} PHASE</span>
        </div>

        {currentPhase === 'MODULE_GENERATION' && (
          <Button 
            variant="primary" 
            size="sm"
            onClick={handleFinalize}
            disabled={isProcessing || isFinalizing}
            isLoading={isFinalizing}
            leftIcon={<span className="material-symbols-outlined">verified</span>}
          >
            Finalize System
          </Button>
        )}
        {viewMode === 'BOARD' && currentProjectId && (
          <button 
            className="header-action-button"
            onClick={() => setViewingPromptProject(currentProjectId)}
          >
            <span className="material-symbols-outlined">article</span>
            View Prompt
          </button>
        )}
        {viewMode === 'CONTENT' && selectedNodeId && (
          <button 
            className="header-action-button"
            onClick={() => downloadSpecs(selectedNodeId, [])} // iterations will be handled in store or we need to pass them
          >
            <span className="material-symbols-outlined">download</span>
            Export Specs
          </button>
        )}
      </Header>

      <PhaseProgressBar 
        currentPhase={currentPhase} 
        activePhase={displayPhase}
        onPhaseClick={handlePhaseClick}
      />
    </>
  );
};

export default WorkspaceToolbar;
