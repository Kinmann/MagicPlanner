import React, { useState } from 'react';
import { 
  ChevronRight, ChevronDown, Folder, FolderOpen, FileText, 
  CircleDashed, PlayCircle, CircleDot, CheckCircle2, PauseCircle, 
  Sparkles, ShieldCheck, PenTool, Lightbulb
} from 'lucide-react';
import { TreeNode, FolderStatus, NodeStatus } from '../data/hierarchy';

interface SidebarTreeProps {
  data: TreeNode[];
  selectedId: string | null;
  onSelect: (node: TreeNode) => void;
}

export function SidebarTree({ data, selectedId, onSelect }: SidebarTreeProps) {
  return (
    <div className="w-80 bg-[#18181b] border-r border-[#27272a] flex flex-col h-full overflow-hidden text-sm select-none">
      <div className="h-10 px-4 flex items-center text-xs font-semibold text-gray-400 tracking-wider shrink-0">
        EXPLORER
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        {data.map(node => (
          <TreeItem 
            key={node.id} 
            node={node} 
            level={0} 
            selectedId={selectedId} 
            onSelect={onSelect} 
          />
        ))}
      </div>
    </div>
  );
}

interface TreeItemProps {
  node: TreeNode;
  level: number;
  selectedId: string | null;
  onSelect: (node: TreeNode) => void;
}

function TreeItem({ node, level, selectedId, onSelect }: TreeItemProps) {
  const [isOpen, setIsOpen] = useState(true);
  const isSelected = selectedId === node.id;
  const isFolder = node.type === 'folder';

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(node);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFolder) {
      setIsOpen(!isOpen);
    }
  };

  const renderFolderStatus = (status?: FolderStatus) => {
    if (!status) return null;
    switch(status) {
      case 'Pending': 
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-400 border border-gray-500/20 uppercase tracking-wider shrink-0 ml-2">Pending</span>;
      case 'Active': 
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20 uppercase tracking-wider shrink-0 flex items-center gap-1 ml-2"><CircleDot size={8} /> Active</span>;
      case 'Completed': 
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider shrink-0 ml-2">Done</span>;
      default: return null;
    }
  };

  const renderNodeStatus = (status?: NodeStatus) => {
    if (!status) return null;
    const iconProps = { size: 14, className: "shrink-0 ml-2" };
    switch(status) {
      case 'Pending': return <CircleDashed {...iconProps} className={`${iconProps.className} text-gray-500`} title="Pending" />;
      case 'Ready': return <PlayCircle {...iconProps} className={`${iconProps.className} text-sky-400`} title="Ready" />;
      case 'In Progress': return <CircleDot {...iconProps} className={`${iconProps.className} text-[#10b981]`} title="In Progress" />;
      case 'Completed': return <CheckCircle2 {...iconProps} className={`${iconProps.className} text-emerald-600`} title="Completed" />;
      case 'Paused': return <PauseCircle {...iconProps} className={`${iconProps.className} text-orange-400`} title="Paused" />;
      case 'Stale': return <Lightbulb {...iconProps} className={`${iconProps.className} text-yellow-400 fill-yellow-400/20`} title="Stale (AI Update Required)" />;
      case 'Refining': return <Sparkles {...iconProps} className={`${iconProps.className} text-purple-400`} title="Refining" />;
      case 'Refined': return <ShieldCheck {...iconProps} className={`${iconProps.className} text-indigo-400`} title="Refined" />;
      default: return null;
    }
  };

  return (
    <div>
      <div 
        className={`group flex items-center justify-between py-1.5 cursor-pointer hover:bg-[#27272a]/60 transition-colors ${
          isSelected ? 'bg-[#27272a] text-[#10b981]' : 'text-gray-300'
        }`}
        style={{ paddingLeft: `${level * 12 + 12}px`, paddingRight: '12px' }}
        onClick={handleSelect}
      >
        <div className="flex items-center min-w-0 flex-1 overflow-hidden">
          <span 
            className={`w-4 h-4 mr-1 flex-shrink-0 flex items-center justify-center text-gray-500 ${isFolder ? 'hover:text-gray-300 hover:bg-[#3f3f46] rounded transition-colors' : ''}`}
            onClick={isFolder ? handleToggle : undefined}
          >
            {isFolder ? (
              isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : (
              <span className="w-4" /> 
            )}
          </span>
          <span className="mr-2 flex-shrink-0 text-gray-400">
            {isFolder ? (
              isOpen ? <FolderOpen size={14} className="text-gray-400" /> : <Folder size={14} className="text-gray-400" />
            ) : (
              <FileText size={14} className={isSelected ? 'text-[#10b981]' : 'text-gray-400'} />
            )}
          </span>
          <span className={`truncate ${isSelected ? 'font-medium text-[#10b981]' : ''}`}>
            {node.title}
          </span>
        </div>
        
        {/* Status Indicators */}
        <div className="flex items-center flex-shrink-0 pl-2 opacity-80 group-hover:opacity-100 transition-opacity">
          {isFolder ? renderFolderStatus(node.folderStatus) : renderNodeStatus(node.nodeStatus)}
        </div>
      </div>
      
      {isFolder && isOpen && node.children && (
        <div>
          {node.children.map(child => (
            <TreeItem 
              key={child.id} 
              node={child} 
              level={level + 1} 
              selectedId={selectedId} 
              onSelect={onSelect} 
            />
          ))}
        </div>
      )}
    </div>
  );
}
