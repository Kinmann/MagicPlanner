import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './Overlay.module.scss';

export interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export const Popover: React.FC<PopoverProps> = ({ 
  trigger, 
  children, 
  side = 'bottom' 
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={styles.popoverWrapper}>
      <div onClick={() => setIsOpen(!isOpen)} className={styles.popoverTrigger}>
        {trigger}
      </div>
      <AnimatePresence>
        {isOpen && (
          <>
            <div className={styles.popoverBackdrop} onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: side === 'bottom' ? -10 : 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: side === 'bottom' ? -10 : 10 }}
              className={`${styles.popover} ${styles[side]}`}
            >
              {children}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
