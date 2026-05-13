import React, { useState } from 'react';
import styles from './Navigation.module.scss';

export interface MenubarProps {
  children: React.ReactNode;
  className?: string;
}

export const Menubar: React.FC<MenubarProps> = ({ children, className = '' }) => {
  return (
    <div className={`${styles.menubar} ${className}`}>
      {children}
    </div>
  );
};

export const MenubarMenu: React.FC<{ children: React.ReactNode, label: string }> = ({ children, label }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div 
      className={styles.menubarMenu}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <div className={`${styles.menubarTrigger} ${isOpen ? styles.active : ''}`}>
        {label}
      </div>
      {isOpen && (
        <div className={styles.menubarContent}>
          {children}
        </div>
      )}
    </div>
  );
};

export const MenubarItem: React.FC<{ 
  children: React.ReactNode, 
  onClick?: () => void,
  shortcut?: string,
  icon?: React.ReactNode
}> = ({ children, onClick, shortcut, icon }) => (
  <div className={styles.menubarItem} onClick={onClick}>
    <span className={styles.itemIcon}>{icon}</span>
    <span className={styles.itemLabel}>{children}</span>
    {shortcut && <span className={styles.shortcut}>{shortcut}</span>}
  </div>
);

export const MenubarSeparator: React.FC = () => (
  <div className={styles.menubarSeparator} />
);
