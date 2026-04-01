import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import BaseModal from '../common/BaseModal';
import Input from '../common/Input';
import Button from '../common/Button';
import './CreateProjectModal.scss';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (projectId: string) => void;
}

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [concept, setConcept] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} type="button">
        Cancel
      </Button>
      <Button 
        variant="primary" 
        type="submit" 
        isLoading={isLoading}
        form="create-project-form"
      >
        Create
      </Button>
    </>
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Project"
      subtitle="Initialization Phase"
      footer={footer}
      size="md"
    >
      <form id="create-project-form" onSubmit={handleSubmit} className="create-project-form">
        {/* Project Name */}
        <section className="form-section">
          <Input 
            id="project-name"
            label="Project Name"
            placeholder="e.g., AI Healthcare App"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </section>

        {/* Execution Mode */}
        <section className="form-section">
          <span className="form-section__label">Pipeline Execution Mode</span>
          <div className="mode-grid">
            <label className="mode-option">
              <input 
                type="radio" 
                name="execution-mode" 
                value="AUTO" 
                checked={mode === 'AUTO'} 
                onChange={() => setMode('AUTO')}
              />
              <div className="mode-option__card">
                <div className="radio-circle">
                  <div className="radio-inner"></div>
                </div>
                <div className="mode-info">
                  <span className="mode-name">AUTO</span>
                  <span className="mode-desc">Continuous Logic flow</span>
                </div>
              </div>
            </label>
            <label className="mode-option">
              <input 
                type="radio" 
                name="execution-mode" 
                value="MANUAL" 
                checked={mode === 'MANUAL'} 
                onChange={() => setMode('MANUAL')}
              />
              <div className="mode-option__card">
                <div className="radio-circle">
                  <div className="radio-inner"></div>
                </div>
                <div className="mode-info">
                  <span className="mode-name">MANUAL</span>
                  <span className="mode-desc">Step-by-step review</span>
                </div>
              </div>
            </label>
          </div>
        </section>

        {/* Concept Description */}
        <section className="form-section">
          <span className="form-section__label">Initial Idea & Concept</span>
          <div className="concept-textarea">
            <textarea
              placeholder="Describe your software project and who it's for. Provide context on the core problem it solves..."
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              required
            />
            <div className="counter-badge">
              <div className={`dot dot--${concept.length < 50 ? 'warning' : 'success'}`}></div>
              <span className="text">{concept.length}/50 min</span>
            </div>
          </div>
        </section>

        {error && (
          <div className="error-banner">
            <span className="material-symbols-outlined">warning</span>
            {error}
          </div>
        )}
      </form>
    </BaseModal>
  );
};

export default CreateProjectModal;
