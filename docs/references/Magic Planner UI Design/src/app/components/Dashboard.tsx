import React from 'react';
import { useNavigate } from 'react-router';
import { FolderKanban, Clock, MoreVertical, Plus, Box, Layers, ArrowRight, BarChart2, GitCommit, Users } from 'lucide-react';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  progress: number;
  lastUpdated: string;
  members: number;
  nodesCount: number;
}

const mockProjects: Project[] = [
  {
    id: 'proj-1',
    name: 'Magic Planner V1',
    description: 'Core planning application with AI node generation and IDE-like interface.',
    status: 'Active',
    progress: 68,
    lastUpdated: '10 mins ago',
    members: 4,
    nodesCount: 24,
  },
  {
    id: 'proj-2',
    name: 'Design System Workspace',
    description: 'Component library and design tokens for internal tools and client projects.',
    status: 'In Progress',
    progress: 35,
    lastUpdated: '2 hours ago',
    members: 6,
    nodesCount: 52,
  },
  {
    id: 'proj-3',
    name: 'Core API Services',
    description: 'Backend microservices for data synchronization and user management.',
    status: 'Completed',
    progress: 100,
    lastUpdated: 'Yesterday',
    members: 3,
    nodesCount: 18,
  },
  {
    id: 'proj-4',
    name: 'Mobile App Refactor',
    description: 'React Native migration and performance optimization for main mobile app.',
    status: 'Pending',
    progress: 0,
    lastUpdated: '3 days ago',
    members: 2,
    nodesCount: 12,
  }
];

interface DashboardProps {
  onOpenProject: (projectId: string) => void;
}

export function Dashboard({ onOpenProject }: DashboardProps) {
  const navigate = useNavigate();

  return (
    <div className="flex-1 bg-[#121216] flex flex-col overflow-y-auto">
      {/* Dashboard Header */}
      <div className="h-48 bg-[#18181b] border-b border-[#27272a] relative overflow-hidden shrink-0">
        <div className="absolute inset-0 bg-gradient-to-r from-[#10b981]/10 to-transparent pointer-events-none" />
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
          <FolderKanban size={200} />
        </div>
        
        <div className="relative h-full flex flex-col justify-end p-8 max-w-6xl mx-auto w-full">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-100 flex items-center gap-3 mb-2">
                Workspace Dashboard
              </h1>
              <p className="text-gray-400 max-w-xl">
                Manage your projects, track progress, and jump back into your recent work. 
                Select a project to enter the Magic Planner IDE.
              </p>
            </div>
            <button 
              onClick={() => navigate('/create')}
              className="flex items-center gap-2 bg-[#10b981] hover:bg-[#059669] text-[#121216] font-semibold px-4 py-2 rounded-md transition-colors shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              <Plus size={18} />
              New Project
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
        
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard icon={<FolderKanban />} label="Total Projects" value="12" />
          <StatCard icon={<BarChart2 />} label="Active Tasks" value="48" color="text-[#10b981]" />
          <StatCard icon={<GitCommit />} label="Nodes Generated" value="342" color="text-purple-400" />
          <StatCard icon={<Users />} label="Team Members" value="8" color="text-blue-400" />
        </div>

        {/* Project Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-200">Recent Projects</h2>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="cursor-pointer hover:text-white">All</span>
              <span>/</span>
              <span className="cursor-pointer hover:text-white text-[#10b981]">Active</span>
              <span>/</span>
              <span className="cursor-pointer hover:text-white">Completed</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            {mockProjects.map(project => (
              <ProjectCard key={project.id} project={project} onOpen={() => onOpenProject(project.id)} />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color = "text-gray-400" }: { icon: React.ReactNode, label: string, value: string, color?: string }) {
  return (
    <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-5 flex items-center gap-4">
      <div className={`p-3 bg-[#27272a]/50 rounded-md ${color}`}>
        {React.cloneElement(icon as React.ReactElement, { size: 24 })}
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-200">{value}</p>
      </div>
    </div>
  );
}

function ProjectCard({ project, onOpen }: { project: Project, onOpen: () => void }) {
  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Active': return 'text-[#10b981] bg-[#10b981]/10 border-[#10b981]/20';
      case 'In Progress': return 'text-sky-400 bg-sky-400/10 border-sky-400/20';
      case 'Completed': return 'text-emerald-600 bg-emerald-600/10 border-emerald-600/20';
      case 'Pending': return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
  };

  const getIcon = (name: string) => {
    if (name.includes('Design')) return <Layers className="text-purple-400" />;
    if (name.includes('API')) return <Box className="text-blue-400" />;
    return <FolderKanban className="text-[#10b981]" />;
  };

  return (
    <div 
      className="bg-[#18181b] border border-[#27272a] rounded-lg p-5 hover:border-[#3f3f46] hover:bg-[#1e1e24] transition-all cursor-pointer group flex flex-col h-full"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#27272a]/50 rounded-md border border-[#3f3f46]/30">
            {getIcon(project.name)}
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-200 group-hover:text-[#10b981] transition-colors">{project.name}</h3>
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
              <Clock size={12} />
              <span>Updated {project.lastUpdated}</span>
            </div>
          </div>
        </div>
        <button className="text-gray-500 hover:text-gray-300 p-1" onClick={(e) => { e.stopPropagation(); }}>
          <MoreVertical size={16} />
        </button>
      </div>

      <p className="text-sm text-gray-400 mb-6 flex-1 line-clamp-2">
        {project.description}
      </p>

      <div className="space-y-4 mt-auto">
        {/* Meta info */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4 text-gray-500">
            <span className="flex items-center gap-1.5"><GitCommit size={14} /> {project.nodesCount} Nodes</span>
            <span className="flex items-center gap-1.5"><Users size={14} /> {project.members} Members</span>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(project.status)}`}>
            {project.status}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500 font-medium">Progress</span>
            <span className="text-gray-300 font-bold">{project.progress}%</span>
          </div>
          <div className="h-1.5 w-full bg-[#27272a] rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${project.progress === 100 ? 'bg-emerald-600' : 'bg-[#10b981]'}`}
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
