import React from 'react';
import { 
  Code, 
  Check, 
  FileText
} from 'lucide-react';
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
  isRawMode, 
  onToggleRawMode,
  title = "Generated Drafts",
  countLabel = "Draft",
  isLocked = false
}) => {
  const selectedIter = iterations.find(it => it.iteration_id === selectedIterationId);
  const canConfirm = selectedIter && !selectedIter.is_pass && !isLocked;

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
          
          <button 
            onClick={onToggleRawMode}
            className={`${styles.toggleBtn} ${isRawMode ? styles.active : ''}`}
          >
            {isRawMode ? <FileText /> : <Code />}
            {isRawMode ? 'View UI' : 'Raw Spec'}
          </button>
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
            onClick={() => selectedIterationId && onConfirmIteration(selectedIterationId)}
            disabled={!canConfirm}
            className={styles.confirmBtn}
          >
            <Check strokeWidth={3} />
            {isLocked ? 'Selection Locked' : 'Confirm Selection'}
          </button>
        </div>
      </div>
    </div>
  );
}
