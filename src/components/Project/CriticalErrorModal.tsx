import React from 'react';
import { AlertCircle, RefreshCw, Settings } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { RagErrorInfo } from '../../store/engineStore';
import styles from './CriticalErrorModal.module.scss';

interface CriticalErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSettings: () => void;
  errorInfo?: RagErrorInfo | null;
}

const CriticalErrorModal: React.FC<CriticalErrorModalProps> = ({
  isOpen,
  onClose,
  onRetry,
  onSettings,
  errorInfo
}) => {
  return (
    <Dialog 
      isOpen={isOpen} 
      onClose={onClose}
      title="Critical API Failure"
      size="md"
    >
      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-500/10 rounded-lg">
            <AlertCircle size={24} className="text-red-500" />
          </div>
          <p className="text-sm text-gray-400">The AI Orchestration engine encountered a lethal error.</p>
        </div>
        
        <Alert 
          variant="error"
          title="Diagnostic Log"
          description={errorInfo?.error_message || 'Unknown system override exception'}
        />

        <div className={styles.logContainer}>
          <div className={styles.logList}>
            <div className={styles.logItem}>
              <span className={styles.dot}>●</span>
              <span className={styles.content}>
                <span className={styles.highlight}>PROJECT:</span> {errorInfo?.project_id || 'N/A'}
              </span>
            </div>
            <div className={`${styles.logItem} ${styles.dim}`}>
              <span className={styles.dot}>●</span>
              <span className={styles.content}>
                <span className={styles.highlight}>NODE:</span> {errorInfo?.node_type || 'ORCHESTRATOR'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 mt-6">
          <div className="flex gap-2 w-full">
            <Button 
              variant="secondary" 
              size="md" 
              className="flex-1"
              onClick={onRetry} 
              leftIcon={<RefreshCw size={14} />}
            >
              Retry
            </Button>
            <Button 
              variant="primary" 
              size="md"
              className="flex-1"
              onClick={onSettings}
              leftIcon={<Settings size={14} />}
            >
              Configure API
            </Button>
          </div>
          <button className={styles.dismissBtn} onClick={onClose}>
            Dismiss and continue
          </button>
        </div>
      </div>
    </Dialog>
  );
};

export default CriticalErrorModal;
