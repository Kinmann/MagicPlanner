import React, { useEffect } from 'react';
import { Group as PanelGroup, Panel } from 'react-resizable-panels';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '../store/projectStore';
import { useUIStore } from '../store/uiStore';
import { SidebarTree } from '../components/layout/SidebarTree';
import { EditorPanel } from '../components/layout/EditorPanel';
import { RightPanel } from '../components/layout/RightPanel';
import { SystemLog } from '../components/layout/SystemLog';
import { ResizeHandle } from '../components/ui/ResizeHandle';
import styles from './Workspace.module.scss';

interface WorkspaceProps {
  projectId: string;
}

const Workspace: React.FC<WorkspaceProps> = ({ projectId }) => {
  const { fetchNodes, fetchProject, fetchModules } = useProjectStore(useShallow(state => ({
    fetchNodes: state.fetchNodes,
    fetchProject: state.fetchProject,
    fetchModules: state.fetchModules
  })));

  const { 
    sidebarWidth, setSidebarWidth,
    metaPanelWidth, setMetaPanelWidth,
    logPanelHeight, setLogPanelHeight,
    isSidebarOpen, isRightPanelOpen
  } = useUIStore();

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
      fetchNodes(projectId);
      fetchModules(projectId);
    }
  }, [projectId]);

  // Determine indices based on what's open
  const getPanelIndices = () => {
    let sidebarIdx = -1;
    let centerIdx = 0;
    let metaIdx = -1;
    
    if (isSidebarOpen) {
      sidebarIdx = 0;
      centerIdx = 1;
    }
    
    if (isRightPanelOpen) {
      metaIdx = centerIdx + 1;
    }
    
    return { sidebarIdx, centerIdx, metaIdx };
  };

  const handleHorizontalLayoutChange = (layout: any) => {
    if (Array.isArray(layout)) {
      const { sidebarIdx, metaIdx } = getPanelIndices();
      if (sidebarIdx !== -1 && Math.abs(layout[sidebarIdx] - sidebarWidth) > 0.1) {
        setSidebarWidth(layout[sidebarIdx]);
      }
      if (metaIdx !== -1 && Math.abs(layout[metaIdx] - metaPanelWidth) > 0.1) {
        setMetaPanelWidth(layout[metaIdx]);
      }
    } else if (layout && typeof layout === 'object') {
      if (layout.sidebar !== undefined && Math.abs(layout.sidebar - sidebarWidth) > 0.1) {
        setSidebarWidth(layout.sidebar);
      }
      if (layout.meta !== undefined && Math.abs(layout.meta - metaPanelWidth) > 0.1) {
        setMetaPanelWidth(layout.meta);
      }
    }
  };

  return (
    <div className={styles.workspace}>
      {/* Outer Horizontal Group (Sidebar | Center | Meta) */}
      <PanelGroup 
        orientation="horizontal" 
        onLayoutChange={handleHorizontalLayoutChange}
      >
        {/* 1. Sidebar */}
        {isSidebarOpen && (
          <>
            <Panel id="sidebar" defaultSize={`${sidebarWidth}%`} minSize="15%" maxSize="60%">
              <SidebarTree />
            </Panel>
            <ResizeHandle />
          </>
        )}
        
        {/* 2. Center Area (Editor / Log) */}
        <Panel id="center" minSize="20%">
          <PanelGroup 
            orientation="vertical"
            onLayoutChange={(layout: any) => {
              if (Array.isArray(layout)) {
                if (layout.length > 1 && Math.abs(layout[1] - logPanelHeight) > 0.1) {
                  setLogPanelHeight(layout[1]);
                }
              } else if (layout && typeof layout === 'object') {
                if (layout.log !== undefined && Math.abs(layout.log - logPanelHeight) > 0.1) {
                  setLogPanelHeight(layout.log);
                }
              }
            }}
          >
            <Panel id="editor" defaultSize={`${100 - logPanelHeight}%`} minSize="20%">
              <EditorPanel />
            </Panel>

            <ResizeHandle direction="vertical" />

            {/* Bottom System Log */}
            <Panel id="log" defaultSize={`${logPanelHeight}%`} minSize="10%" maxSize="80%">
              <SystemLog />
            </Panel>
          </PanelGroup>
        </Panel>

        {/* 3. Meta Panel (Right) */}
        {isRightPanelOpen && (
          <>
            <ResizeHandle />
            <Panel id="meta" defaultSize={`${metaPanelWidth}%`} minSize="15%" maxSize="60%">
              <RightPanel />
            </Panel>
          </>
        )}
      </PanelGroup>
    </div>
  );
};

export default Workspace;
