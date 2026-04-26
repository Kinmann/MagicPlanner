export type NodeType = 'folder' | 'file';
export type FolderStatus = 'Pending' | 'Active' | 'Completed';
export type NodeStatus = 'Pending' | 'Ready' | 'In Progress' | 'Completed' | 'Paused' | 'Stale' | 'Refining' | 'Refined';

export interface TreeNode {
  id: string;
  title: string;
  type: NodeType;
  folderStatus?: FolderStatus;
  nodeStatus?: NodeStatus;
  children?: TreeNode[];
  refs?: string[];
  content?: string;
}

export const hierarchyData: TreeNode[] = [
  {
    id: 'phase1',
    title: 'Phase 1: Genesis PRD',
    type: 'folder',
    folderStatus: 'Completed',
    children: [
      { id: 'p1n1', title: 'Node 1: Context & Goal', type: 'file', nodeStatus: 'Completed' },
      { id: 'p1n2', title: 'Node 2: Epics & Actors', type: 'file', nodeStatus: 'Completed' },
      { id: 'p1n3', title: 'Node 3: Architecture & Schema', type: 'file', nodeStatus: 'Refined' },
    ]
  },
  {
    id: 'phase2',
    title: 'Phase 2: System Architecture System',
    type: 'folder',
    folderStatus: 'Active',
    children: [
      {
        id: 'p2s1',
        title: 'Stage 1: Global Context',
        type: 'folder',
        folderStatus: 'Completed',
        children: [
          { id: 'p2s1n1', title: 'Node 1: Non tech', type: 'file', nodeStatus: 'Completed' },
          { id: 'p2s1n2', title: 'Node 2: Tech stack', type: 'file', nodeStatus: 'Completed', refs: ['Node 1: Non tech'] },
          { id: 'p2s1n3', title: 'Node 3: Core ERD', type: 'file', nodeStatus: 'Refined', refs: ['Node 2: Tech stack'] },
          { id: 'p2s1n4', title: 'Node 4: Auth & RBAC', type: 'file', nodeStatus: 'Completed', refs: ['Node 1: Non tech', 'Node 3: Core ERD'] },
          { id: 'p2s1n5', title: 'Node 5: Interface & Errors', type: 'file', nodeStatus: 'Completed', refs: ['Node 2: Tech stack', 'Node 4: Auth & RBAC'] },
        ]
      },
      {
        id: 'p2s2',
        title: 'Stage 2: Module Split',
        type: 'folder',
        folderStatus: 'Active',
        children: [
          { id: 'p2s2n1', title: 'Node 1: Module list', type: 'file', nodeStatus: 'In Progress' },
          { id: 'p2s2n2', title: 'Node 2: Epic Mapping', type: 'file', nodeStatus: 'Ready', refs: ['Node 1: Module list'] },
          { id: 'p2s2n3', title: 'Node 3: Module dependencies', type: 'file', nodeStatus: 'Pending', refs: ['Node 1: Module list', 'Node 2: Epic Mapping'] },
        ]
      }
    ]
  },
  {
    id: 'phase3',
    title: 'Phase 3: Modules',
    type: 'folder',
    folderStatus: 'Pending',
    children: [
      {
        id: 'p3m1',
        title: 'Module 1',
        type: 'folder',
        folderStatus: 'Pending',
        children: [
          { id: 'p3m1n1', title: 'Node 1: PRD', type: 'file', nodeStatus: 'Pending' },
          { id: 'p3m1n2', title: 'Node 2: FSD', type: 'file', nodeStatus: 'Pending', refs: ['Node 1: PRD'] },
          { id: 'p3m1n3', title: 'Node 3: ERD', type: 'file', nodeStatus: 'Paused', refs: ['Node 2: FSD'] },
          { id: 'p3m1n4', title: 'Node 4: API_SPEC', type: 'file', nodeStatus: 'Stale', refs: ['Node 2: FSD', 'Node 3: ERD'] },
          { id: 'p3m1n5', title: 'Node 5: UserFlow', type: 'file', nodeStatus: 'Refining', refs: ['Node 2: FSD'] },
          { id: 'p3m1n6', title: 'Node 6: IA', type: 'file', nodeStatus: 'Pending', refs: ['Node 2: FSD', 'Node 5: UserFlow'] },
          { id: 'p3m1n7', title: 'Node 7: Wireframe', type: 'file', nodeStatus: 'Pending', refs: ['Node 6: IA', 'Node 4: API_SPEC'] },
          { id: 'p3m1n8', title: 'Node 8: TC', type: 'file', nodeStatus: 'Pending', refs: ['Node 1: PRD', 'Node 2: FSD', 'Node 4: API_SPEC'] },
        ]
      }
    ]
  }
];

export function findNodeById(nodes: TreeNode[], id: string | null): TreeNode | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}
