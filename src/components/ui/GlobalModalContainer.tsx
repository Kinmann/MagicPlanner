import React from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { useModalStore } from '../../store/modalStore';
import { AlertCircle, HelpCircle, Info } from 'lucide-react';
import styles from './GlobalModal.module.scss';

export const GlobalModalContainer: React.FC = () => {
  const { 
    isOpen, 
    type, 
    title, 
    message, 
    confirmLabel, 
    cancelLabel, 
    onConfirm, 
    closeModal 
  } = useModalStore();

  const getIcon = () => {
    switch (type) {
      case 'ERROR': 
        return (
          <div className={`${styles.iconWrapper} ${styles.error}`}>
            <AlertCircle size={32} />
          </div>
        );
      case 'CONFIRM': 
        return (
          <div className={`${styles.iconWrapper} ${styles.confirm}`}>
            <HelpCircle size={32} />
          </div>
        );
      default: 
        return (
          <div className={`${styles.iconWrapper} ${styles.alert}`}>
            <Info size={32} />
          </div>
        );
    }
  };

  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    closeModal();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={closeModal}
      title={title}
      size="sm"
    >
      <div className={styles.modalContent}>
        {getIcon()}
        <div className={styles.message}>
          {message}
        </div>
        
        <div className={styles.actions}>
          {type === 'CONFIRM' && (
            <Button variant="ghost" onClick={closeModal}>
              {cancelLabel}
            </Button>
          )}
          <Button 
            variant={type === 'ERROR' ? 'danger' : 'primary'} 
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
