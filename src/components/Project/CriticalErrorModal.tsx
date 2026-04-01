import React from 'react';
import BaseModal from '../common/BaseModal';
import Button from '../common/Button';

interface CriticalErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSettings: () => void;
  errorMessage?: string;
}

const CriticalErrorModal: React.FC<CriticalErrorModalProps> = ({
  isOpen,
  onClose,
  onRetry,
  onSettings,
  errorMessage
}) => {
  const footer = (
    <>
      <Button variant="ghost" onClick={onClose}>
        Dismiss
      </Button>
      <Button variant="secondary" onClick={onSettings} leftIcon={<span className="material-symbols-outlined">settings</span>}>
        Configure API
      </Button>
      <Button variant="primary" onClick={onRetry} leftIcon={<span className="material-symbols-outlined">refresh</span>}>
        Attempt Recovery
      </Button>
    </>
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Critical API Failure"
      subtitle="Execution Context Interrupted"
      footer={footer}
      size="md"
      className="modal--error"
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <span className="material-symbols-outlined text-red-500 text-4xl">report_problem</span>
          <div>
            <h4 className="text-red-500 font-bold mb-1">Service Unreachable</h4>
            <p className="text-on-surface-variant text-sm">
              The AI Orchestration engine encountered a lethal error while communicating with the Gemini API.
            </p>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/10">
          <h5 className="label-uppercase text-xs text-on-surface-variant mb-2">Error Diagnostic Log</h5>
          <pre className="text-error font-mono text-[10px] leading-relaxed p-2 bg-on-surface/5 rounded overflow-x-auto max-h-[120px] custom-scrollbar">
            {errorMessage || 'Unknown stack trace exception'}
          </pre>
        </div>
      </div>
    </BaseModal>
  );
};

export default CriticalErrorModal;
