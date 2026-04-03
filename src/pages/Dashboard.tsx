import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import Spinner from '../components/common/Spinner';
import Header from '../components/layout/Header';
import './Dashboard.scss';

interface Project {
  project_id: string;
  project_name: string;
  pipeline_execution_mode: string;
  raw_input_text: string;
  created_at: string;
  current_node_type: string | null;
}

interface DashboardProps {
  onSelectProject: (projectId: string) => void;
  onOpenSettings: () => void;
  onCreateProject: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onSelectProject, onOpenSettings, onCreateProject }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProjects = async () => {
    try {
      const list = await invoke<Project[]>('list_projects');
      setProjects(list);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);


  const getCategoryIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('health')) return 'clinical_notes';
    if (n.includes('shop') || n.includes('e-comm') || n.includes('retail')) return 'shopping_bag';
    if (n.includes('dev') || n.includes('auto') || n.includes('util')) return 'terminal';
    return 'format_list_bulleted';
  };

  const getAccentClass = (idx: number) => {
    if (idx % 3 === 0) return '';
    if (idx % 3 === 1) return 'project-card__accent-bar--secondary';
    return 'project-card__accent-bar--tertiary';
  };

  return (
    <div className="dashboard-layout">
      {/* 1. Left Side Navigation (Narrow) */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-inner">
          <div className="logo-container">
            <span className="material-symbols-outlined text-on-primary">auto_awesome</span>
          </div>
          <nav className="nav-items">
            <button 
              className="nav-button active"
              title="Dashboard"
            >
              <span className="material-symbols-outlined">grid_view</span>
            </button>
            <button 
              className="nav-button"
              title="Monitoring"
              disabled
              style={{ opacity: 0.3, cursor: 'not-allowed' }}
            >
              <span className="material-symbols-outlined">analytics</span>
            </button>
          </nav>
          
          <div className="sidebar-footer">
             <button className="nav-button" title="Settings" onClick={onOpenSettings}>
                <span className="material-symbols-outlined">settings</span>
             </button>
          </div>
        </div>
      </aside>

      {/* 2. Main Dashboard (Header + Content) */}
      <main className="dashboard-main">
        <Header 
          title="Project Dashboard"
          subtitle={
            <span className="status-badge">
              {projects.length} Projects
            </span>
          }
        >
          <button 
            className="header-action-button"
            onClick={onCreateProject}
          >
            <span className="material-symbols-outlined">add</span>
            New Project
          </button>
        </Header>

        {/* Content Area */}
        <div className="dashboard-content canvas-grid custom-scrollbar">
          <div className="dashboard-inner pb-12 px-6 max-w-7xl mx-auto min-h-screen">
            {/* Header Section */}
            <section className="dashboard-header flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
              <div className="dashboard-header__content">
                <h1 className="text-4xl font-extrabold tracking-tight text-on-surface mb-2">Workspace</h1>
                <p className="text-on-surface-variant max-w-xl">Architect your software vision with orchestrated intelligence and precise planning pipelines.</p>
              </div>
            </section>

            {isLoading ? (
              <div className="loader-container flex justify-center items-center py-32">
                <Spinner size="xl" />
              </div>
            ) : projects.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="empty-state group relative bg-surface-container-high p-12 rounded-xl transition-all duration-300 flex flex-col items-center gap-6"
              >
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-on-surface mb-2">No projects orchestrated yet</h3>
                  <p className="text-on-surface-variant">Start your architectural journey by creating a new AI planning project.</p>
                </div>
              </motion.div>
            ) : (
              <div className="project-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project, idx) => (
                  <motion.div
                    key={project.project_id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => onSelectProject(project.project_id)}
                    className="project-card group relative bg-surface-container-high p-6 rounded-xl hover:bg-surface-bright transition-all duration-300 flex flex-col gap-4 overflow-hidden"
                  >
                    <div className={`project-card__accent-bar transition-all duration-300 ${getAccentClass(idx)}`}></div>
                    
                    <div className="project-card__header flex justify-between items-start">
                      <div className="project-card__info flex flex-col">
                        <span className="project-card__category text-xs font-bold tracking-widest uppercase mb-1">{project.pipeline_execution_mode} MODE</span>
                        <h3 className="project-card__title text-xl font-bold text-on-surface">{project.project_name}</h3>
                      </div>
                      <span className="material-symbols-outlined project-card__icon text-on-surface-variant group-hover:text-primary transition-colors">
                        {getCategoryIcon(project.project_name)}
                      </span>
                    </div>

                    <div className="project-card__meta flex items-center gap-2 text-sm text-on-surface-variant">
                      <span className="material-symbols-outlined text-sm">calendar_today</span>
                      <span>Created {new Date(project.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}</span>
                    </div>

                    <div className="project-card__footer mt-4 flex items-center justify-between pt-4 border-t border-outline-variant/10">
                      <div className="project-card__tech flex -space-x-2">
                        {project.current_node_type ? project.current_node_type.split(',').slice(0, 2).map((node, i) => {
                          const label = node.trim().substring(0, 2);
                          const formatted = label.charAt(0).toUpperCase() + (label.charAt(1) || '').toLowerCase();
                          return (
                            <div key={i} className="tech-circle w-8 h-8 rounded-full bg-surface-container-lowest border border-outline-variant/30 flex items-center justify-center text-[10px] font-bold text-primary">
                              {formatted}
                            </div>
                          );
                        }) : (
                          <div className="tech-circle w-8 h-8 rounded-full bg-surface-container-lowest border border-outline-variant/30 flex items-center justify-center text-[10px] font-bold text-completed">
                            Dn
                          </div>
                        )}
                      </div>
                      <button className="project-card__launch text-primary text-sm font-semibold flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                        View Pipeline
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

      <section className="system-status">
        <div className="system-status__container">
          <div className="system-status__item border-l-2 border-primary/20">
            <span className="status-label">AI CORE</span>
            <div className="status-value flex items-center gap-2">
              <div className="status-dot w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_#d2bbff]"></div>
              <span className="text-sm font-medium">Operational</span>
            </div>
          </div>
          <div className="system-status__item border-l-2 border-primary/20">
            <span className="status-label">QUEUE</span>
            <div className="status-value flex items-center gap-2">
              <span className="text-sm font-medium">0 active tasks</span>
            </div>
          </div>
          <div className="system-status__item border-l-2 border-primary/20">
            <span className="status-label">RESOURCES</span>
            <div className="status-value flex items-center gap-2">
              <span className="text-sm font-medium">12.4GB / 32GB</span>
            </div>
          </div>
          <div className="system-status__item border-l-2 border-primary/20">
            <span className="status-label">VERSION</span>
            <div className="status-value flex items-center gap-2">
              <span className="text-sm font-medium">v2.5.0-stable</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</main>
</div>
);
};

export default Dashboard;
