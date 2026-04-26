import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  Sparkles 
} from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { Alert } from '../ui/Alert';

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
       setError('Project concept must be at least 50 characters for effective AI analysis.');
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

  return (
    <Dialog 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Create New Project"
      size="md"
    >
      <div className="pt-4">
        <form id="create-project-form" onSubmit={handleSubmit} className="space-y-6">
          <Input 
            label="Project Identity"
            id="project-name"
            placeholder="e.g., Nexus AI Healthcare Platform"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <div className="space-y-2">
            <label className="text-sm font-medium opacity-60">Pipeline Orchestration Mode</label>
            <div className="flex gap-2 p-1 bg-black/20 rounded-lg border border-white/5">
              {[
                { value: 'AUTO', label: 'Autonomous', desc: 'AI flow' },
                { value: 'MANUAL', label: 'Supervised', desc: 'Human review' }
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value as any)}
                  className={`flex-1 py-2 px-3 rounded-md text-xs transition-all ${
                    mode === opt.value 
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <div className="font-bold">{opt.label}</div>
                  <div className="opacity-60 text-[10px]">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Textarea 
              label="Business Goal & Vision"
              placeholder="Describe your software project, target audience, and the core problem it solves."
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              rows={5}
              required
            />
            <div className="flex justify-end">
              <span className={`text-[10px] font-bold ${concept.length < 50 ? 'text-amber-500' : 'text-emerald-500'}`}>
                {concept.length} / 50 characters
              </span>
            </div>
          </div>

          {error && (
            <Alert 
              variant="error"
              description={error}
            />
          )}

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button 
              variant="primary" 
              type="submit" 
              isLoading={isLoading}
              leftIcon={<Sparkles size={16} />}
            >
              Initialize Project
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
  );
};

export default CreateProjectModal;
