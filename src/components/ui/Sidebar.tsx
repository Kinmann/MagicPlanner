import React from 'react';
// @ts-ignore
import * as ResizablePanels from 'react-resizable-panels';
import { ResizeHandle } from './ResizeHandle';
import styles from './Layout.module.scss';

// Resizable Group Wrapper
export const ResizableGroup = ResizablePanels.Group;
export const ResizablePanel = ResizablePanels.Panel;
export const ResizableHandle = ResizeHandle;

// Sidebar Component
export interface SidebarProps {
  children: React.ReactNode;
  className?: string;
  side?: 'left' | 'right';
  width?: number | string;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  children, 
  className = '', 
  side = 'left',
  width = 260 
}) => {
  return (
    <aside 
      className={`${styles.sidebar} ${styles[side]} ${className}`}
      style={{ width }}
    >
      {children}
    </aside>
  );
};

export const SidebarHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={styles.sidebarHeader}>{children}</div>
);

export const SidebarContent: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={styles.sidebarContent}>{children}</div>
);

export const SidebarFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={styles.sidebarFooter}>{children}</div>
);
