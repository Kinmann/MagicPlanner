import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import styles from './Overlay.module.scss';

export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const Sheet: React.FC<SheetProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children 
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={styles.sheetOverlay}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={styles.sheet}
          >
            <div className={styles.sheetHeader}>
              {title && <h3 className={styles.sheetTitle}>{title}</h3>}
              <button className={styles.closeBtn} onClick={onClose}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.sheetContent}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
