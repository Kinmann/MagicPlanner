import React from 'react';
import styles from './Toggle.module.scss';

interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Switch: React.FC<SwitchProps> = ({ label, className = '', ...props }) => {
  return (
    <label className={`${styles.switchLabel} ${className}`}>
      {label && <span className={styles.labelText}>{label}</span>}
      <div className={styles.switchWrapper}>
        <input type="checkbox" className={styles.hiddenInput} {...props} />
        <div className={styles.slider} />
      </div>
    </label>
  );
};

export const Checkbox: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label?: string }> = ({ label, className = '', ...props }) => {
  return (
    <label className={`${styles.checkboxLabel} ${className}`}>
      <div className={styles.checkboxWrapper}>
        <input type="checkbox" className={styles.hiddenInput} {...props} />
        <div className={styles.checkmark} />
      </div>
      {label && <span className={styles.labelText}>{label}</span>}
    </label>
  );
};
