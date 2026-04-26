import React, { useState } from 'react';
import { FolderKanban, Plus, Type, FileText, LayoutTemplate, Send, ChevronRight, X, Sparkles, MousePointerClick, Bolt } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../store/uiStore';
import { invoke } from '@tauri-apps/api/core';
import { Spinner } from '../components/ui/Spinner';
import './CreateProject.scss';

export function CreateProject() {
  const { navigateTo, openProject } = useUIStore();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    mode: 'AUTO' as 'AUTO' | 'MANUAL',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNext = () => setStep(step + 1);
  const handleBack = () => setStep(step - 1);
  
  const handleCreate = async () => {
    if (!formData.name.trim()) {
      setError('Please enter a project name.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const projectId = await invoke<string>('create_project', {
        name: formData.name,
        mode: formData.mode,
        inputText: formData.description || ' ', // Backend requires input_text
      });
      openProject(projectId);
    } catch (err: any) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const isStep1Valid = formData.name.trim().length > 0;

  return (
    <div className="create-project-layout">
      <div className="wizard-card">
        {/* Header */}
        <div className="wizard-header">
          <h1 className="wizard-title">
            <div className="icon-wrapper">
              <FolderKanban className="icon" size={20} />
            </div>
            Create New Workspace
          </h1>
          <button onClick={() => navigateTo('DASHBOARD')} className="close-button">
            <X size={20} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="progress-track">
          <div 
            className="progress-fill" 
            style={{ width: `${(step / 2) * 100}%` }}
          />
        </div>

        {/* Form Body */}
        <div className="wizard-body">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div 
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="step-content"
              >
                <div className="step-header">
                  <h2>Project Details</h2>
                  <p>Give your new workspace a name and description.</p>
                </div>

                <div className="form-group-container">
                  <div className="form-group">
                    <label>
                      <Type size={14} className="label-icon" /> Project Name
                    </label>
                    <input 
                      type="text" 
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="e.g., Q3 Marketing Campaign"
                      className="form-input"
                      autoFocus
                    />
                  </div>
                  <div className="form-group">
                    <label>
                      <FileText size={14} className="label-icon" /> Description (Optional)
                    </label>
                    <div className="textarea-wrapper">
                      <textarea 
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        placeholder="Briefly describe what this project is about..."
                        rows={4}
                        className="form-textarea"
                      />
                      <span className="char-counter">
                        {formData.description.length} chars
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div 
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="step-content"
              >
                <div className="step-header">
                  <h2>Select Execution Mode</h2>
                  <p>Choose how the AI pipeline should generate your project.</p>
                </div>

                <div className="mode-grid">
                  <ModeCard 
                    title="AUTO Mode" 
                    desc="Continuous logic flow. AI manages transitions autonomously." 
                    icon={<Bolt />} 
                    selected={formData.mode === 'AUTO'}
                    onClick={() => setFormData({...formData, mode: 'AUTO'})}
                  />
                  <ModeCard 
                    title="MANUAL Mode" 
                    desc="Step-by-step review. Manual intervention required at each stage." 
                    icon={<MousePointerClick />} 
                    selected={formData.mode === 'MANUAL'}
                    onClick={() => setFormData({...formData, mode: 'MANUAL'})}
                  />
                </div>

                {error && (
                  <div className="error-message">
                    {error}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer Actions */}
          <div className="wizard-footer">
            {step > 1 ? (
              <button onClick={handleBack} className="btn-back">
                Back
              </button>
            ) : (
              <div /> // spacer
            )}
            
            {step < 2 ? (
              <button 
                onClick={handleNext}
                disabled={!isStep1Valid}
                className="btn-next"
              >
                Continue <ChevronRight size={18} />
              </button>
            ) : (
              <button 
                onClick={handleCreate}
                disabled={isLoading}
                className="btn-create"
              >
                {isLoading ? <Spinner size={16} /> : <Send size={16} />}
                {isLoading ? 'Creating...' : 'Create Workspace'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeCard({ title, desc, icon, selected, onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className={`mode-card ${selected ? 'selected' : ''}`}
    >
      <div className="mode-icon-wrapper">
        {React.cloneElement(icon, { size: 20 })}
      </div>
      <div className="mode-text">
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
    </div>
  );
}

export default CreateProject;
