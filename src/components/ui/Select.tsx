import React from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './Form.module.scss';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string | number; label: string }[];
}

export const Select: React.FC<SelectProps> = ({ 
  label, 
  error, 
  options, 
  className = '', 
  id, 
  ...props 
}) => {
  return (
    <div className={`${styles.selectWrapper} ${className}`}>
      {label && <label htmlFor={id} className={styles.label}>{label}</label>}
      <div className={styles.selectContainer}>
        <select id={id} className={styles.select} {...props}>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown size={14} className={styles.chevron} />
      </div>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
};

export default Select;
