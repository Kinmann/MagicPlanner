import React from 'react';
import { PipelinePhase, PHASE_LABELS } from '../../types/project';
import './PhaseProgressBar.scss';

interface PhaseProgressBarProps {
  currentPhase: PipelinePhase; // 실제 진행 중인 단계
  activePhase?: PipelinePhase; // 현재 보고 있는 단계
  onPhaseClick?: (phase: PipelinePhase) => void;
}

const PHASES: PipelinePhase[] = ['GENESIS_PRD', 'SAD', 'MODULE_GENERATION', 'COMPLETED'];

const PhaseProgressBar: React.FC<PhaseProgressBarProps> = ({ currentPhase, activePhase, onPhaseClick }) => {
  const currentIdx = PHASES.indexOf(currentPhase);
  const viewingPhase = activePhase || currentPhase;

  return (
    <div className="phase-progress-bar">
      {PHASES.map((phase, idx) => {
        const isCompleted = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isActive = phase === viewingPhase;
        
        return (
          <React.Fragment key={phase}>
            <div 
              className={`phase-step ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''} ${isActive ? 'active' : ''}`}
              onClick={() => onPhaseClick?.(phase)}
            >
              <div className="phase-dot">
                {isCompleted ? (
                  <span className="material-symbols-outlined">check</span>
                ) : (
                  <span className="phase-number">{idx + 1}</span>
                )}
              </div>
              <span className="phase-label">{PHASE_LABELS[phase]}</span>
            </div>
            {idx < PHASES.length - 1 && (
              <div className={`phase-connector ${idx < currentIdx ? 'completed' : ''}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default PhaseProgressBar;
