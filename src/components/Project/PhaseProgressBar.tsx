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
    <nav className="phase-progress-bar">
      {PHASES.map((phase, idx) => {
        const isCompleted = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isActive = phase === viewingPhase;
        const isLocked = idx > currentIdx && phase !== 'COMPLETED';

        let icon = 'circle';
        if (isCompleted) icon = 'check_circle';
        else if (isCurrent) icon = 'radio_button_checked';
        else if (phase === 'COMPLETED') icon = 'lock';

        return (
          <React.Fragment key={phase}>
            <div 
              className={`phase-item ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
              onClick={() => onPhaseClick?.(phase)}
            >
              <span className={`material-symbols-outlined icon ${isCompleted || isCurrent ? 'filled' : ''}`}>
                {icon}
              </span>
              <span className="label">{PHASE_LABELS[phase]}</span>
            </div>
            {idx < PHASES.length - 1 && (
              <div className="phase-spacer" />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default PhaseProgressBar;
