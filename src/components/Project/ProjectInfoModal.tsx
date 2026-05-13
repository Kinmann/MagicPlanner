import React, { useState, useEffect, useMemo } from 'react';
import { 
  Info, 
  Database, 
  ShieldCheck,
  Box,
  RefreshCw,
  Trash2,
  FileText,
  Layout,
  ChevronRight,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';

import { Dialog } from '../ui/Dialog';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useSettingsStore } from '../../store/settingsStore';

import styles from './ProjectInfoModal.module.scss';

export const ProjectInfoModal: React.FC = () => {
  const { isProjectInfoOpen, toggleProjectInfo, currentProjectId } = useUIStore(useShallow(state => ({
    isProjectInfoOpen: state.isProjectInfoOpen,
    toggleProjectInfo: state.toggleProjectInfo,
    currentProjectId: state.currentProjectId
  })));

  const { projects, fetchProjects } = useProjectStore(useShallow(state => ({
    projects: state.projects,
    fetchProjects: state.fetchProjects
  })));

  const { apiKey } = useSettingsStore();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false); // Legacy - keeping for state if needed briefly


  // Initialize selected project when modal opens
  useEffect(() => {
    if (isProjectInfoOpen) {
      setSelectedProjectId(currentProjectId);
      fetchProjects();
    }
  }, [isProjectInfoOpen, currentProjectId]);

  // Fetch project details when selection changes
  useEffect(() => {
    if (selectedProjectId) {
      loadProjectDetails(selectedProjectId);
    }
  }, [selectedProjectId]);

  const loadProjectDetails = async (id: string) => {
    setLoading(true);
    try {
      const [projectData, nodesData] = await Promise.all([
        invoke<any>('get_project', { projectId: id }),
        invoke<any[]>('get_project_nodes', { projectId: id })
      ]);
      setSelectedProject(projectData);
      setNodes(nodesData);
    } catch (err) {

      console.error("Failed to fetch project details:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleIndexing = async () => {
    if (!selectedProject || !apiKey) return;
    try {
      await invoke("index_project_embeddings", { projectId: selectedProject.project_id, apiKey });
      await loadProjectDetails(selectedProject.project_id);
    } catch (err) {
      alert(`Index error: ${err}`);
    }
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) return;
    const confirmed = await ask(
      `'${selectedProject.project_name}' 프로젝트를 정말 삭제하시겠습니까?`,
      { title: 'Confirm Deletion', kind: 'warning', okLabel: 'Delete', cancelLabel: 'Cancel' }
    );
    if (!confirmed) return;
    try {
      await invoke('delete_project', { projectId: selectedProject.project_id });
      fetchProjects();
      setSelectedProjectId(null);
      setSelectedProject(null);
    } catch (err) {
      alert("삭제 실패: " + err);
    }
  };

  const stats = useMemo(() => {
    if (!selectedProject || nodes.length === 0) return { progress: 0, total: 0, completed: 0 };
    
    const total = nodes.length;
    const completed = nodes.filter(n => n.node_state === 'COMPLETED').length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { progress, total, completed };
  }, [selectedProject, nodes]);


  if (!isProjectInfoOpen) return null;

  return (
    <Dialog 
      isOpen={isProjectInfoOpen} 
      onClose={() => toggleProjectInfo(false)}
      title="Project Information"
      size="2xl"
    >
      <div className={styles.container}>
        <div className={styles.mainLayout}>

          {/* Column 1: Project List */}
          <div className={styles.columnSidebar}>
            <div className={styles.colTitle}>
              <Layout size={14} />
              <span>Projects</span>
            </div>
            <div className={styles.projectList}>
              {projects.map((proj) => (
                <div 
                  key={proj.project_id}
                  className={`${styles.projectItem} ${selectedProjectId === proj.project_id ? styles.active : ''}`}
                  onClick={() => setSelectedProjectId(proj.project_id)}
                >
                  <Box size={14} className={styles.itemIcon} />
                  <span className={styles.itemName}>{proj.project_name}</span>
                  {selectedProjectId === proj.project_id && <ChevronRight size={14} className={styles.activeArrow} />}
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: User Prompt */}
          <div className={styles.columnContent}>
            <div className={styles.colTitle}>
              <FileText size={14} />
              <span>User Prompt Context</span>
            </div>
            <div className={styles.promptViewer}>
              {loading ? (
                <div className={styles.loadingWrapper}>
                  <RefreshCw size={24} className={styles.spinner} />
                </div>
              ) : selectedProject ? (
                <div className={styles.markdownBody}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                    {selectedProject.raw_input_text || "*No prompt context available.*"}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className={styles.viewerPlaceholder}>
                  <Info size={24} className={styles.placeholderIcon} />
                  <p>프로젝트를 선택하세요.</p>
                </div>
              )}
            </div>
          </div>

          {/* Column 3: Project Info & Buttons */}
          <div className={styles.columnMeta}>
            <div className={styles.colTitle}>
              <Database size={14} />
              <span>Management</span>
            </div>

            {selectedProject ? (
              <div className={styles.metaContent}>
                <section className={styles.metaSection}>
                  <div className={styles.infoGrid}>
                    <div className={styles.infoItem}>
                      <span className={styles.label}>Mode</span>
                      <span className={styles.value}>{selectedProject.pipeline_execution_mode}</span>
                    </div>
                    <div className={styles.infoItem}>
                      <span className={styles.label}>Created</span>
                      <span className={styles.value}>{new Date(selectedProject.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </section>

                <section className={styles.metaSection}>
                  <div className={styles.sectionLabel}>Context Stats</div>
                  <div className={styles.statsRow}>
                    <div className={styles.statBox}>
                      <span className={styles.num}>{stats.progress}%</span>
                      <span className={styles.unit}>Progress</span>
                    </div>
                    <div className={styles.statBox}>
                      <span className={styles.num}>{stats.total}</span>
                      <span className={styles.unit}>Nodes</span>
                    </div>

                    <div className={styles.statBox}>
                      <span className={styles.num}>{stats.completed}</span>
                      <span className={styles.unit}>Completed</span>
                    </div>
                  </div>
                </section>


                <div className={styles.spacer} />

                <section className={styles.actionSection}>
                  <button 
                    className={`${styles.actionBtn} ${styles.primary}`}
                    onClick={handleIndexing}
                    disabled={!selectedProject.needs_indexing}
                  >
                    <Database size={14} />
                    <span>{selectedProject.needs_indexing ? 'Index Context' : 'Context Indexed'}</span>
                  </button>
                  


                  <div className={styles.btnDivider} />

                  <button className={`${styles.actionBtn} ${styles.danger}`} onClick={handleDeleteProject}>
                    <Trash2 size={14} />
                    <span>Delete Project</span>
                  </button>
                </section>
              </div>
            ) : (
              <div className={styles.metaPlaceholder}>
                <ShieldCheck size={48} className={styles.placeholderIconLarge} />
                <p>Select a project to manage</p>
              </div>
            )}
          </div>
        </div>
      </div>

    </Dialog>
  );
};

export default ProjectInfoModal;
