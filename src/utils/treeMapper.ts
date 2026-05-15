import { DocumentNode, LocalModule } from '../types/project';

export interface TreeItem {
  id: string;
  label: string;
  type: 'folder' | 'node';
  children?: TreeItem[];
  nodeData?: DocumentNode;
  isExpanded?: boolean;
  folderStatus?: 'Pending' | 'Active' | 'Completed'; // 추가
}

const calculateFolderStatus = (items: TreeItem[]): 'Pending' | 'Active' | 'Completed' => {
  const nodeStates = items.flatMap(item => 
    item.type === 'node' && item.nodeData 
      ? [item.nodeData.node_state] 
      : item.children ? [calculateFolderStatus(item.children)] : []
  );

  if (nodeStates.length === 0) return 'Pending';
  
  // If any child node is in an active-like state, the folder is Active
  const isActive = nodeStates.some(s => 
    s === 'IN_PROGRESS' || 
    s === 'Active' || 
    s === 'REFINING' || 
    s === 'READY' || 
    s === 'PAUSED_HITL' ||
    s === 'REVIEW_PENDING' ||
    s === 'STALE'
  );
  
  if (isActive) return 'Active';

  // If all children are completed, the folder is Completed
  const isAllCompleted = nodeStates.every(s => s === 'COMPLETED' || s === 'Completed' || s === 'REVIEWED');
  if (isAllCompleted) return 'Completed';

  return 'Pending';
};

const NODE_LABELS: Record<string, string> = {
  'GPRD_Context_Goal': 'Node 1: Context & Goal',
  'GPRD_Capability_Actor': 'Node 2: Epics & Actors',
  'GPRD_Architecture_Schema': 'Node 3: Architecture & Schema',
  'SAD_Non_Tech': 'Node 1: Non tech',
  'SAD_Tech_Stack': 'Node 2: Tech stack',
  'SAD_Auth_RBAC': 'Node 3: Auth & RBAC',
  'SAD_Core_ERD': 'Node 4: Core ERD',
  'SAD_Interface_Error': 'Node 5: Interface & Errors',
  'SAD_Module_List': 'Node 1: Module list',
  'SAD_Epic_Mapping': 'Node 2: Epic Mapping',
  'SAD_Module_Deps': 'Node 3: Module dependencies',
  'PRD': 'Node 1: PRD',
  'FSD': 'Node 2: FSD',
  'ERD': 'Node 3: ERD',
  'API_Spec': 'Node 4: API_Spec',
  'User Flow': 'Node 5: User Flow',
  'IA': 'Node 6: IA',
  'Wireframe': 'Node 7: Wireframe',
  'TC': 'Node 8: TC',
};

export const mapNodesToTree = (
  nodes: DocumentNode[], 
  modules: LocalModule[]
): TreeItem[] => {
  const tree: TreeItem[] = [];

  const buildChildren = (blueprint: string[]) => {
    return blueprint.map(type => {
      const node = nodes.find(n => n.target_node_type === type);
      return {
        id: node?.node_id || `mock-${type}`,
        label: NODE_LABELS[type] || type,
        type: 'node' as const,
        nodeData: node
      };
    });
  };

  // 1. GPRD Phase
  const gprdChildren = buildChildren(['GPRD_Context_Goal', 'GPRD_Capability_Actor', 'GPRD_Architecture_Schema']);
  tree.push({
    id: 'phase-gprd',
    label: 'Phase 1: Genesis PRD',
    type: 'folder',
    folderStatus: calculateFolderStatus(gprdChildren),
    children: gprdChildren
  });

  // 2. SAD Phase
  const sadGlobalChildren = buildChildren(['SAD_Non_Tech', 'SAD_Tech_Stack', 'SAD_Auth_RBAC', 'SAD_Core_ERD', 'SAD_Interface_Error']);
  const sadSplitChildren = buildChildren(['SAD_Module_List', 'SAD_Epic_Mapping', 'SAD_Module_Deps']);
  
  const sadChildren: TreeItem[] = [
    {
      id: 'group-sad-global',
      label: 'Stage 1: Global Context',
      type: 'folder',
      folderStatus: calculateFolderStatus(sadGlobalChildren),
      children: sadGlobalChildren
    },
    {
      id: 'group-sad-split',
      label: 'Stage 2: Module Split',
      type: 'folder',
      folderStatus: calculateFolderStatus(sadSplitChildren),
      children: sadSplitChildren
    }
  ];

  tree.push({
    id: 'phase-sad',
    label: 'Phase 2: System Architecture',
    type: 'folder',
    folderStatus: calculateFolderStatus(sadChildren),
    children: sadChildren
  });

  // 3. MODULES Phase
  if (modules.length > 0) {
    const modulesChildren: TreeItem[] = modules.map(m => {
      const moduleNodes = nodes.filter(n => n.module_id === m.module_id);
      const moduleBlueprint = ['PRD', 'FSD', 'ERD', 'API_Spec', 'User Flow', 'IA', 'Wireframe', 'TC'];
      
      const children: TreeItem[] = moduleBlueprint.map(type => {
        const node = moduleNodes.find(n => n.target_node_type === type);
        return {
          id: node?.node_id || `mock-${m.module_id}-${type}`,
          label: NODE_LABELS[type] || type,
          type: 'node' as const,
          nodeData: node
        };
      });

      return {
        id: `module-${m.module_id}`,
        label: m.module_name,
        type: 'folder',
        folderStatus: calculateFolderStatus(children),
        children
      };
    });

    tree.push({
      id: 'phase-modules',
      label: 'Phase 3: Modules',
      type: 'folder',
      folderStatus: calculateFolderStatus(modulesChildren),
      children: modulesChildren
    });
  } else {
    tree.push({
      id: 'phase-modules',
      label: 'Phase 3: Modules',
      type: 'folder',
      folderStatus: 'Pending',
      children: []
    });
  }

  return tree;
};
