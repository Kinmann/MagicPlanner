import React, { useState } from 'react';
import { 
  Code, 
  Check, 
  FileText
} from 'lucide-react';

interface Draft {
  id: string;
  status: 'default' | 'selected' | 'passed' | 'confirmed';
  label: string;
  score: number;
}

interface NodeActionHeaderProps {
  isRawMode: boolean;
  onToggleRawMode: () => void;
}

export function NodeActionHeader({ isRawMode, onToggleRawMode }: NodeActionHeaderProps) {
  const [maxIterations, setMaxIterations] = useState<number>(3);
  const [currentIteration, setCurrentIteration] = useState<number>(2);
  
  // Mock drafts for UI demonstration
  const [drafts, setDrafts] = useState<Draft[]>([
    { id: 'd1', status: 'passed', label: 'Draft 1', score: 65 },
    { id: 'd2', status: 'selected', label: 'Draft 2', score: 92 },
    { id: 'd3', status: 'default', label: 'Draft 3', score: 88 },
  ]);

  const handleSelectDraft = () => {
    setDrafts(drafts.map(d => 
      d.status === 'selected' ? { ...d, status: 'confirmed' } : d
    ));
  };

  const handleDraftClick = (id: string) => {
    setDrafts(drafts.map(d => {
      // If one is already confirmed, we might want to reset or just ignore. 
      // For this mock, we'll allow re-selecting.
      if (d.id === id) return { ...d, status: 'selected' };
      return { ...d, status: d.status === 'passed' ? 'passed' : 'default' };
    }));
  };

  const getDraftStyles = (status: string) => {
    switch(status) {
      case 'confirmed': 
        return 'bg-[#10b981] border-[#10b981] text-gray-900 shadow-[0_0_15px_rgba(16,185,129,0.3)]';
      case 'selected': 
        return 'bg-[#10b981]/15 border-[#10b981] text-[#10b981]';
      case 'passed': 
        return 'bg-[#121216] border-[#27272a] text-gray-600 opacity-60';
      default: 
        return 'bg-[#18181b] border-[#3f3f46] text-gray-300 hover:border-gray-400 hover:bg-[#27272a]';
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Drafts Section */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            Generated Drafts
            <span className="bg-[#27272a] text-gray-300 px-1.5 py-0.5 rounded text-[10px]">
              {drafts.length}
            </span>
          </span>
          
          <button 
            onClick={onToggleRawMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded transition-colors ${
              isRawMode 
                ? 'bg-[#27272a] border-[#3f3f46] text-gray-200' 
                : 'text-gray-400 border-transparent hover:bg-[#27272a] hover:text-gray-200'
            }`}
          >
            {isRawMode ? <FileText size={14} /> : <Code size={14} />}
            {isRawMode ? 'View UI' : 'Raw Spec'}
          </button>
        </div>
        
        <div className="flex items-stretch gap-3 overflow-x-auto pb-2 custom-scrollbar">
          {drafts.map((draft) => (
            <div 
              key={draft.id}
              onClick={() => handleDraftClick(draft.id)}
              className={`relative flex flex-col items-center justify-center p-3 min-w-[80px] rounded-lg border-2 cursor-pointer transition-all duration-200 ${getDraftStyles(draft.status)}`}
            >
              {/* Score Value */}
              <div className="flex items-start">
                <span className="text-2xl font-black tracking-tighter mb-0.5 font-mono">
                  {draft.score}
                </span>
                <span className="text-[10px] mt-0.5 ml-0.5 opacity-70 font-bold">
                  pt
                </span>
              </div>
              
              {/* Draft Label */}
              <span className={`text-[10px] font-bold uppercase tracking-wider ${
                draft.status === 'passed' ? 'line-through opacity-70' : ''
              }`}>
                {draft.label}
              </span>

              {/* Status Icon */}
              {draft.status === 'confirmed' && (
                <div className="absolute -top-1.5 -right-1.5 bg-gray-900 text-[#10b981] rounded-full p-0.5 border-2 border-[#10b981]">
                  <Check size={10} strokeWidth={4} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Action Button Row */}
        <div className="flex justify-end mt-1">
          <button 
            onClick={handleSelectDraft}
            disabled={!drafts.some(d => d.status === 'selected')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-900 bg-[#10b981] hover:bg-[#0ea5e9] disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors shadow-sm"
          >
            <Check size={14} strokeWidth={3} />
            Confirm Selection
          </button>
        </div>
      </div>
    </div>
  );
}
