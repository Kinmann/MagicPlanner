import React from 'react';
import { Settings, Bell, GitBranch, XCircle, CheckCircle2 } from 'lucide-react';

export function StatusBar() {
  return (
    <div className="h-6 bg-[#18181b] border-t border-[#27272a] text-[#10b981] flex items-center justify-between px-4 text-xs select-none">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 hover:bg-white/5 cursor-pointer px-1 rounded transition-colors">
          <GitBranch size={12} />
          <span>main</span>
        </div>
        <div className="flex items-center gap-1 hover:bg-white/5 cursor-pointer px-1 rounded transition-colors">
          <XCircle size={12} className="text-gray-400" />
          <span className="text-gray-400">0</span>
          <CheckCircle2 size={12} className="text-[#10b981] ml-1" />
          <span>0</span>
        </div>
      </div>
      <div className="flex items-center gap-4 text-gray-400">
        <div className="hover:text-gray-200 cursor-pointer">UTF-8</div>
        <div className="hover:text-gray-200 cursor-pointer">Magic-Script</div>
        <div className="flex items-center gap-2">
          <Settings size={14} className="hover:text-gray-200 cursor-pointer" />
          <Bell size={14} className="hover:text-gray-200 cursor-pointer" />
        </div>
      </div>
    </div>
  );
}
