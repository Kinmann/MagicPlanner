import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { FolderKanban, Plus, Type, FileText, LayoutTemplate, Send, Users, ChevronRight, X } from 'lucide-react';

export function CreateProject() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    template: 'blank',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNext = () => setStep(step + 1);
  const handleBack = () => setStep(step - 1);
  
  const handleCreate = () => {
    // Navigate to a new hypothetical project id
    navigate(`/project/new-project-123`);
  };

  return (
    <div className="flex-1 bg-[#121216] flex items-center justify-center p-8 overflow-y-auto">
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col min-h-[500px]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#27272a] bg-[#1e1e24]">
          <h1 className="text-xl font-bold text-gray-100 flex items-center gap-3">
            <div className="p-2 bg-[#10b981]/10 rounded-lg">
              <FolderKanban className="text-[#10b981]" size={20} />
            </div>
            Create New Workspace
          </h1>
          <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-[#27272a] h-1">
          <div 
            className="bg-[#10b981] h-full transition-all duration-300 ease-out" 
            style={{ width: `${(step / 2) * 100}%` }}
          />
        </div>

        {/* Form Body */}
        <div className="p-8 flex-1 flex flex-col">
          {step === 1 && (
            <div className="space-y-6 flex-1 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-gray-200">Project Details</h2>
                <p className="text-sm text-gray-400">Give your new workspace a name and description.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-2">
                    <Type size={14} className="text-gray-500" /> Project Name
                  </label>
                  <input 
                    type="text" 
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g., Q3 Marketing Campaign"
                    className="w-full bg-[#121216] border border-[#27272a] rounded-md px-4 py-2.5 text-gray-200 focus:outline-none focus:border-[#10b981] focus:ring-1 focus:ring-[#10b981] transition-all placeholder-gray-600"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-2">
                    <FileText size={14} className="text-gray-500" /> Description (Optional)
                  </label>
                  <textarea 
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Briefly describe what this project is about..."
                    rows={4}
                    className="w-full bg-[#121216] border border-[#27272a] rounded-md px-4 py-2.5 text-gray-200 focus:outline-none focus:border-[#10b981] focus:ring-1 focus:ring-[#10b981] transition-all resize-none placeholder-gray-600"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 flex-1 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-gray-200">Select Template</h2>
                <p className="text-sm text-gray-400">Start from scratch or use an AI-optimized structure.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <TemplateCard 
                  title="Blank Workspace" 
                  desc="Start completely fresh" 
                  icon={<Plus />} 
                  selected={formData.template === 'blank'}
                  onClick={() => setFormData({...formData, template: 'blank'})}
                />
                <TemplateCard 
                  title="Software Architecture" 
                  desc="Pre-defined microservices layout" 
                  icon={<LayoutTemplate />} 
                  selected={formData.template === 'software'}
                  onClick={() => setFormData({...formData, template: 'software'})}
                />
                <TemplateCard 
                  title="Design System" 
                  desc="Tokens, components, and guidelines" 
                  icon={<LayoutTemplate />} 
                  selected={formData.template === 'design'}
                  onClick={() => setFormData({...formData, template: 'design'})}
                />
                <TemplateCard 
                  title="Marketing Campaign" 
                  desc="Phases, deliverables, and tracking" 
                  icon={<LayoutTemplate />} 
                  selected={formData.template === 'marketing'}
                  onClick={() => setFormData({...formData, template: 'marketing'})}
                />
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="mt-8 flex items-center justify-between pt-6 border-t border-[#27272a]">
            {step > 1 ? (
              <button 
                onClick={handleBack}
                className="text-gray-400 hover:text-white px-4 py-2 font-medium transition-colors"
              >
                Back
              </button>
            ) : (
              <div /> // spacer
            )}
            
            {step < 2 ? (
              <button 
                onClick={handleNext}
                disabled={!formData.name.trim()}
                className="flex items-center gap-2 bg-[#10b981] hover:bg-[#059669] disabled:bg-[#27272a] disabled:text-gray-500 disabled:cursor-not-allowed text-[#121216] font-semibold px-6 py-2 rounded-md transition-colors"
              >
                Continue <ChevronRight size={18} />
              </button>
            ) : (
              <button 
                onClick={handleCreate}
                className="flex items-center gap-2 bg-[#10b981] hover:bg-[#059669] text-[#121216] font-semibold px-6 py-2 rounded-md transition-colors shadow-[0_0_15px_rgba(16,185,129,0.3)]"
              >
                <Send size={16} /> Create Workspace
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateCard({ title, desc, icon, selected, onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className={`p-4 rounded-lg border cursor-pointer transition-all flex flex-col gap-3 ${
        selected 
          ? 'bg-[#10b981]/10 border-[#10b981] text-[#10b981]' 
          : 'bg-[#121216] border-[#27272a] text-gray-400 hover:border-gray-500 hover:bg-[#18181b]'
      }`}
    >
      <div className={`p-2 w-fit rounded-md ${selected ? 'bg-[#10b981]/20' : 'bg-[#27272a]'}`}>
        {React.cloneElement(icon, { size: 20 })}
      </div>
      <div>
        <h3 className={`font-semibold text-sm ${selected ? 'text-gray-200' : 'text-gray-300'}`}>{title}</h3>
        <p className="text-xs text-gray-500 mt-1">{desc}</p>
      </div>
    </div>
  );
}
