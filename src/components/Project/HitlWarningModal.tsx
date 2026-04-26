import React from 'react';
import { ShieldCheck, AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';

interface HitlWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void;
  onApprove: () => void;
  nodeType: string;
  currentScore: number;
  threshold?: number;
}

const HitlWarningModal: React.FC<HitlWarningModalProps> = ({
  isOpen,
  onClose,
  onRetry,
  onApprove,
  nodeType,
  currentScore,
  threshold = 80
}) => {
  const isThresholdMet = currentScore >= threshold;

  return (
    <Dialog 
      isOpen={isOpen} 
      onClose={onClose} 
      title={isThresholdMet ? 'Checkpoint Reached' : 'Quality Threshold Alert'}
      size="md"
    >
      <div className="space-y-6 pt-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isThresholdMet ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500'}`}>
            {isThresholdMet ? <ShieldCheck size={24} /> : <AlertTriangle size={24} />}
          </div>
          <div>
            <p className="text-xs opacity-50">
              {isThresholdMet ? 'Human-in-the-Loop Approval Required' : 'Human-in-the-Loop Intervention Required'}
            </p>
          </div>
        </div>

        <Alert 
          variant={isThresholdMet ? "info" : "warning"}
          title="HITL Intervention Details"
          description={`Node: ${nodeType} | Score: ${currentScore}% (${isThresholdMet ? 'Met' : 'Below'} ${threshold}%)`}
        />
        
        <p className="text-sm text-gray-400">
          {isThresholdMet 
            ? "The generated content meets the minimum quality requirements. You can approve this iteration to proceed or retry for a better result."
            : "The generated content did not meet the desired score. Please review the output and decide whether to retry or force approve."}
        </p>

        <div className="flex flex-col gap-3 mt-6">
          <div className="flex gap-2 w-full">
            <Button 
              variant="ghost" 
              size="sm" 
              className="flex-1"
              onClick={onApprove} 
              leftIcon={<CheckCircle size={14} />}
            >
              Force Approve
            </Button>
            
            <Button 
              variant="primary" 
              className="flex-1"
              onClick={onRetry}
              leftIcon={<RefreshCw size={14} />}
            >
              Retry Pipeline
            </Button>
          </div>
          <button 
            className="text-[10px] text-gray-500 hover:text-white transition-colors uppercase font-bold tracking-widest text-center w-full"
            onClick={onClose}
          >
            Dismiss and stay paused
          </button>
        </div>
      </div>
    </Dialog>
  );
};

export default HitlWarningModal;
