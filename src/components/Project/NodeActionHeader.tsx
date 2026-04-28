import React from 'react';
import { 
  Code, 
  Check, 
  FileText,
  X,
  MessageSquareText,
  AlertTriangle,
  Trash2
} from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import styles from './NodeActionHeader.module.scss';

export interface IterationData {
  iteration_id: string;
  iteration_number: number;
  calculated_score: number;
  is_pass: boolean;
  [key: string]: any;
}

interface NodeActionHeaderProps {
  iterations: IterationData[];
  selectedIterationId: string | null;
  onSelectIteration: (id: string) => void;
  onConfirmIteration: (id: string) => void;
  onDeleteIteration: (id: string) => void;
  isRawMode: boolean;
  onToggleRawMode: () => void;
  title?: string;
  countLabel?: string;
  isLocked?: boolean;
}

export const NodeActionHeader: React.FC<NodeActionHeaderProps> = ({ 
  iterations, 
  selectedIterationId, 
  onSelectIteration,
  onConfirmIteration,
  onDeleteIteration,
  isRawMode, 
  onToggleRawMode,
  title = "Generated Drafts",
  countLabel = "Draft",
  isLocked = false
}) => {
  const selectedIter = iterations.find(it => it.iteration_id === selectedIterationId);
  const isSelectedPass = selectedIter?.is_pass;
  const canAction = selectedIter && !isLocked;
  const [isFeedbackOpen, setIsFeedbackOpen] = React.useState(false);

  // 피드백 데이터 파싱
  const criticalErrors = React.useMemo(() => {
    if (!selectedIter?.critical_errors_array) return [];
    try {
      const parsed = JSON.parse(selectedIter.critical_errors_array);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }, [selectedIter]);

  const feedback = React.useMemo(() => {
    if (!selectedIter?.actionable_feedback_text) return [];
    try {
      const parsed = JSON.parse(selectedIter.actionable_feedback_text);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }, [selectedIter]);

  const hasIssues = criticalErrors.length > 0 || feedback.length > 0;

  const getCardStatus = (it: IterationData) => {
    if (it.is_pass) return styles.confirmed;
    if (it.iteration_id === selectedIterationId) return styles.selected;
    return '';
  };

  return (
    <div className={styles.container}>
      <div className={styles.draftsSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            {title}
            <span className={styles.countBadge}>
              {iterations.length}
            </span>
          </span>
          
          <div className={styles.headerRightActions}>
            <button 
              onClick={() => setIsFeedbackOpen(true)}
              className={`${styles.toggleBtn} ${hasIssues ? styles.hasIssues : ''} ${styles.feedbackBtn}`}
              title="AI Feedback & Errors"
            >
              {criticalErrors.length > 0 ? <AlertTriangle /> : <MessageSquareText />}
              <span>AI Analysis</span>
              {hasIssues && <span className={styles.dot} />}
            </button>

            <button 
              onClick={onToggleRawMode}
              className={`${styles.toggleBtn} ${isRawMode ? styles.active : ''}`}
            >
              {isRawMode ? <FileText /> : <Code />}
              {isRawMode ? 'View UI' : 'Raw Spec'}
            </button>
          </div>
        </div>
        
        <div className={styles.draftList}>
          {iterations.map((it) => (
            <div 
              key={it.iteration_id}
              onClick={() => onSelectIteration(it.iteration_id)}
              className={`${styles.draftCard} ${getCardStatus(it)}`}
            >
              <div className={styles.scoreContainer}>
                <span className={styles.scoreValue}>
                  {it.calculated_score}
                </span>
                <span className={styles.unit}>
                  pt
                </span>
              </div>
              
              <span className={styles.draftLabel}>
                {countLabel} #{it.iteration_number}
              </span>

              {it.is_pass && (
                <div className={styles.statusIcon}>
                  <Check strokeWidth={4} />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={styles.actionRow}>
          <button 
            onClick={() => selectedIterationId && onDeleteIteration(selectedIterationId)}
            disabled={!canAction}
            className={styles.deleteBtn}
            title="Delete this draft"
          >
            <Trash2 size={18} />
          </button>

          <button 
            onClick={() => selectedIterationId && onConfirmIteration(selectedIterationId)}
            disabled={!canAction}
            className={`${styles.confirmBtn} ${isSelectedPass ? styles.unconfirm : ''}`}
          >
            {isSelectedPass ? <X strokeWidth={3} /> : <Check strokeWidth={3} />}
            {isLocked ? 'Selection Locked' : (isSelectedPass ? 'Unconfirm Selection' : 'Confirm Selection')}
          </button>
        </div>
      </div>

      <Dialog
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        title={`AI Analysis: Iteration #${selectedIter?.iteration_number || 0}`}
        size="md"
      >
        <div className={styles.modalContent}>
          {criticalErrors.length > 0 && (
            <div className={styles.errorSection}>
              <h3 className={styles.sectionTitleError}>
                <AlertTriangle size={16} /> Critical Errors
              </h3>
              <div className={styles.errorList}>
                {criticalErrors.map((err: any, idx: number) => (
                  <div key={idx} className={styles.issueItem}>
                    <span className={styles.issueLocation}>[{err.location || 'Global'}]</span>
                    <span className={styles.issueCode}>{err.code}</span>
                    <p className={styles.issueDesc}>{err.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.feedbackSection}>
            <h3 className={styles.sectionTitleFeedback}>
              <MessageSquareText size={16} /> Actionable Feedback
            </h3>
            {feedback.length > 0 ? (
              <div className={styles.feedbackList}>
                {feedback.map((f: any, idx: number) => (
                  <div key={idx} className={styles.issueItem}>
                    <span className={styles.issueLocation}>[{f.location || 'Global'}]</span>
                    <p className={styles.issueDesc}>{typeof f === 'string' ? f : f.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.emptyText}>No major feedback for this iteration.</p>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
};
