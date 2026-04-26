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

  if (nodeStates.every(s => s === 'COMPLETED' || s === 'Completed')) return 'Completed';
  if (nodeStates.some(s => s === 'IN_PROGRESS' || s === 'Active')) return 'Active';
  return 'Pending';
};

const sortNodes = (nodes: DocumentNode[]) => {
  return [...nodes].sort((a, b) => a.target_node_type.localeCompare(b.target_node_type));
};

const NODE_LABELS: Record<string, string> = {
  '1-A': 'Node 1: Context & Goal',
  '1-B': 'Node 2: Epics & Actors',
  '1-C': 'Node 3: Architecture & Schema',
  '1-D': 'Node 1: Non tech',
  '1-E': 'Node 2: Tech stack',
  '1-F': 'Node 3: Core ERD',
  '1-G': 'Node 4: Auth & RBAC',
  '1-H': 'Node 5: Interface & Errors',
  '2-A': 'Node 1: Module list',
  '2-B': 'Node 2: Epic Mapping',
  '2-C': 'Node 3: Module dependencies',
  '3-A': 'Node 1: PRD',
  '3-B': 'Node 2: FSD',
  '3-C': 'Node 3: ERD',
  '3-D': 'Node 4: API_SPEC',
  '3-E': 'Node 5: UserFlow',
  '3-F': 'Node 6: IA',
  '3-G': 'Node 7: Wireframe',
  '3-H': 'Node 8: TC',
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
  const gprdChildren = buildChildren(['1-A', '1-B', '1-C']);
  tree.push({
    id: 'phase-gprd',
    label: 'Phase 1: Genesis PRD',
    type: 'folder',
    folderStatus: calculateFolderStatus(gprdChildren),
    children: gprdChildren
  });

  // 2. SAD Phase
  const sadGlobalChildren = buildChildren(['1-D', '1-E', '1-F', '1-G', '1-H']);
  const sadSplitChildren = buildChildren(['2-A', '2-B', '2-C']);
  
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
      const moduleBlueprint = ['3-A', '3-B', '3-C', '3-D', '3-E', '3-F', '3-G', '3-H'];
      
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
