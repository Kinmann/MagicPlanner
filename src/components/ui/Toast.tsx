import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import styles from './Overlay.module.scss';

export interface ToastProps {
  id: string;
  message: string;
  variant?: 'success' | 'error' | 'info';
  onClose: (id: string) => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({ 
  id, 
  message, 
  variant = 'success', 
  onClose,
  duration = 3000
}) => {
  useEffect(() => {
    const timer = setTimeout(() => onClose(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  const icons = {
    success: <CheckCircle2 size={18} className="text-emerald-500" />,
    error: <AlertCircle size={18} className="text-red-500" />,
    info: <Info size={18} className="text-blue-500" />
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`${styles.toast} ${styles[variant]}`}
    >
      {icons[variant]}
      <span className={styles.toastMessage}>{message}</span>
      <button className={styles.closeBtn} onClick={() => onClose(id)}>
        <X size={14} />
      </button>
    </motion.div>
  );
};

export const ToastContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={styles.toastContainer}>{children}</div>
);
