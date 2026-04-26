import React from 'react';
import styles from './Navigation.module.scss';

// Kbd Component
export interface KbdProps {
  children: React.ReactNode;
  className?: string;
}

export const Kbd: React.FC<KbdProps> = ({ children, className = '' }) => {
  return (
    <kbd className={`${styles.kbd} ${className}`}>
      {children}
    </kbd>
  );
};

// Command (Simple wrapper for now)
export const Command: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = '' }) => (
  <div className={`${styles.command} ${className}`}>
    {children}
  </div>
);

export const CommandInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <div className={styles.commandInputWrapper}>
    <input className={styles.commandInput} {...props} />
  </div>
);

export const CommandList: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={styles.commandList}>{children}</div>
);

export const CommandItem: React.FC<{ children: React.ReactNode, onSelect?: () => void }> = ({ children, onSelect }) => (
  <div className={styles.commandItem} onClick={onSelect}>
    {children}
  </div>
);
