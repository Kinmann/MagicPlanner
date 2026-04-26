import React from 'react';
import { Box, ChevronDown, Minus, Square, X, Search, Menu, PanelLeft, PanelRight } from 'lucide-react';
import { useLayout } from '../context/LayoutContext';

export function Header() {
  const { isLeftSidebarOpen, isRightSidebarOpen, toggleLeftSidebar, toggleRightSidebar } = useLayout();

  return (
    <div className="h-10 bg-[#18181b] border-b border-[#27272a] flex items-center justify-between px-3 select-none text-gray-400">
      <div className="flex items-center gap-4">
        <Menu size={16} className="cursor-pointer hover:text-white transition-colors" />
        <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 cursor-pointer transition-colors">
          <Box size={14} className="text-[#10b981]" />
          <span className="text-xs font-medium text-gray-200">Magic Planner V1</span>
          <ChevronDown size={14} className="opacity-50" />
        </div>
      </div>
      
      <div className="flex-1 flex justify-center max-w-lg mx-auto px-4">
        <div className="flex items-center gap-2 bg-[#27272a] rounded-md px-3 py-1 w-full max-w-sm border border-[#3f3f46]/30 hover:border-[#10b981]/50 focus-within:border-[#10b981] transition-colors">
          <Search size={14} className="text-gray-500" />
          <input 
            type="text" 
            placeholder="Search nodes..." 
            className="bg-transparent border-none outline-none text-xs text-gray-300 w-full placeholder-gray-500"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 mr-2 border-r border-[#27272a] pr-3">
          <div 
            onClick={toggleLeftSidebar}
            className={`p-1.5 rounded cursor-pointer transition-colors ${isLeftSidebarOpen ? 'bg-[#27272a] text-gray-200' : 'hover:bg-white/10'}`}
            title="Toggle Left Sidebar"
          >
            <PanelLeft size={14} />
          </div>
          <div 
            onClick={toggleRightSidebar}
            className={`p-1.5 rounded cursor-pointer transition-colors ${isRightSidebarOpen ? 'bg-[#27272a] text-gray-200' : 'hover:bg-white/10'}`}
            title="Toggle Right Sidebar"
          >
            <PanelRight size={14} />
          </div>
        </div>
        <div className="p-1.5 hover:bg-white/10 rounded cursor-pointer transition-colors">
          <Minus size={14} />
        </div>
        <div className="p-1.5 hover:bg-white/10 rounded cursor-pointer transition-colors">
          <Square size={12} />
        </div>
        <div className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded cursor-pointer transition-colors">
          <X size={14} />
        </div>
      </div>
    </div>
  );
}
