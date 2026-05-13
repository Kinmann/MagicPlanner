import React from 'react';
import styles from './Input.module.scss'; // Share styles with Input

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export const Textarea: React.FC<TextareaProps> = ({
  label,
  error,
  fullWidth = true,
  className = '',
  id,
  ...props
}) => {
  const containerClasses = [
    styles.wrapper,
    fullWidth ? styles.fullWidth : '',
    className
  ].join(' ');

  return (
    <div className={containerClasses}>
      {label && <label htmlFor={id} className={styles.label}>{label}</label>}
      <textarea
        id={id}
        className={`${styles.input} ${styles.textarea} ${error ? styles.errorInput : ''}`}
        {...props}
      />
      {error && <span className={styles.errorMessage}>{error}</span>}
    </div>
  );
};

export default Textarea;
