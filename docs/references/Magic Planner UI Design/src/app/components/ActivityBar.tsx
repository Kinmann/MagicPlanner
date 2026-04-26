import React from 'react';
import { FolderKanban, Layers, Box, Settings, UserCircle, Plus, LayoutDashboard, Smartphone } from 'lucide-react';
import { ViewType } from '../App';

import { useNavigate } from 'react-router';

interface ActivityBarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  activeProjectId: string | null;
  onOpenProject: (projectId: string) => void;
}

export function ActivityBar({ currentView, onViewChange, activeProjectId, onOpenProject }: ActivityBarProps) {
  const navigate = useNavigate();
  
  const projects = [
    { id: 'proj-1', icon: FolderKanban, label: 'Magic Planner V1' },
    { id: 'proj-2', icon: Layers, label: 'Design System Workspace' },
    { id: 'proj-3', icon: Box, label: 'Core API Services' },
    { id: 'proj-4', icon: Smartphone, label: 'Mobile App Refactor' },
  ];

  return (
    <div className="w-14 h-full bg-[#18181b] border-r border-[#27272a] flex flex-col items-center py-3 select-none z-10 shrink-0">
      <div className="flex flex-col gap-3 w-full flex-1">
        
        {/* Dashboard / Home Icon */}
        <div 
          onClick={() => onViewChange('dashboard')}
          className={`relative flex justify-center items-center w-full h-12 cursor-pointer transition-colors mb-2
          ${currentView === 'dashboard' ? 'text-[#10b981]' : 'text-gray-500 hover:text-gray-300'}`}
          title="Dashboard"
        >
          {currentView === 'dashboard' && (
            <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-[#10b981] rounded-r-sm shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
          )}
          <LayoutDashboard size={24} strokeWidth={currentView === 'dashboard' ? 2 : 1.5} />
        </div>
        
        <div className="w-8 h-px bg-[#27272a] mx-auto mb-2 opacity-50" />

        {/* Project Icons */}
        {projects.map((proj) => {
          const Icon = proj.icon;
          const isActive = currentView === 'project' && activeProjectId === proj.id;
          
          return (
            <div 
              key={proj.id}
              onClick={() => onOpenProject(proj.id)}
              className={`relative flex justify-center items-center w-full h-12 cursor-pointer transition-colors
              ${isActive ? 'text-[#10b981]' : 'text-gray-500 hover:text-gray-300'}`}
              title={proj.label}
            >
              {isActive && (
                <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-[#10b981] rounded-r-sm shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              )}
              <Icon size={24} strokeWidth={isActive ? 2 : 1.5} />
            </div>
          );
        })}

        <div 
          onClick={() => navigate('/create')}
          className="relative flex justify-center items-center w-full h-12 cursor-pointer text-gray-600 hover:text-gray-400 transition-colors mt-2" 
          title="Add New Project"
        >
          <div className="p-1.5 rounded-md border border-dashed border-gray-600 hover:border-gray-400">
            <Plus size={16} strokeWidth={2} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 w-full pb-2">
        <div 
          onClick={() => navigate('/profile')}
          className="relative flex justify-center items-center w-full h-12 cursor-pointer text-gray-500 hover:text-gray-300 transition-colors" title="Account">
          <UserCircle size={24} strokeWidth={1.5} />
        </div>
        <div 
          onClick={() => navigate('/settings')}
          className="relative flex justify-center items-center w-full h-12 cursor-pointer text-gray-500 hover:text-gray-300 transition-colors" title="Settings">
          <Settings size={24} strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}
