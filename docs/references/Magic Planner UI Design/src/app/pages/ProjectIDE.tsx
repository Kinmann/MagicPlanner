import React, { useState } from 'react';
import { useParams } from 'react-router';
import { SidebarTree } from '../components/SidebarTree';
import { EditorPanel } from '../components/EditorPanel';
import { SystemLog } from '../components/SystemLog';
import { hierarchyData, TreeNode, findNodeById } from '../data/hierarchy';
import { useLayout } from '../context/LayoutContext';

export function ProjectIDE() {
  const { id } = useParams<{ id: string }>();
  const { isLeftSidebarOpen, isRightSidebarOpen } = useLayout();
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([
    '[SYSTEM] Initializing Magic Planner IDE...',
    `[INFO] Loading workspace project: ${id}...`,
    '[SUCCESS] Workspace loaded successfully.'
  ]);

  const handleSelectNode = (node: TreeNode) => {
    setSelectedNodeId(node.id);
    
    const typeLabel = node.type === 'folder' ? 'folder' : 'file';
    setLogs(prev => [
      ...prev, 
      `[INFO] Opened ${typeLabel}: ${node.title}`
    ]);
  };

  const selectedNode = findNodeById(hierarchyData, selectedNodeId);

  return (
    <>
      {isLeftSidebarOpen && (
        <SidebarTree 
          data={hierarchyData} 
          selectedId={selectedNodeId} 
          onSelect={handleSelectNode} 
        />
      )}
      <EditorPanel node={selectedNode} isSidebarOpen={isLeftSidebarOpen} />
      {isRightSidebarOpen && (
        <SystemLog logs={logs} />
      )}
    </>
  );
}
