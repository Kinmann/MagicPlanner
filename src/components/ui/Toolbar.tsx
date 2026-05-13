import React from 'react';
import styles from './Navigation.module.scss';

export interface ToolbarProps {
  children: React.ReactNode;
  className?: string;
}

export const Toolbar: React.FC<ToolbarProps> = ({ children, className = '' }) => {
  return (
    <div className={`${styles.toolbar} ${className}`} role="toolbar">
      {children}
    </div>
  );
};

export const ToolbarGroup: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = '' }) => (
  <div className={`${styles.toolbarGroup} ${className}`}>
    {children}
  </div>
);

export const ToolbarSeparator: React.FC = () => (
  <div className={styles.toolbarSeparator} />
);
