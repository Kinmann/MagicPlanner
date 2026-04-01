import React, { useEffect } from 'react';
import './BaseModal.scss';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const BaseModal: React.FC<BaseModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  className = ''
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className={`modal-container modal-container--${size} ${className}`} 
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div className="modal-header__content">
            {title && <h2 className="modal-title">{title}</h2>}
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>
        
        <main className="modal-body custom-scrollbar">
          {children}
        </main>
        
        {footer && (
          <footer className="modal-footer">
            {footer}
          </footer>
        )}

        {/* Signature Accents */}
        <div className="modal-accent modal-accent--top"></div>
        <div className="modal-accent modal-accent--bottom"></div>
      </div>
    </div>
  );
};

export default BaseModal;
