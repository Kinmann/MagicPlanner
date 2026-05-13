import React, { useMemo } from 'react';
import { Layers } from 'lucide-react';
import { DocumentNode, LocalModule } from '../../types/project';
import PipelineCard from './PipelineCard';
import styles from './PipelineBoard.module.scss';

interface PipelineBoardProps {
  nodes: DocumentNode[];
  modules: LocalModule[];
  isLocked?: boolean;
}

const PipelineBoard: React.FC<PipelineBoardProps> = ({ nodes, modules, isLocked = false }) => {
  // Group nodes by logical stages for better visualization
  const stagedNodes = useMemo(() => {
    const stages: Record<string, DocumentNode[]> = {
      'Discovery': nodes.filter(n => ['PRD', 'FSD'].includes(n.target_node_type)),
      'Design': nodes.filter(n => ['IA', 'User Flow', 'ERD', 'Wireframe'].includes(n.target_node_type)),
      'Implementation': nodes.filter(n => ['API_Spec', 'TC'].includes(n.target_node_type))
    };
    return Object.entries(stages).filter(([_, ns]) => ns.length > 0);
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Layers size={64} className={styles.icon} />
          <p>No active pipeline nodes discovered for this workspace.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {stagedNodes.map(([stageName, stageNodes]) => (
        <div key={stageName} className="relative">
          <div className={styles.stageLabel}>{stageName} Phase</div>
          <div className={styles.stageRow}>
            {stageNodes.map(node => (
              <PipelineCard
                key={node.node_id}
                node={node}
                modules={modules}
                isLocked={isLocked}
              />
            ))}
          </div>
        </div>
      ))}
      
      {/* Visual Hint for connectivity */}
      <div className={styles.connectorLayer}>
        {/* Connection lines could be rendered here dynamically based on nodeDimensions */}
      </div>
    </div>
  );
};

export default PipelineBoard;
