import React, { useState } from 'react';
import { invoke } from "@tauri-apps/api/core";
import BaseModal from './BaseModal';
import './RagErrorModal.scss';

interface RagErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorInfo: {
    project_id: string;
    node_id: string;
    node_type: string;
    error_message: string;
  } | null;
}

const RagErrorModal: React.FC<RagErrorModalProps> = ({ isOpen, onClose, errorInfo }) => {
  const [loading, setLoading] = useState(false);
  const [retryStatus, setRetryStatus] = useState<'idle' | 'success' | 'error'>('idle');

  if (!errorInfo) return null;

  const handleRetry = async () => {
    setLoading(true);
    setRetryStatus('idle');
    try {
      const store = await Store.load('settings.json');
      const apiKeyValue = await store.get<{ value: string }>('gemini_api_key');
      const apiKey = apiKeyValue?.value || "";

      // 1. 임베딩만 다시 수행
      await invoke("index_project_embeddings", { 
        projectId: errorInfo.project_id,
        apiKey: apiKey
      });

      setRetryStatus('success');
      
      // 2. 성공 시 자동으로 다음 노드 활성화
      await invoke("manually_trigger_next_nodes", { 
        projectId: errorInfo.project_id, 
        completedNodeType: errorInfo.node_type 
      });
      
      // 약간의 지연 후 닫기
      setTimeout(onClose, 1500);
    } catch (err) {
      console.error("Retry failed:", err);
      setRetryStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      await invoke("manually_trigger_next_nodes", { 
        projectId: errorInfo.project_id, 
        completedNodeType: errorInfo.node_type 
      });
      onClose();
    } catch (err) {
      console.error("Skip failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <BaseModal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="RAG Embedding Error" 
      size="md"
      className="rag-error-modal"
    >
      <div className="error-content">
        <div className="error-icon">
          <span className="material-symbols-outlined">warning</span>
        </div>
        <div className="error-details">
          <p className="main-msg">Failed to create RAG context for <strong>{errorInfo.node_type}</strong>.</p>
          <p className="sub-msg">The pipeline is paused. You can retry the indexing now or skip if you prefer to proceed without RAG for the next phase.</p>
          <div className="error-box">
            <code>{errorInfo.error_message}</code>
          </div>
        </div>
      </div>

      <div className="custom-action-area">
        <div className="button-row">
          {/* Left: Skip button (Square) */}
          <button 
            className="btn-secondary btn-small" 
            onClick={handleSkip}
            disabled={loading}
            title="Skip & Proceed"
          >
            <span className="material-symbols-outlined">fast_forward</span>
          </button>
          
          {/* Right: Save as Context (Rectangle, Green Gradient) */}
          <button 
            className={`btn-primary ${retryStatus === 'success' ? 'btn-success' : ''}`}
            onClick={handleRetry}
            disabled={loading || retryStatus === 'success'}
          >
            {loading ? (
              <span className="material-symbols-outlined spin">sync</span>
            ) : (
              <>
                <span className="material-symbols-outlined">
                  {retryStatus === 'success' ? 'check_circle' : 'database'}
                </span>
                {retryStatus === 'success' ? 'Activated' : 'Save As Context'}
              </>
            )}
          </button>
        </div>
        
        <div className="dismiss-row">
          <button className="btn-dismiss" onClick={onClose}>
            Dismiss
          </button>
        </div>
      </div>
    </BaseModal>
  );
};

export default RagErrorModal;
