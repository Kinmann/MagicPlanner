import React, { useEffect, useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { Store } from '@tauri-apps/plugin-store';
import { 
  FileText, Code, Copy, Check, Database, 
  Search, RefreshCw, Trash2, Sparkles
} from 'lucide-react';
import { Project, DocumentNode } from '../types/project';
import Spinner from '../components/ui/Spinner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import IncrementUpdateModal from '../components/Project/IncrementUpdateModal';
import { useUIStore } from '../store/uiStore';
import styles from './PromptView.module.scss';

interface PromptViewProps {
  projectId: string;
}

const PromptView: React.FC<PromptViewProps> = ({ projectId }) => {
  const { setViewingPromptProject } = useUIStore();
  const onBack = () => setViewingPromptProject(null);
  
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
      `'${project.project_name}' 프로젝트를 정말 삭제하시겠습니까?`,
      { title: 'Confirm Deletion', kind: 'warning', okLabel: 'Delete', cancelLabel: 'Cancel' }
    );
    if (!confirmed) return;
    try {
      await invoke('delete_project', { projectId: project.project_id });
      onBack();
    } catch (err: any) {
      alert("삭제 실패: " + err);
    }
  };

  const handleIndexProject = async () => {
    if (!apiKey) { alert("API Key is required."); return; }
    setIndexing(true);
    try {
      await invoke("index_project_embeddings", { projectId: project?.project_id, apiKey: apiKey });
      if (project) setProject({ ...project, is_indexed: true, needs_indexing: false });
    } catch (err: any) {
      alert(`Index error: ${err}`);
    } finally {
      setIndexing(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !apiKey || !project) return;
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
      alert(`Search error: ${err}`);
    } finally {
      setSearching(false);
    }
  };

  if (loading) return <div className={styles.loading}><Spinner size={32} /><p>Loading project context...</p></div>;
  if (error || !project) return <div className={styles.error}><h2>Error Loading Project</h2><p>{error}</p><button onClick={onBack} className="btn btn--primary">Back</button></div>;

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Main Panel */}
        <div className={styles.mainPanel}>
          <header className={styles.header}>
            <div className={styles.titleInfo}>
              <h2>{project.project_name} Prompt</h2>
              <p>Primary context used for AI orchestration</p>
            </div>
            <div className={styles.actions}>
              <button 
                className={`btn btn--secondary btn--sm ${viewMode === 'rendered' ? 'active' : ''}`}
                onClick={() => setViewMode('rendered')}
              >
                <FileText size={14} /> Preview
              </button>
              <button 
                className={`btn btn--secondary btn--sm ${viewMode === 'raw' ? 'active' : ''}`}
                onClick={() => setViewMode('raw')}
              >
                <Code size={14} /> Raw
              </button>
              <button className="btn btn--secondary btn--sm" onClick={handleCopy}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </header>

          <div className={styles.editorWindow}>
            <div className={`${styles.editorBody} ${viewMode === 'rendered' ? styles.markdownBody : ''}`}>
              {viewMode === 'rendered' ? (
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                  {project.raw_input_text || ""}
                </ReactMarkdown>
              ) : (
                <pre>{project.raw_input_text || ""}</pre>
              )}
            </div>
            <div className={styles.editorFooter}>
              <div className={styles.status}><div className={styles.dot} /> <span>Synchronized</span></div>
              <div className={styles.stats}>
                <span>Chars: {stats.chars}</span>
                <span>Words: {stats.words}</span>
                <span>Lines: {stats.lines}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <aside className={styles.sidePanel}>
          <section className={styles.infoCard}>
            <h3>Project Overview</h3>
            <div className={styles.infoList}>
              <div className={styles.item}><span className={styles.label}>Mode</span><span className={`${styles.value} ${styles.accent}`}>{project.pipeline_execution_mode}</span></div>
              <div className={styles.item}><span className={styles.label}>Created</span><span className={styles.value}>{new Date(project.created_at).toLocaleDateString()}</span></div>
              <div className={styles.item}><span className={styles.label}>Iterations</span><span className={styles.value}>{iterationStats.current} / {iterationStats.total}</span></div>
            </div>
          </section>

          <section className={`${styles.infoCard} ${styles.ragZone}`}>
            <h3>Context Search</h3>
            <div className={styles.searchBox}>
              <input 
                type="text" 
                placeholder="Query context..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button className="btn btn--primary btn--sm" onClick={handleSearch} disabled={searching}>
                {searching ? <RefreshCw className="spin" size={14} /> : <Search size={14} />}
              </button>
            </div>
            
            <div className={styles.resultsList}>
              {searchResults.map((res, idx) => (
                <div key={idx} className={styles.result}>
                  <div className={styles.resHeader}>
                    <span className={styles.type}>{res.node_type}</span>
                    <span className={styles.score}>{(res.similarity * 100).toFixed(1)}%</span>
                  </div>
                  <p className={styles.text}>{res.text}</p>
                </div>
              ))}
              {searchResults.length === 0 && <p className={styles.emptyHint}>RAG results will appear here</p>}
            </div>
          </section>

          <section className={styles.actionPanel}>
            <button 
              className={`${styles.indexBtn} ${!project.needs_indexing ? styles.active : ''}`}
              onClick={handleIndexProject}
              disabled={indexing || !project.needs_indexing}
            >
              {indexing ? <RefreshCw className="spin" size={14} /> : <Database size={14} />}
              {project.needs_indexing ? 'Index Context' : 'Context Up-to-date'}
            </button>
            <button className={styles.refineBtn} onClick={() => setIsUpdateModalOpen(true)}>
              <Sparkles size={14} /> Refine Architecture
            </button>
            <button className={styles.deleteBtn} onClick={handleDeleteProject}>
              <Trash2 size={14} /> Delete Project
            </button>
          </section>
        </aside>
      </div>

      <IncrementUpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        projectId={projectId}
      />
    </div>
  );
};

export default PromptView;
