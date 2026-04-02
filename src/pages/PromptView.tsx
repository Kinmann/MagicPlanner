import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { Project, DocumentNode } from '../types/project';
import Spinner from '../components/common/Spinner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import "./PromptView.scss";

interface PromptViewProps {
  projectId: string;
  onBack: () => void;
}

const PromptView: React.FC<PromptViewProps> = ({ projectId, onBack }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [nodes, setNodes] = useState<DocumentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [projectData, nodesData] = await Promise.all([
          invoke<Project>('get_project', { projectId }),
          invoke<DocumentNode[]>('get_project_nodes', { projectId })
        ]);
        setProject(projectData);
        setNodes(nodesData);
      } catch (err: any) {
        setError(err.toString());
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [projectId]);

  const stats = useMemo(() => {
    if (!project) return { chars: 0, words: 0, lines: 0 };
    const text = project.raw_input_text || "";
    return {
      chars: text.length,
      words: text.trim() === "" ? 0 : text.trim().split(/\s+/).length,
      lines: text.trim() === "" ? 0 : text.split('\n').length
    };
  }, [project]);

  const iterationStats = useMemo(() => {
    if (nodes.length === 0) return { current: 0, total: 0 };
    const current = nodes.reduce((sum, node) => sum + node.current_iteration, 0);
    const total = nodes.reduce((sum, node) => sum + node.max_iterations, 0);
    return { current, total };
  }, [nodes]);

  if (loading) {
    return (
      <div className="prompt-view-loading">
        <Spinner size="xl" />
        <p>Loading project prompt...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="prompt-view-error">
        <span className="material-symbols-outlined">error</span>
        <p>{error || "Project not found"}</p>
        <button className="action-btn outline" onClick={onBack}>Back to Dashboard</button>
      </div>
    );
  }

  const handleCopy = () => {
     if (project?.raw_input_text) {
        navigator.clipboard.writeText(project.raw_input_text);
        alert("프롬프트가 클립보드에 복사되었습니다.");
     }
  };

  return (
    <div className="prompt-view-layout">
      {/* 1. Left Sidebar Navigation (Matching Workspace) */}
      <aside className="prompt-view-sidebar">
        <div className="sidebar-inner">
          <div className="logo-container" onClick={onBack}>
            <span className="material-symbols-outlined">auto_awesome</span>
          </div>
          <nav className="nav-items">
            <button className="sidebar-nav-button" title="Dashboard" onClick={onBack}>
              <span className="material-symbols-outlined">grid_view</span>
            </button>
            <button className={`sidebar-nav-button active`} title="Monitoring" onClick={onBack}>
              <span className="material-symbols-outlined">analytics</span>
            </button>
          </nav>
          <div className="sidebar-footer">
             <button className="sidebar-nav-button" title="Settings">
                <span className="material-symbols-outlined">settings</span>
             </button>
          </div>
        </div>
      </aside>

      {/* 2. Main Area (Header + Content) */}
      <main className="prompt-view-main">
        {/* Top Toolbar */}
        <header className="prompt-view-toolbar">
          <div className="toolbar-left">
            <span className="toolbar-label">MAGIC PLANNER</span>
            <div className="toolbar-divider" />
            <div className="toolbar-info">
              <div className="breadcrumb">
                <button className="breadcrumb-link" onClick={onBack}>Pipeline Canvas</button>
                <span className="material-symbols-outlined breadcrumb-sep">chevron_right</span>
                <span className="breadcrumb-current">Project Prompt</span>
              </div>
            </div>
          </div>
          
          <div className="toolbar-right">
          </div>
        </header>

        {/* Content Area */}
        <div className="prompt-view-content custom-scrollbar">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="content-header"
          >
            <h2>Primary Prompt</h2>
            <p>Source input for {project.project_name} orchestration logic.</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="prompt-document-body"
          >
            {/* Code Window Style */}
            <div className="prompt-code-window">
              <div className="window-header">
                <div className="dot red" />
                <div className="dot amber" />
                <div className="dot emerald" />
                <span className="filename">primary_prompt_v1.txt</span>
              </div>

              <div className="prompt-text markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {project.raw_input_text || ""}
                </ReactMarkdown>
              </div>

              <div className="editor-footer">
                <div className="status-indicator">
                  <div className="dot" />
                  <span>Logic Synchronized</span>
                </div>
                <div className="stats">
                  <span>Chars: {stats.chars}</span>
                  <span>Words: {stats.words}</span>
                  <span>Lines: {stats.lines}</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* 3. Right Info Sidebar (Matching Workspace) */}
      <aside className="prompt-view-info-sidebar">
        <header className="sidebar-header">
          <h3 className="title">Project Overview</h3>
          <p className="subtitle">Context and execution details</p>
        </header>

        <div className="sidebar-content custom-scrollbar">
          <div className="info-group">
            <div className="info-item info-item--primary">
              <span className="label">Project Title</span>
              <span className="value">{project.project_name}</span>
            </div>
            <div className="info-item">
              <span className="label">Execution Mode</span>
              <span className="value accent-mode">{project.pipeline_execution_mode} MODE</span>
            </div>
            <div className="info-item">
              <span className="label">Created Date</span>
              <span className="value">{new Date(project.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="info-item info-item--primary">
              <span className="label">Total Iterations</span>
              <span className="value">{iterationStats.current} / {iterationStats.total}</span>
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <button className="copy-button" onClick={handleCopy}>
            <span className="material-symbols-outlined">content_copy</span>
            Copy Prompt
          </button>
        </div>
      </aside>
    </div>
  );
};

export default PromptView;
