import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './Overlay.module.scss';

export interface TooltipProps {
  content: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({ 
  content, 
  children, 
  side = 'top',
  delay = 0.2
}) => {
  const [isVisible, setIsVisible] = useState(false);
  let timeout: any;

  const show = () => {
    timeout = setTimeout(() => setIsVisible(true), delay * 1000);
  };

  const hide = () => {
    clearTimeout(timeout);
    setIsVisible(false);
  };

  return (
    <div className={styles.tooltipWrapper} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`${styles.tooltip} ${styles[side]}`}
          >
            {content}
            <div className={styles.arrow} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
