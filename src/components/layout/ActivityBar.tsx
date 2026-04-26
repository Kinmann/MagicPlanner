import React, { useEffect } from 'react';
import { 
  LayoutDashboard, 
  FolderKanban, 
  Plus, 
  UserCircle, 
  Settings,
  Layers,
  Box,
  Smartphone
} from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useShallow } from 'zustand/react/shallow';
import styles from './ActivityBar.module.scss';

export const ActivityBar: React.FC = () => {
  const { currentView, navigateTo, toggleSettings, currentProjectId, openProject } = useUIStore();
  const { projects, fetchProjects } = useProjectStore(useShallow(state => ({
    projects: state.projects,
    fetchProjects: state.fetchProjects
  })));

  useEffect(() => {
    fetchProjects();
  }, []);

  // Icon mapping helper
  const getProjectIcon = (index: number) => {
    const icons = [FolderKanban, Layers, Box, Smartphone];
    return icons[index % icons.length];
  };

  return (
    <div className={styles.activityBar}>
      <div className={styles.topSection}>
        <div 
          className={`${styles.navItem} ${currentView === 'DASHBOARD' ? styles.active : ''}`}
          onClick={() => navigateTo('DASHBOARD')}
          title="Dashboard"
        >
          {currentView === 'DASHBOARD' && <div className={styles.activeIndicator} />}
          <LayoutDashboard size={24} strokeWidth={currentView === 'DASHBOARD' ? 2 : 1.5} />
        </div>

        <div className={styles.divider} />

        {projects.map((proj, idx) => {
          const Icon = getProjectIcon(idx);
          const isActive = currentView === 'WORKSPACE' && currentProjectId === proj.project_id;
          return (
            <div 
              key={proj.project_id}
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
              title={proj.project_name}
              onClick={() => {
                openProject(proj.project_id);
              }}
            >
              {isActive && <div className={styles.activeIndicator} />}
              <Icon size={24} strokeWidth={isActive ? 2 : 1.5} />
            </div>
          );
        })}

        <div className={`${styles.navItem} ${styles.plusBtn}`} title="Add New Project" onClick={() => navigateTo('CREATE_PROJECT')}>
          <div className={styles.plusIconInner}>
            <Plus size={16} strokeWidth={2} />
          </div>
        </div>
      </div>

      <div className={styles.bottomSection}>
        <div className={styles.navItem} title="Account">
          <UserCircle size={24} strokeWidth={1.5} />
        </div>
        <div 
          className={styles.navItem} 
          title="Settings"
          onClick={() => toggleSettings(true)}
        >
          <Settings size={24} strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
};

export default ActivityBar;
