import React from 'react';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { useShallow } from 'zustand/react/shallow';
import GenesisPrdView from '../GenesisPrdView';
import SadOverview from '../SadOverview';
import styles from './NodeRenderer.module.scss';

export const NodeRenderer: React.FC = () => {
  const { nodes } = useProjectStore(useShallow(state => ({
    nodes: state.nodes
  })));

  const { selectedNodeId, isRawMode } = useUIStore(useShallow(state => ({
    selectedNodeId: state.selectedNodeId,
    isRawMode: state.isRawMode
  })));

  if (!selectedNodeId) {
    return (
      <div className={styles.placeholder}>
        <div className={styles.iconWrapper}>
          <div className={styles.spinner} />
        </div>
        <h2>Magic Planner Ready</h2>
        <p>Select a node from the explorer to begin architectural review.</p>
      </div>
    );
  }

  const node = nodes.find(n => n.node_id === selectedNodeId);
  if (!node) return <div>Node not found</div>;

  // Raw Mode View (JSON)
  if (isRawMode) {
    // Safely get content from node or augmented data
    // @ts-ignore
    const rawContent = node?.content_json || (node as any)?.generated_draft_json;
    
    return (
      <div className={styles.rawMode}>
        <div className={styles.header}>
          <h2>Raw Data: {node.target_node_type}</h2>
        </div>
        <div className={styles.codeBlock}>
          <pre>
            {rawContent ? JSON.stringify(typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent, null, 2) : '// No content available'}
          </pre>
        </div>
      </div>
    );
  }

  // UI Mode View (Structured Document)
  if (node.target_node_type.includes('PRD')) {
    return <GenesisPrdView />;
  }

  if (node.target_node_type.includes('SAD')) {
    return <SadOverview />;
  }

  // Fallback for other node types
  return (
    <div className={styles.fallback}>
      <h1>{node.target_node_type}</h1>
      <p>This node type is currently being migrated to the new structured document view.</p>
      <div className={styles.migrationNotice}>
         <p>"The future of software architecture design is being built here..."</p>
      </div>
    </div>
  );
};
