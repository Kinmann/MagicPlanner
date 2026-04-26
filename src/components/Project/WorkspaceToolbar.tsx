import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { 
  FileText, 
  Download, 
  ShieldCheck, 
  MoreHorizontal
} from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useEngineStore } from '../../store/engineStore';
import { PipelinePhase } from '../../types/project';
import { invoke } from '@tauri-apps/api/core';
import { Toolbar, ToolbarGroup, ToolbarSeparator } from '../ui/Toolbar';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Stepper } from '../ui/Stepper';
import styles from './WorkspaceToolbar.module.scss';

const WorkspaceToolbar: React.FC = () => {
  const { 
    viewMode, setViewingPromptProject, selectedNodeId,
    activePhase, setActivePhase, currentProjectId
  } = useUIStore(useShallow(state => ({
    viewMode: state.workspaceViewMode,
    setViewingPromptProject: state.setViewingPromptProject,
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

  const phases: PipelinePhase[] = ['GENESIS_PRD', 'SAD', 'MODULE_GENERATION', 'COMPLETED'];
  const steps = [
    { id: 'GENESIS_PRD', title: 'Genesis PRD', description: 'Goal & Scope' },
    { id: 'SAD', title: 'Architecture', description: 'System Design' },
    { id: 'MODULE_GENERATION', title: 'Modules', description: 'Implementation' },
    { id: 'COMPLETED', title: 'Done', description: 'System Ready' }
  ];

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

  const activeStepIndex = phases.indexOf(displayPhase);

  return (
    <div className={styles.workspaceToolbar}>
      <Toolbar className={styles.toolbar}>
        <ToolbarGroup className="flex-1">
          <Stepper 
            steps={steps} 
            currentStep={activeStepIndex} 
            className={styles.stepper} 
          />
        </ToolbarGroup>
        
        <ToolbarSeparator />

        <ToolbarGroup className="gap-2">
          <Badge variant={currentPhase === 'COMPLETED' ? 'success' : 'primary'} className="h-7">
            {currentPhase.replace('_', ' ')}
          </Badge>

          {currentPhase === 'MODULE_GENERATION' && (
            <Button 
              variant="primary" 
              size="sm"
              onClick={handleFinalize}
              disabled={isProcessing || isFinalizing}
              isLoading={isFinalizing}
              leftIcon={<ShieldCheck size={14} />}
            >
              Finalize System
            </Button>
          )}

          {viewMode === 'BOARD' && currentProjectId && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setViewingPromptProject(currentProjectId)}
              leftIcon={<FileText size={14} />}
            >
              View Prompt
            </Button>
          )}

          {viewMode === 'CONTENT' && selectedNodeId && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => downloadSpecs(selectedNodeId, [])}
              leftIcon={<Download size={14} />}
            >
              Export Specs
            </Button>
          )}

          <Button variant="ghost" size="sm" className="px-1">
            <MoreHorizontal size={16} />
          </Button>
        </ToolbarGroup>
      </Toolbar>
    </div>
  );
};

export default WorkspaceToolbar;
