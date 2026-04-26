import React, { useState } from 'react';
import { motion } from 'framer-motion';
import styles from './Navigation.module.scss';

// ScrollArea Component
export const ScrollArea: React.FC<{ children: React.ReactNode, maxHeight?: string | number, className?: string }> = ({ 
  children, 
  maxHeight, 
  className = '' 
}) => {
  return (
    <div 
      className={`${styles.scrollArea} ${className}`} 
      style={{ maxHeight }}
    >
      {children}
    </div>
  );
};

// Tabs Components
interface TabsProps {
  defaultValue: string;
  children: React.ReactNode;
  className?: string;
  onValueChange?: (value: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ defaultValue, children, className = '', onValueChange }) => {
  const [activeTab, setActiveTab] = useState(defaultValue);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    onValueChange?.(value);
  };

  return (
    <div className={`${styles.tabs} ${className}`}>
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as any, { activeTab, onTabChange: handleTabChange });
        }
        return child;
      })}
    </div>
  );
};

export const TabsList: React.FC<{ children: React.ReactNode, className?: string, activeTab?: string, onTabChange?: (v: string) => void }> = ({ 
  children, className = '', activeTab, onTabChange 
}) => (
  <div className={`${styles.tabsList} ${className}`}>
    {React.Children.map(children, child => {
      if (React.isValidElement(child)) {
        return React.cloneElement(child as any, { activeTab, onTabChange });
      }
      return child;
    })}
  </div>
);

export const TabsTrigger: React.FC<{ value: string, children: React.ReactNode, activeTab?: string, onTabChange?: (v: string) => void }> = ({ 
  value, children, activeTab, onTabChange 
}) => {
  const isActive = activeTab === value;
  return (
    <button 
      className={`${styles.tabsTrigger} ${isActive ? styles.active : ''}`}
      onClick={() => onTabChange?.(value)}
    >
      {children}
      {isActive && (
        <motion.div 
          layoutId="activeTab"
          className={styles.activeIndicator}
          transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
        />
      )}
    </button>
  );
};

export const TabsContent: React.FC<{ value: string, children: React.ReactNode, activeTab?: string }> = ({ 
  value, children, activeTab 
}) => {
  if (activeTab !== value) return null;
  return (
    <div className={styles.tabsContent}>
      {children}
    </div>
  );
};
