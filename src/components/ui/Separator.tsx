import React from 'react';
import styles from './Separator.module.scss';

export interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export const Separator: React.FC<SeparatorProps> = ({ 
  orientation = 'horizontal', 
  className = '' 
}) => {
  return (
    <div 
      className={`${styles.separator} ${styles[orientation]} ${className}`} 
      role="separator"
    />
  );
};

export default Separator;
