import React from 'react';
import { Check } from 'lucide-react';
import styles from './Navigation.module.scss';

export interface Step {
  id: string | number;
  title: string;
  description?: string;
}

export interface StepperProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({ steps, currentStep, className = '' }) => {
  return (
    <div className={`${styles.stepper} ${className}`}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;
        
        return (
          <React.Fragment key={step.id}>
            <div className={`${styles.step} ${isCompleted ? styles.completed : ''} ${isActive ? styles.active : ''}`}>
              <div className={styles.stepCircle}>
                {isCompleted ? <Check size={14} /> : <span>{index + 1}</span>}
              </div>
              <div className={styles.stepInfo}>
                <div className={styles.stepTitle}>{step.title}</div>
                {step.description && <div className={styles.stepDescription}>{step.description}</div>}
              </div>
            </div>
            {index < steps.length - 1 && (
              <div className={`${styles.stepConnector} ${isCompleted ? styles.filled : ''}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
