import React from 'react';
import styles from './Progress.module.scss';

export interface ProgressProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export const Progress: React.FC<ProgressProps> = ({ 
  value, 
  max = 100, 
  size = 'md',
  showLabel = false,
  className = ''
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={`${styles.container} ${className}`}>
      {showLabel && (
        <div className={styles.labelArea}>
          <span className={styles.percentage}>{Math.round(percentage)}%</span>
        </div>
      )}
      <div className={`${styles.track} ${styles[size]}`}>
        <div 
          className={styles.fill} 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export default Progress;
