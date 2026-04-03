import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import SimpleMde from 'react-simplemde-editor';
import Header from '../components/layout/Header';
import 'easymde/dist/easymde.min.css';
import './CreateProject.scss';

interface CreateProjectProps {
  onBack: () => void;
  onSuccess: (projectId: string) => void;
}

const CreateProject: React.FC<CreateProjectProps> = ({ onBack, onSuccess }) => {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [concept, setConcept] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('프로젝트 제목을 입력해주세요.');
      return;
    }
    if (concept.length < 50) {
      setError('기획 컨셉은 최소 50자 이상 입력해야 합니다.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const projectId = await invoke<string>('create_project', {
        name,
        mode,
        inputText: concept,
      });
      onSuccess(projectId);
    } catch (err: any) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditorChange = useCallback((value: string) => {
    setConcept(value);
  }, []);

  const editorOptions = useMemo(() => ({
    autofocus: true,
    spellChecker: false,
    minHeight: '400px',
    placeholder: 'Describe your software project and who it\'s for. Provide context on the core problem it solves...',
    status: ['lines', 'words', 'cursor'],
    toolbar: [
      'bold', 'italic', 'heading', '|', 
      'quote', 'unordered-list', 'ordered-list', '|', 
      'link', 'image', 'code', 'table', '|', 
      'preview', 'side-by-side', 'fullscreen', '|', 
      'guide'
    ] as any,
    // This makes the editor show the styles inline (syntax highlighting)
    renderingConfig: {
      singleLineBreaks: false,
      codeSyntaxHighlighting: true,
    },
    shortcuts: {
        drawTable: "Cmd-Alt-T"
    },
    // Customize preview theme to match our dark mode
    previewClass: 'markdown-body',
  }), []);

  return (
    <div className="create-project-layout">
      {/* Background Glows for visual depth */}
      <div className="background-glow background-glow--1" />
      <div className="background-glow background-glow--2" />

      {/* 1. Left Sidebar Navigation (Matching Dashboard) */}
      <aside className="create-project-sidebar">
        <div className="sidebar-inner">
          <div className="logo-container" onClick={onBack}>
            <span className="material-symbols-outlined">auto_awesome</span>
          </div>
          <nav className="nav-items">
            <button className="sidebar-nav-button" title="Dashboard" onClick={onBack}>
              <span className="material-symbols-outlined">grid_view</span>
            </button>
            <button className="sidebar-nav-button active" title="Monitoring">
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

      {/* 2. Main (Header + Content) */}
      <main className="create-project-main">
        <Header 
          title="New Project Initialization"
          subtitle={
            <nav className="breadcrumb">
              <button className="breadcrumb-link" onClick={onBack}>Dashboard</button>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">Create New Project</span>
            </nav>
          }
        />

        {/* Content Area */}
        <div className="create-project-content custom-scrollbar">
          <div className="content-inner">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="content-header"
            >
              <h2>Initialization Phase</h2>
              <p>Architect your software vision with orchestrated intelligence and precise planning pipelines.</p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="editor-container"
            >
              <SimpleMde 
                value={concept} 
                onChange={handleEditorChange} 
                options={editorOptions} 
              />
            </motion.div>

            <div className="editor-footer-info">
              <div className="counter-badge">
                <div className={`dot dot--${concept.length < 50 ? 'warning' : 'success'}`}></div>
                <span className="text">{concept.length}/50 min characters</span>
              </div>
              <div className="tip-msg text-xs italic">
                 Markdown syntax highlighting is applied live as you type.
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 3. Right Info Sidebar */}
      <aside className="create-project-info-sidebar">
        <header className="sidebar-header">
          <h3 className="title">Project Overview</h3>
          <p className="subtitle">Configure core project parameters</p>
        </header>

        <div className="sidebar-content custom-scrollbar">
          <div className="info-group">
            {/* Project Title Input */}
            <div className="input-section">
              <label htmlFor="project-title">Project Name</label>
              <input 
                id="project-title"
                type="text" 
                placeholder="e.g., AI Healthcare App" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            {/* Execution Mode Selection */}
            <div className="mode-section">
              <span className="label">Pipeline Execution Mode</span>
              <div className="mode-grid">
                <label className="mode-option">
                  <input 
                    type="radio" 
                    name="execution-mode" 
                    checked={mode === 'AUTO'} 
                    onChange={() => setMode('AUTO')}
                  />
                  <div className="mode-card">
                    <div className="card-top">
                      <div className="mode-icon">
                        <span className="material-symbols-outlined">bolt</span>
                      </div>
                      <div className="radio-circle">
                        <div className="radio-inner"></div>
                      </div>
                    </div>
                    <div className="mode-info">
                      <span className="name">AUTO</span>
                      <span className="desc">Continuous Logic flow. AI manages transitions autonomously based on results.</span>
                    </div>
                  </div>
                </label>
                <label className="mode-option">
                  <input 
                    type="radio" 
                    name="execution-mode" 
                    checked={mode === 'MANUAL'} 
                    onChange={() => setMode('MANUAL')}
                  />
                  <div className="mode-card">
                    <div className="card-top">
                      <div className="mode-icon">
                        <span className="material-symbols-outlined">touch_app</span>
                      </div>
                      <div className="radio-circle">
                        <div className="radio-inner"></div>
                      </div>
                    </div>
                    <div className="mode-info">
                      <span className="name">MANUAL</span>
                      <span className="desc">Step-by-step review. Manual intervention required at each stage.</span>
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <button 
            className="create-button" 
            onClick={handleCreate}
            disabled={isLoading || concept.length < 50 || !name.trim()}
          >
            {isLoading ? <div className="spinner" /> : (
              <>
                <span className="material-symbols-outlined">rocket_launch</span>
                CREATE PROJECT
              </>
            )}
          </button>
          
          {error && (
            <div className="error-msg">
              <span className="material-symbols-outlined">warning</span>
              {error}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

export default CreateProject;
