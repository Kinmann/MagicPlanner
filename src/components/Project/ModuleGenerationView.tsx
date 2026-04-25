import React from 'react';
import { motion } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import ModuleTree from './ModuleTree';
import PipelineBoard from './PipelineBoard';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useEngineStore } from '../../store/engineStore';

const ModuleGenerationView: React.FC = () => {
  const { nodes, modules } = useProjectStore(
    useShallow((state) => ({
      nodes: state.nodes,
      modules: state.modules
    }))
  );

  const { selectedModuleId, setSelectedModule, viewMode } = useUIStore(
    useShallow((state) => ({
      selectedModuleId: state.selectedModuleId,
      setSelectedModule: state.setSelectedModule,
      viewMode: state.workspaceViewMode
    }))
  );

  const isProcessing = useEngineStore((state) => state.isProcessing);

  if (viewMode !== 'BOARD') return null;

  const moduleNodes = selectedModuleId ? nodes.filter(n => n.node_id === selectedModuleId || n.module_id === selectedModuleId) : [];

  return (
    <motion.div 
      key="modules" 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }} 
      className="module-layout"
    >
      <div className="module-panel">
        <ModuleTree
          modules={modules}
          selectedModuleId={selectedModuleId}
          onSelectModule={setSelectedModule}
        />
      </div>

      <div className="module-content">
        <motion.div key="board" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <PipelineBoard 
            nodes={moduleNodes} 
            modules={modules}
            disabled={isProcessing}
          />

          {selectedModuleId && (() => {
            const mNodes = nodes.filter(n => n.module_id === selectedModuleId);
            const completedCount = mNodes.filter(n => n.node_state === 'COMPLETED').length;
            const total = mNodes.length || 1;
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
      </div>
    </motion.div>
  );
};

export default ModuleGenerationView;
