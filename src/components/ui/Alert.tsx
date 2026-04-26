import React from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import styles from './Overlay.module.scss';

export interface AlertProps {
  title?: string;
  description: string;
  variant?: 'success' | 'error' | 'warning' | 'info';
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({ 
  title, 
  description, 
  variant = 'info',
  className = '' 
}) => {
  const icons = {
    success: <CheckCircle2 size={18} className="text-emerald-500" />,
    error: <AlertCircle size={18} className="text-red-500" />,
    warning: <AlertTriangle size={18} className="text-amber-500" />,
    info: <Info size={18} className="text-blue-500" />
  };

  return (
    <div className={`${styles.alert} ${styles[variant]} ${className}`}>
      <div className={styles.alertIcon}>{icons[variant]}</div>
      <div className={styles.alertContent}>
        {title && <div className={styles.alertTitle}>{title}</div>}
        <div className={styles.alertDescription}>{description}</div>
      </div>
    </div>
  );
};
