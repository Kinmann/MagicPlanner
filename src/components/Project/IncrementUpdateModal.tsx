import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Store } from '@tauri-apps/plugin-store';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Lightbulb, CheckCircle, 
  XCircle, Layers,
  ShieldCheck, Zap, Check,
  ChevronRight, Sparkles
} from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { Alert } from '../ui/Alert';
import { Spinner } from '../ui/Spinner';

interface IncrementUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onSuccess?: () => void;
}

type UpdateStep = 'INPUT' | 'ANALYZING' | 'CONFIRMATION' | 'VALIDATING' | 'VALIDATION_RESULT' | 'CASCADING' | 'SUCCESS';

interface ValidationResult {
  decision: 'PASS' | 'FAIL' | 'REFACTORING';
  rationale: string;
  violations: string[];
}

const IncrementUpdateModal: React.FC<IncrementUpdateModalProps> = (props) => {
  const { isOpen, onClose, projectId, onSuccess } = props;
  const [step, setStep] = useState<UpdateStep>('INPUT');
  const [requestText, setRequestText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetNodes, setTargetNodes] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState<string>('');
  const [intent, setIntent] = useState<any>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  useEffect(() => {
    const loadApiKey = async () => {
      try {
        const store = await Store.load('settings.json');
        const apiKeyValue = await store.get<{ value: string }>('gemini_api_key');
        if (apiKeyValue?.value) setApiKey(apiKeyValue.value);
      } catch (e) { console.error(e); }
    };
    loadApiKey();
  }, []);

  const handleStartAnalysis = async () => {
    if (!requestText.trim()) { setError('Please enter the details of your modification request.'); return; }
    if (!apiKey) { setError('Gemini API Key is not configured.'); return; }

    setIsLoading(true);
    setError(null);
    setStep('ANALYZING');
    try {
      const parsedIntent = await invoke<any>('parse_intent', { apiKey, rawInput: requestText });
      setIntent(parsedIntent);
      const routing = await invoke<any>('route_architecture_target', { apiKey, projectId, intent: parsedIntent });
      setTargetNodes(routing.target_nodes);
      setStep('CONFIRMATION');
    } catch (err: any) {
      setError(err.toString());
      setStep('INPUT');
    } finally { setIsLoading(false); }
  };

  const handleConfirmRouting = async () => {
    setIsLoading(true);
    setError(null);
    setStep('VALIDATING');
    try {
      const result = await invoke<ValidationResult>('validate_intent_globally', {
        apiKey, projectId, intent, targets: targetNodes
      });
      setValidationResult(result);
      setStep('VALIDATION_RESULT');
    } catch (err: any) {
      setError(err.toString());
      setStep('CONFIRMATION');
    } finally { setIsLoading(false); }
  };

  const handleApproveValidation = async () => {
    setIsLoading(true);
    setError(null);
    setStep('CASCADING');
    try {
      await invoke('apply_taint_cascade', { projectId, intent, targets: targetNodes });
      setStep('SUCCESS');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.toString());
      setStep('VALIDATION_RESULT');
    } finally { setIsLoading(false); }
  };

  const renderContent = () => {
    switch (step) {
      case 'INPUT':
        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <p className="text-sm text-gray-400">
              Describe the features or changes you want to add. AI will analyze the architecture impact and identify required modifications.
            </p>
            <Textarea
              placeholder="e.g. Add Apple Pay support to the payment module and refactor legacy checkout logic."
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              rows={6}
              autoFocus
            />
            <div className="flex items-center gap-2 text-[11px] text-emerald-500/60 bg-emerald-500/5 p-2 rounded-lg border border-emerald-500/10">
              <Lightbulb size={14} />
              <span>Tip: Specific goals and target modules improve analysis accuracy.</span>
            </div>
          </motion.div>
        );
      case 'ANALYZING':
      case 'VALIDATING':
      case 'CASCADING':
        const label = step === 'ANALYZING' ? 'Analyzing Intent...' : step === 'VALIDATING' ? 'Validating Constraints...' : 'Cascading Changes...';
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="relative mb-6">
               <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full animate-pulse" />
               <Spinner size={32} />
            </div>
            <h3 className="text-lg font-bold mb-2">{label}</h3>
            <p className="text-sm text-gray-500">Orchestrating system state for incremental updates...</p>
          </div>
        );
      case 'CONFIRMATION':
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
             <div className="flex items-center gap-2 mb-1">
               <Layers size={18} className="text-emerald-500" />
               <h3 className="font-bold">Architecture Mapping</h3>
             </div>
             <p className="text-sm text-gray-400">The following nodes have been identified as targets for modification:</p>
             <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto p-2 bg-black/20 rounded-lg border border-white/5">
                {targetNodes.map((node, idx) => (
                   <div key={idx} className="flex items-center gap-2 p-2 bg-white/5 rounded border border-white/5 text-xs">
                     <Zap size={12} className="text-emerald-500" />
                     <span className="font-mono">{node}</span>
                   </div>
                ))}
             </div>
             <Alert 
               variant="warning"
               description="Approved changes will proceed to global constraint validation."
             />
          </motion.div>
        );
      case 'VALIDATION_RESULT':
        const decisionVariant = validationResult?.decision === 'PASS' ? 'success' : validationResult?.decision === 'FAIL' ? 'error' : 'warning';
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <ShieldCheck size={20} className="text-emerald-500" />
                Validation Analysis
              </h3>
              <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                decisionVariant === 'success' ? 'bg-emerald-500/20 text-emerald-500' : 
                decisionVariant === 'error' ? 'bg-rose-500/20 text-rose-500' : 
                'bg-amber-500/20 text-amber-500'
              }`}>
                {validationResult?.decision}
              </div>
            </div>
            
            <div className="p-4 bg-white/5 rounded-xl border border-white/10 text-sm leading-relaxed italic text-gray-300">
              "{validationResult?.rationale}"
            </div>

            {validationResult?.violations && validationResult.violations.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[10px] font-black uppercase tracking-tighter text-gray-500 flex items-center gap-1">
                  <XCircle size={12}/> Violations Found
                </h4>
                <div className="space-y-1">
                  {validationResult.violations.map((v, i) => (
                    <div key={i} className="text-xs text-rose-400 bg-rose-500/5 p-2 rounded border border-rose-500/10 flex gap-2">
                      <span className="opacity-50">•</span> {v}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        );
      case 'SUCCESS':
        return (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500 mb-2">
              <CheckCircle size={40} />
            </div>
            <h3 className="text-xl font-bold">Refinement Initiated</h3>
            <p className="text-sm text-gray-500 max-w-[300px]">The architecture modification pipeline has been successfully triggered.</p>
          </div>
        );
    }
  };

  const getFooter = () => {
    if (step === 'INPUT') return (
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button 
          variant="primary" 
          onClick={handleStartAnalysis} 
          isLoading={isLoading}
          leftIcon={<Sparkles size={16} />}
        >
          Start AI Analysis
        </Button>
      </div>
    );
    if (step === 'CONFIRMATION') return (
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={() => setStep('INPUT')}>Reset</Button>
        <Button 
          variant="primary" 
          onClick={handleConfirmRouting} 
          isLoading={isLoading} 
          rightIcon={<ChevronRight size={16}/>}
        >
          Validate Changes
        </Button>
      </div>
    );
    if (step === 'VALIDATION_RESULT') return (
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={() => setStep('INPUT')}>Start Over</Button>
        <Button 
          variant="primary" 
          onClick={handleApproveValidation} 
          isLoading={isLoading}
          disabled={validationResult?.decision === 'FAIL'}
          leftIcon={<Check size={16}/>}
        >
          Confirm & Cascade
        </Button>
      </div>
    );
    if (step === 'SUCCESS') return (
      <Button variant="primary" onClick={onClose} className="w-full">Acknowledge</Button>
    );
    return null;
  };

  return (
    <Dialog 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Architecture Refinement"
      size={(step === 'CONFIRMATION' || step === 'VALIDATION_RESULT') ? 'md' : 'sm'}
    >
      <div className="pt-4">
        <AnimatePresence mode="wait">
          {renderContent()}
        </AnimatePresence>
        {error && (
          <Alert 
            variant="error"
            description={error}
            className="mt-4"
          />
        )}
        <div className="mt-6">
          {getFooter()}
        </div>
      </div>
    </Dialog>
  );
};

export default IncrementUpdateModal;
