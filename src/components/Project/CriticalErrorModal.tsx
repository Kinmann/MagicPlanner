import React from 'react';
import BaseModal from '../common/BaseModal';
import './CriticalErrorModal.scss';

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
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      className="modal--error"
    >
      {/* 1. Custom Error Header Bar */}
      <div className="error-header-bar">
        <div className="error-icon-box">
          <span className="material-symbols-outlined">report_problem</span>
        </div>
        <div className="error-title-group">
          <h2 className="error-title">Critical API Failure</h2>
          <p className="error-subtitle">The AI Orchestration engine encountered a lethal error.</p>
        </div>
      </div>

      {/* 2. Modal Body */}
      <div className="modal-body">
        {/* Error Context Log Section */}
        <div className="error-log-section">
          <label className="log-label">Error Diagnostic Log</label>
          <div className="log-container">
            <div className="log-list">
              {/* 1. Status */}
              <div className="log-item">
                <span className="dot">●</span>
                <span className="content">
                  <span className="highlight">STATUS:</span> 403 Forbidden (Gemini API)
                </span>
              </div>
              {/* 2. Trace */}
              <div className="log-item log-item--dim">
                <span className="dot">●</span>
                <span className="content">Trace: agent.orchestration.loop {'->'} api_deadlock</span>
              </div>
              {/* 3. Fail (ErrorMessage) */}
              <div className="log-item">
                <span className="dot">●</span>
                <span className="content">
                  <span className="highlight">FAIL:</span> {errorMessage || 'Unknown system override exception'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Custom Action Area */}
      <div className="custom-action-area">
        <div className="button-row">
          <button className="btn-secondary btn-small" onClick={onRetry} title="Attempt Recovery">
            <span className="material-symbols-outlined">refresh</span>
          </button>
          <button className="btn-primary" onClick={onSettings}>
            <span className="material-symbols-outlined">settings</span>
            Configure API
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

export default CriticalErrorModal;
