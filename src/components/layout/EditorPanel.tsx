import React from 'react';
import { X, FileText, ChevronRight, Folder } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { NodeRenderer } from '../Project/Renderer/NodeRenderer';
import { ErrorBoundary } from '../ui/Layout';
import styles from './EditorPanel.module.scss';

export const EditorPanel: React.FC = () => {
  const { 
    selectedNodeId, 
    openNodeIds, 
    setSelectedNode, 
    closeTab,
    workspaceViewMode 
  } = useUIStore();
  
  const { nodes, currentProject } = useProjectStore();

  const openNodes = openNodeIds
    .map(id => nodes.find(n => n.node_id === id))
    .filter(Boolean);

  const selectedNode = nodes.find(n => n.node_id === selectedNodeId);

  // Breadcrumb logic
  const renderBreadcrumb = () => {
    if (!selectedNode) return null;
    return (
      <div className={styles.breadcrumb}>
        <span className={styles.breadcrumbItem}>{currentProject?.project_name || 'Project'}</span>
        <ChevronRight size={12} className={styles.breadcrumbSep} />
        <span className={styles.breadcrumbItem}>
          <Folder size={12} className="mr-1 opacity-60" />
          {selectedNode.node_category}
        </span>
        <ChevronRight size={12} className={styles.breadcrumbSep} />
        <span className={`${styles.breadcrumbItem} ${styles.active}`}>
          <FileText size={12} className="mr-1 opacity-60" />
          {selectedNode.target_node_type}
        </span>
      </div>
    );
  };

  if (workspaceViewMode === 'BOARD' || !selectedNodeId) {
    return (
      <div className={styles.editorPanel}>
        <div className={styles.emptyState}>
          <div className={styles.logoWatermark}>MAGIC PLANNER</div>
          <p>Select a node from the explorer to view its contents</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.editorPanel}>
      {/* Tab Bar */}
      <div className={styles.tabs}>
        {openNodes.map((node) => (
          node && (
            <div 
              key={node.node_id}
              className={`${styles.tab} ${selectedNodeId === node.node_id ? styles.active : ''}`}
              onClick={() => setSelectedNode(node.node_id)}
            >
              <FileText size={14} className="mr-2 opacity-70" />
              <span className={styles.tabTitle}>{node.target_node_type}</span>
              <div 
                className={styles.closeTabBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(node.node_id);
                }}
              >
                <X size={12} />
              </div>
            </div>
          )
        ))}
      </div>

      {/* Toolbar / Breadcrumb */}
      <div className={styles.toolbar}>
        {renderBreadcrumb()}
      </div>

      {/* Main Content Area */}
      <div className={styles.content}>
        <ErrorBoundary>
          <NodeRenderer />
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default EditorPanel;
