import React from 'react';
import { Loader2 } from 'lucide-react';
import styles from './Button.module.scss'; // Reuse spinner styles from Button

export interface SpinnerProps {
  size?: number;
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 24, className = '' }) => (
  <div className={`${styles.spinnerWrapper} ${className}`}>
    <Loader2 size={size} className={styles.spinner} />
  </div>
);

export default Spinner;
