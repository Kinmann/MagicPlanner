import React from 'react';
import BaseModal from '../common/BaseModal';
import './HitlWarningModal.scss';

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
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      className={`modal--hitl ${isThresholdMet ? 'modal--hitl-success' : ''}`}
    >
      {/* 1. Custom Warning Header Bar */}
      <div className={`warning-header-bar ${isThresholdMet ? 'is-success' : ''}`}>
        <div className="warning-icon-box">
          <span className="material-symbols-outlined">{isThresholdMet ? 'verified' : 'warning'}</span>
        </div>
        <div className="warning-title-group">
          <h2 className="warning-title">{isThresholdMet ? 'Checkpoint Reached' : 'Quality Threshold Alert'}</h2>
          <p className="warning-subtitle">{isThresholdMet ? 'Human-in-the-Loop Approval Required' : 'Human-in-the-Loop Intervention Required'}</p>
        </div>
      </div>

      {/* 2. Modal Body */}
      <div className="modal-body">
        {/* Detail Section */}
        <div className="hitl-detail-section">
          <label className="detail-label">HITL Intervention Details</label>
          <div className="detail-container">
            <div className="detail-list">
              <div className="detail-item">
                <span className="dot">●</span>
                <span className="content">
                  <span className="highlight">NODE TYPE:</span> {nodeType}
                </span>
              </div>
              <div className="detail-item">
                <span className="dot">●</span>
                <span className="content">
                  <span className="highlight">SCORE:</span> {currentScore}% ({isThresholdMet ? 'Threshold Met' : 'Below Threshold'})
                </span>
              </div>
              <div className="detail-item">
                <span className="dot">●</span>
                <span className="content">
                  <span className="highlight">STATUS:</span> {isThresholdMet ? 'Quality check passed by LLM judge.' : 'Quality check failed by LLM judge.'}
                </span>
              </div>
              <div className="detail-item">
                <span className="dot">●</span>
                <span className="content">
                  <span className="highlight">ACTION REQUIRED:</span> {isThresholdMet ? 'Review and approve to proceed.' : 'Manual override or pipeline retry.'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Custom Action Area */}
      <div className="custom-action-area">
        <div className="button-row">
          {/* Left: Secondary Icon Button (Approve) */}
          <button 
            className="btn-secondary btn-small" 
            onClick={onApprove} 
            title="Force Approve"
          >
            <span className="material-symbols-outlined">verified</span>
          </button>
          
          {/* Right: Primary Emphasis Button (Retry) */}
          <button className="btn-primary" onClick={onRetry}>
            <span className="material-symbols-outlined">refresh</span>
            Retry Pipeline
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

export default HitlWarningModal;
