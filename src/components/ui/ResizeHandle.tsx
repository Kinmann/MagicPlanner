import React from 'react';
import { Separator } from 'react-resizable-panels';
import styles from './ResizeHandle.module.scss';

export const ResizeHandle: React.FC<{ direction?: 'horizontal' | 'vertical' }> = ({ direction = 'horizontal' }) => {
  return (
    <Separator className={`${styles.handle} ${direction === 'vertical' ? styles.vertical : ''}`}>
      <div className={styles.line} />
    </Separator>
  );
};
