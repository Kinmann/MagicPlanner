import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { Store } from '@tauri-apps/plugin-store';
import { Project, DocumentNode } from '../types/project';
import Spinner from '../components/common/Spinner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import Header from '../components/layout/Header';
import IncrementUpdateModal from '../components/Project/IncrementUpdateModal';
import "./PromptView.scss";

interface PromptViewProps {
  projectId: string;
  onBack: () => void;
  onHome: () => void;
}

const PromptView: React.FC<PromptViewProps> = ({ projectId, onBack, onHome }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [nodes, setNodes] = useState<DocumentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered');
  const [copied, setCopied] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [apiKey, setApiKey] = useState<string>("");
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const store = await Store.load('settings.json');
        const apiKeyValue = await store.get<{ value: string }>('gemini_api_key');
        if (apiKeyValue?.value) setApiKey(apiKeyValue.value);

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

  const handleCopy = async () => {
    if (!project?.raw_input_text) return;
    try {
      await navigator.clipboard.writeText(project.raw_input_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleDeleteProject = async () => {
    if (!project) return;

    const confirmed = await ask(
      `'${project.project_name}' 프로젝트를 정말 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며 모든 관련 데이터가 영구적으로 삭제됩니다.`,
      { 
        title: '프로젝트 삭제 확인',
        kind: 'warning',
        okLabel: '삭제',
        cancelLabel: '취소'
      }
    );
    
    if (!confirmed) return;

    try {
      await invoke('delete_project', { projectId: project.project_id });
      onHome(); 
    } catch (err: any) {
      console.error("Failed to delete project:", err);
      alert("프로젝트 삭제에 실패했습니다: " + err);
    }
  };

  const handleIndexProject = async () => {
    if (!apiKey) {
      alert("API Key is required to index context.");
      return;
    }
    setIndexing(true);
    try {
      await invoke("index_project_embeddings", { projectId: project?.project_id, apiKey: apiKey });
      alert("Project context has been indexed successfully.");
      // 로컬 상태 업데이트: 즉각적인 UI 반영
      if (project) {
        setProject({ ...project, is_indexed: true, needs_indexing: false });
      }
    } catch (err: any) {
      alert(`Index error: ${err}`);
    } finally {
      setIndexing(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !apiKey || !project) {
        if (!apiKey) alert("API Key is required for RAG search.");
        return;
    }
    setSearching(true);
    try {
      const results = await invoke("search_similar_documents", {
        projectId: project.project_id,
        apiKey: apiKey,
        query: searchQuery,
        limit: 3
      });
      setSearchResults(results as any[]);
    } catch (err: any) {
      console.error(err);
      alert(`Search error: ${err}`);
    } finally {
      setSearching(false);
    }
  };

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

  return (
    <div className="prompt-view-layout">
      {/* Background Glows */}
      <div className="background-glow background-glow--1"></div>
      <div className="background-glow background-glow--2"></div>
      
      {/* 1. Left Sidebar Navigation (Matching Workspace) */}
      <aside className="prompt-view-sidebar">
        <div className="sidebar-inner">
          <div className="logo-container" onClick={onBack}>
            <span className="material-symbols-outlined">auto_awesome</span>
          </div>
          <nav className="nav-items">
            <button className="sidebar-nav-button" title="Dashboard" onClick={onHome}>
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
        <Header
          title="Project Prompt"
          subtitle={
            <div className="breadcrumb">
              <button className="breadcrumb-link" onClick={onBack}>Pipeline Canvas</button>
              <span className="material-symbols-outlined breadcrumb-sep">chevron_right</span>
              <span className="breadcrumb-current">Configuration</span>
            </div>
          }
        />

        {/* Content Area */}
        <div className="prompt-view-content custom-scrollbar">
          <div className="prompt-document-body">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="content-header"
            >
              <div className="header-left">
                <h2>Primary Prompt</h2>
                <p>Source input for {project.project_name} orchestration logic.</p>
              </div>
              
              <div className="header-right">
                <div className="view-mode-toggle">
                  <button 
                    className={`mode-btn ${viewMode === 'rendered' ? 'active' : ''}`}
                    onClick={() => setViewMode('rendered')}
                    title="Rendered View"
                  >
                    <span className="material-symbols-outlined">description</span>
                    <span>Preview</span>
                  </button>
                  <button 
                    className={`mode-btn ${viewMode === 'raw' ? 'active' : ''}`}
                    onClick={() => setViewMode('raw')}
                    title="Raw View"
                  >
                    <span className="material-symbols-outlined">code</span>
                    <span>Raw</span>
                  </button>
                </div>
                
                <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
                  <span className="material-symbols-outlined">{copied ? 'check' : 'content_copy'}</span>
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="prompt-code-window"
            >
              <div className={`prompt-text ${viewMode === 'rendered' ? 'markdown-body' : 'raw-body'}`}>
                {viewMode === 'rendered' ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                    {project.raw_input_text || ""}
                  </ReactMarkdown>
                ) : (
                  <pre>{project.raw_input_text || ""}</pre>
                )}
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
            </motion.div>
          </div>
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

          <div className="rag-search-zone">
            <h4 className="zone-title">Search Context</h4>
            <div className="search-input-group">
              <input 
                type="text" 
                placeholder="Query vector DB..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button onClick={handleSearch} disabled={searching}>
                <span className="material-symbols-outlined">{searching ? 'sync' : 'search'}</span>
              </button>
            </div>
            
            {searchResults.length > 0 && (
              <div className="search-results custom-scrollbar">
                {searchResults.map((res, idx) => (
                  <div key={idx} className="result-item">
                    <div className="result-header">
                      <span className="type">{res.node_type}</span>
                      <span className="score">{(res.similarity * 100).toFixed(1)}%</span>
                    </div>
                    <p className="text">{res.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <button 
            className={`index-button ${!project.needs_indexing ? 'up-to-date' : ''}`} 
            onClick={handleIndexProject}
            disabled={indexing || !project.needs_indexing}
          >
            <span className="material-symbols-outlined">
              {indexing ? 'sync' : (project.needs_indexing ? 'database' : 'verified')}
            </span>
            {indexing ? 'INDEXING...' : (
                project.needs_indexing 
                    ? (project.is_indexed ? 'UPDATE CONTEXT' : 'SAVE AS CONTEXT')
                    : 'CONTEXT UP TO DATE'
            )}
          </button>
          <button 
            className="refine-button" 
            onClick={() => setIsUpdateModalOpen(true)}
            style={{ 
              background: 'var(--gradient-primary)', 
              color: 'white',
              border: 'none',
              padding: '12px',
              borderRadius: '8px',
              display: 'flex',
              align_items: 'center',
              justify_content: 'center',
              gap: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '8px'
            }}
          >
            <span className="material-symbols-outlined">auto_awesome</span>
            REFINE ARCHITECTURE
          </button>
          <button className="delete-button" onClick={handleDeleteProject}>
            <span className="material-symbols-outlined">delete_forever</span>
            DELETE PROJECT
          </button>
        </div>
      </aside>

      <IncrementUpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        projectId={projectId}
      />
    </div>
  );
};

export default PromptView;
