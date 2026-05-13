import React, { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { 
  Plus, 
  Clock, 
  MoreVertical, 
  Box, 
  Layers, 
  GitCommit, 
  Users, 
  LayoutDashboard
} from 'lucide-react';
import { useProjectStore } from '../store/projectStore';
import { useUIStore } from '../store/uiStore';
import { Button } from '../components/ui/Button';
import styles from './Dashboard.module.scss';

export const Dashboard: React.FC = () => {
  const { projects, fetchProjects, nodes, isLoadingProjects } = useProjectStore(useShallow(state => ({
    projects: state.projects,
    fetchProjects: state.fetchProjects,
    nodes: state.nodes,
    isLoadingProjects: state.isLoadingProjects
  })));

  const { openProject, navigateTo } = useUIStore();

  useEffect(() => {
    fetchProjects();
  }, []);

  const stats = useMemo(() => {
    const total = projects.length;
    const active = projects.filter(p => p.pipeline_phase !== 'COMPLETED').length;
    const completedNodes = nodes.filter(n => n.node_state === 'COMPLETED').length;
    return { total, active, completedNodes };
  }, [projects, nodes]);

  const getProjectProgress = (projectId: string) => {
    const projectNodes = nodes.filter(n => n.project_id === projectId);
    if (projectNodes.length === 0) return 0;
    const completedCount = projectNodes.filter(n => n.node_state === 'COMPLETED').length;
    return Math.round((completedCount / projectNodes.length) * 100);
  };

  const getTimeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className={styles.dashboard}>
      {/* Dashboard Header */}
      <div className={styles.dashboardHeader}>
        <div className={styles.gradientBg} />
        <div className={styles.bgIcon}>
          <img src="/logo.png" alt="" style={{ width: '240px', height: '240px', objectFit: 'contain' }} />
        </div>
        
        <div className={styles.headerContent}>
          <div className={styles.titleRow}>
            <div>
              <h1 className={styles.title}>
                Workspace Dashboard
              </h1>
              <p className={styles.subtitle}>
                Manage your AI-powered software architectures, track progress, 
                and jump back into your recent work.
              </p>
            </div>
            <Button 
              variant="primary" 
              onClick={() => navigateTo('CREATE_PROJECT')}
              leftIcon={<Plus size={18} />}
              className="shadow-[0_0_15px_rgba(16,185,129,0.3)]"
            >
              New Project
            </Button>
          </div>
        </div>
      </div>

      <div className={styles.contentArea}>
        {/* Stats Row */}
        <div className={styles.statsGrid}>
          <StatCard 
            icon={<LayoutDashboard />} 
            label="Total Projects" 
            value={stats.total.toString()} 
            colorClass="primary"
          />
          <StatCard 
            icon={<GitCommit />} 
            label="Active Projects" 
            value={stats.active.toString()} 
            colorClass="purple"
          />
          <StatCard 
            icon={<Layers />} 
            label="Nodes Generated" 
            value={stats.completedNodes.toString()} 
            colorClass="blue"
          />
          <StatCard 
            icon={<Users />} 
            label="Team Members" 
            value="1" 
            colorClass="primary"
          />
        </div>

        {/* Project Grid Section */}
        <div className={styles.sectionContainer}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent Projects</h2>
            <div className={styles.filterLinks}>
              <span className={styles.active}>All</span>
              <span>/</span>
              <span>Active</span>
              <span>/</span>
              <span>Completed</span>
            </div>
          </div>

          <div className={styles.projectGrid}>
            {isLoadingProjects ? (
              <div className={styles.emptyState}>Loading projects...</div>
            ) : projects.length === 0 ? (
              <div className={styles.emptyState}>
                <Box size={48} className="opacity-10 mb-4" />
                <p>No projects found. Create your first software architecture!</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-4"
                  onClick={() => navigateTo('CREATE_PROJECT')}
                  leftIcon={<Plus size={14} />}
                >
                  Get Started
                </Button>
              </div>
            ) : (
              projects.map(project => (
                <ProjectCard 
                  key={project.project_id} 
                  project={project} 
                  progress={getProjectProgress(project.project_id)}
                  nodeCount={nodes.filter(n => n.project_id === project.project_id).length}
                  timeAgo={getTimeAgo(project.updated_at)}
                  onOpen={() => openProject(project.project_id)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  colorClass: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, colorClass }) => (
  <div className={styles.statCard}>
    <div className={`${styles.statIconWrapper} ${styles[colorClass]}`}>
      {React.cloneElement(icon as React.ReactElement<any>, { size: 24 })}
    </div>
    <div className={styles.statInfo}>
      <p className={styles.statLabel}>{label}</p>
      <p className={styles.statValue}>{value}</p>
    </div>
  </div>
);

interface ProjectCardProps {
  project: any;
  progress: number;
  nodeCount: number;
  timeAgo: string;
  onOpen: () => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, progress, nodeCount, timeAgo, onOpen }) => {
  const getStatusClass = (status: string) => {
    switch(status) {
      case 'ACTIVE': return styles.active;
      case 'IN_PROGRESS': return styles.progress;
      case 'COMPLETED': return styles.completed;
      default: return styles.pending;
    }
  };

  const getProjectIcon = (name: string) => {
    if (name.toLowerCase().includes('design')) return <Layers className="text-purple-400" size={20} />;
    if (name.toLowerCase().includes('api')) return <Box className="text-blue-400" size={20} />;
    return <LayoutDashboard className="text-[#10b981]" size={20} />;
  };

  return (
    <div className={styles.projectCard} onClick={onOpen}>
      <div className={styles.cardTop}>
        <div className={styles.projectInfo}>
          <div className={styles.projectIcon}>
            {getProjectIcon(project.project_name)}
          </div>
          <div>
            <h3 className={styles.cardTitle}>{project.project_name}</h3>
            <div className={styles.updateTime}>
              <Clock size={12} />
              <span>Updated {timeAgo}</span>
            </div>
          </div>
        </div>
        <button className="text-gray-500 hover:text-gray-300 p-1" onClick={(e) => e.stopPropagation()}>
          <MoreVertical size={16} />
        </button>
      </div>

      <p className={styles.description}>
        {project.project_goal || "No description available for this project."}
      </p>

      <div className={styles.cardFooter}>
        <div className={styles.metaRow}>
          <div className={styles.metaItems}>
            <span className={styles.metaItem}><GitCommit size={14} /> {nodeCount} Nodes</span>
            <span className={styles.metaItem}><Users size={14} /> 1 Member</span>
          </div>
          <span className={`${styles.statusBadge} ${getStatusClass(project.pipeline_phase)}`}>
            {project.pipeline_phase}
          </span>
        </div>

        <div className={styles.progressWrapper}>
          <div className={styles.progressHeader}>
            <span className={styles.progressLabel}>Progress</span>
            <span className={styles.progressValue}>{progress}%</span>
          </div>
          <div className={styles.progressBar}>
            <div 
              className={`${styles.progressFill} ${progress === 100 ? styles.full : ''}`} 
              style={{ width: `${progress}%` }} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
