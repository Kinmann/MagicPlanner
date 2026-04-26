import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import styles from './Dialog.module.scss';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  headerClass?: string;
  customHeader?: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  headerClass = '',
  customHeader
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className={styles.overlayWrapper}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={styles.overlay}
            onClick={onClose}
          />
          <div className={styles.container}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`${styles.content} ${styles[size]}`}
            >
              {customHeader ? (
                <header className={`${styles.header} ${headerClass}`}>
                  {customHeader}
                  <button className={styles.closeBtn} onClick={onClose}>
                    <X size={20} />
                  </button>
                </header>
              ) : (
                <header className={`${styles.header} ${headerClass}`}>
                  <div className={styles.titleArea}>
                    {title && <h2 className={styles.title}>{title}</h2>}
                    {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
                  </div>
                  <button className={styles.closeBtn} onClick={onClose}>
                    <X size={20} />
                  </button>
                </header>
              )}

              <div className={styles.body}>
                {children}
              </div>

              {footer && (
                <footer className={styles.footer}>
                  {footer}
                </footer>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Dialog;
