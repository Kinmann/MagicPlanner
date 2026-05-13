import React, { useState, useEffect } from 'react';
import { TreeNode } from '../data/hierarchy';
import { FileText, Link, GitMerge, Code, Copy, LayoutTemplate, FolderOpen, ArrowRight, Info, Play, Settings2 } from 'lucide-react';
import { ContextGoalDetail } from './nodes/ContextGoalDetail';
import { EpicActorDetail } from './nodes/EpicActorDetail';
import { ArchitectureSchemaDetail } from './nodes/ArchitectureSchemaDetail';
import { NodeActionHeader } from './nodes/NodeActionHeader';

interface EditorPanelProps {
  node: TreeNode | null;
  isSidebarOpen?: boolean;
}

export function EditorPanel({ node, isSidebarOpen }: EditorPanelProps) {
  const [content, setContent] = useState('');
  const [isRawMode, setIsRawMode] = useState(false);

  // Reset content when node changes
  useEffect(() => {
    setContent('');
    setIsRawMode(false);
  }, [node?.id]);

  if (!node) {
    return (
      <div className="flex-1 bg-[#121216] flex flex-col items-center justify-center text-gray-500 relative">
        <LayoutTemplate size={48} className="mb-4 text-[#10b981]/20" />
        <p>Select a node from the Explorer to view details</p>
      </div>
    );
  }

  const isFolder = node.type === 'folder';

  return (
    <div className="flex-1 bg-[#121216] flex flex-col overflow-hidden">
      {/* Editor Tabs */}
      <div className="flex h-10 bg-[#18181b] border-b border-[#27272a] select-none text-sm justify-between items-center pr-2">
        <div className="flex items-center h-full overflow-x-auto">
          <div className="flex items-center gap-2 px-4 py-2 border-t-2 border-[#10b981] bg-[#121216] text-gray-200 min-w-fit h-full">
            <LayoutTemplate size={14} className="text-[#10b981]" />
            <span className="truncate font-medium">저메추!</span>
          </div>
        </div>
        
        <button className="flex items-center gap-1.5 px-3 py-1.5 mr-1 text-xs font-medium text-gray-400 hover:bg-[#27272a] hover:text-gray-200 rounded transition-colors shrink-0">
          <Info size={14} />
          <span>Project Info</span>
        </button>
      </div>

      {/* Editor Breadcrumb */}
      <div className="px-4 py-1.5 bg-[#121216] border-b border-[#27272a]/50 text-xs text-gray-500 flex items-center gap-1.5">
        <span className="hover:text-gray-300 cursor-pointer transition-colors">저메추!</span>
        <span className="opacity-50">/</span>
        <span className="hover:text-gray-300 cursor-pointer transition-colors">{node.title}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          
          <div className="flex flex-col gap-3 border-b border-[#27272a] pb-5">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-3">
                  {isFolder ? <FolderOpen size={24} className="text-[#10b981]" /> : <FileText size={24} className="text-[#10b981]" />}
                  {node.title}
                </h1>
                <p className="text-sm text-gray-400">
                  {isFolder ? 'Folder container for managing nested modules and stages.' : 'Document node for detailed technical specification.'}
                </p>
              </div>

              {!isFolder && (
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <div className="flex items-center gap-2 bg-[#121216] border border-[#27272a] rounded px-3 py-1.5 h-8">
                    <Settings2 size={14} className="text-gray-400" />
                    <span className="text-xs font-medium text-gray-300">Iteration</span>
                    <div className="flex items-center gap-1 text-sm font-mono">
                      <span className="text-[#10b981]">2</span>
                      <span className="text-gray-500">/</span>
                      <input 
                        type="number" 
                        defaultValue={3}
                        className="w-8 bg-transparent text-gray-300 border-b border-dashed border-gray-600 focus:outline-none focus:border-[#10b981] text-center"
                        min={1}
                        max={10}
                      />
                    </div>
                  </div>

                  <button className="flex items-center justify-center gap-1.5 px-4 py-1.5 h-8 text-xs font-medium bg-[#10b981]/10 text-[#10b981] hover:bg-[#10b981]/20 border border-[#10b981]/30 rounded transition-colors">
                    <Play size={14} className="fill-current" />
                    Start
                  </button>
                  
                  <button className="flex items-center justify-center gap-1.5 px-4 py-1.5 h-8 text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/30 rounded transition-colors">
                    Next Step
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>

            {!isFolder && (
              <div className="w-full block">
                <NodeActionHeader 
                  isRawMode={isRawMode} 
                  onToggleRawMode={() => setIsRawMode(!isRawMode)} 
                />
              </div>
            )}
          </div>

          {node.refs && node.refs.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold tracking-wider text-gray-400 uppercase flex items-center gap-2">
                <Link size={14} /> References / Dependencies
              </h2>
              <div className="flex flex-wrap gap-2">
                {node.refs.map((ref, idx) => (
                  <div key={idx} className="bg-[#1e1e24] border border-[#27272a] text-xs px-2.5 py-1.5 rounded flex items-center gap-2 hover:border-[#10b981]/50 cursor-pointer transition-colors">
                    <GitMerge size={12} className="text-[#10b981]" />
                    <span className="text-gray-300">{ref}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {node.id === 'p1n1' ? (
            <ContextGoalDetail isRawMode={isRawMode} />
          ) : node.id === 'p1n2' ? (
            <EpicActorDetail isRawMode={isRawMode} />
          ) : node.id === 'p1n3' ? (
            <ArchitectureSchemaDetail isRawMode={isRawMode} />
          ) : !isFolder ? (
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-wider text-gray-400 uppercase flex items-center gap-2">
                  <Code size={14} /> Editor
                </h2>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <button className="flex items-center gap-1 hover:text-gray-300 transition-colors">
                    <Copy size={12} /> Copy Markdown
                  </button>
                </div>
              </div>
              <textarea
                value={content || `## ${node.title}\n\nStart typing documentation here...`}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-[400px] bg-[#1e1e24] border border-[#27272a] rounded p-4 text-gray-300 font-mono text-sm leading-relaxed focus:outline-none focus:border-[#10b981]/50 focus:ring-1 focus:ring-[#10b981]/50 transition-all resize-none"
                placeholder="Write your documentation in Markdown..."
              />
            </div>
          ) : (
            <div className="bg-[#1e1e24] border border-[#27272a] rounded p-8 text-center border-dashed">
              <div className="text-gray-500 space-y-2">
                <p>This is a folder node.</p>
                <p className="text-xs">Expand this folder in the Explorer sidebar to view its contents.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
