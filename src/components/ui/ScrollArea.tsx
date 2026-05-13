import React from 'react';
import styles from './Misc.module.scss';

export interface ScrollAreaProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const ScrollArea: React.FC<ScrollAreaProps> = ({ 
  children, 
  className = '', 
  style 
}) => {
  return (
    <div className={`${styles.scrollArea} ${className}`} style={style}>
      {children}
    </div>
  );
};

export default ScrollArea;
