import React, { useState, useMemo } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FolderOpen, 
  FileText, 
  CircleDashed, 
  CircleDot, 
  CheckCircle2, 
  Lightbulb, 
  PlayCircle,
  PauseCircle,
  Sparkles
} from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { mapNodesToTree, TreeItem } from '../../utils/treeMapper';
import { useShallow } from 'zustand/react/shallow';
import { useLogStore } from '../../store/logStore';
import styles from './SidebarTree.module.scss';

export const SidebarTree: React.FC = () => {
  const { nodes, modules } = useProjectStore(useShallow(state => ({
    nodes: state.nodes,
    modules: state.modules
  })));
  const { selectedNodeId, setSelectedNode } = useUIStore();

  const treeData = useMemo(() => mapNodesToTree(nodes, modules), [nodes, modules]);

  return (
    <div className={styles.sidebarTree}>
      <div className={styles.explorerTitle}>EXPLORER</div>
      <div className={styles.treeContainer}>
        {treeData.map(item => (
          <TreeItemComponent 
            key={item.id} 
            item={item} 
            level={0} 
            selectedId={selectedNodeId || ''} 
            onSelect={(id) => setSelectedNode(id)}
          />
        ))}
      </div>
    </div>
  );
};

interface TreeItemProps {
  item: TreeItem;
  level: number;
  selectedId: string;
  onSelect: (id: string) => void;
}

const TreeItemComponent: React.FC<TreeItemProps> = ({ item, level, selectedId, onSelect }) => {
  const [isOpen, setIsOpen] = useState(true);
  const isSelected = selectedId === item.id;
  const isFolder = item.type === 'folder';

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFolder) setIsOpen(!isOpen);
  };

  const handleSelect = () => {
    if (!isFolder) {
      onSelect(item.id);
    } else if (
      item.id.startsWith('phase-') || 
      item.id.startsWith('group-') || 
      item.id.startsWith('stage-') || 
      item.id.startsWith('module-')
    ) {
      onSelect(item.id);
    }
  };

  const renderStatus = () => {
    if (isFolder) {
      if (!item.folderStatus) return null;
      const statusText = item.folderStatus === 'Completed' ? 'Done' : item.folderStatus;
      const statusClass = item.folderStatus.toLowerCase();
      
      // We don't have separate classes for each folder status in SCSS yet, but we can add them or use inline styles for now.
      // Actually, let's just use the reference-like spans.
      return (
        <span className={`${styles.statusBadge} ${styles[statusClass]}`}>
          {statusText}
        </span>
      );
    }

    const status = item.nodeData?.node_state || 'PENDING';
    const iconProps = { size: 14, className: "shrink-0" };

    switch (status) {
      case 'PENDING': return <CircleDashed {...iconProps} className="text-gray-500" />;
      case 'READY': return <PlayCircle {...iconProps} className="text-sky-400" />;
      case 'IN_PROGRESS': return <CircleDot {...iconProps} className="text-[#10b981]" />;
      case 'COMPLETED': return <CheckCircle2 {...iconProps} className="text-emerald-600" />;
      case 'STALE': return <Lightbulb {...iconProps} className="text-yellow-400 fill-yellow-400/20" />;
      case 'PAUSED_HITL':
      case 'PAUSED_STOPPED': return <PauseCircle {...iconProps} className="text-orange-400" />;
      case 'PAUSED_API_ERROR': return <PauseCircle {...iconProps} className="text-red-400" />;
      case 'REFINING': return <Sparkles {...iconProps} className="text-purple-400" />;
      default: return null;
    }
  };

  return (
    <div>
      <div 
        className={`${styles.treeItem} ${isSelected ? styles.active : ''}`}
        style={{ paddingLeft: `${level * 12 + 12}px` }}
        onClick={handleSelect}
      >
        <div className={styles.itemContent}>
          <span className={styles.toggleIcon} onClick={handleToggle}>
            {isFolder ? (
              isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : (
              <span style={{ width: 14 }} />
            )}
          </span>
          <span className={styles.typeIcon}>
            {isFolder ? (
              isOpen ? <FolderOpen size={14} /> : <Folder size={14} />
            ) : (
              <FileText size={14} className={isSelected ? 'text-[#10b981]' : ''} />
            )}
          </span>
          <span className={styles.nodeTitle}>{item.label}</span>
        </div>
        <div className={styles.statusIndicator}>
          {renderStatus()}
        </div>
      </div>
      {isFolder && isOpen && item.children && (
        <div className={styles.childrenContainer}>
          {item.children.map(child => (
            <TreeItemComponent 
              key={child.id} 
              item={child} 
              level={level + 1} 
              selectedId={selectedId} 
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SidebarTree;
