import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './Layout.module.scss';

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-8 text-center bg-rose-500/5 border border-rose-500/10 rounded-2xl">
          <h2 className="text-rose-500 font-black mb-2 text-sm">Component Failure</h2>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Safe Mode Engaged</p>
        </div>
      );
    }

    return this.props.children;
  }
}

// AspectRatio Component
export interface AspectRatioProps {
  ratio?: number;
  children: React.ReactNode;
  className?: string;
}

export const AspectRatio: React.FC<AspectRatioProps> = ({ ratio = 16 / 9, children, className = '' }) => {
  return (
    <div 
      className={`${styles.aspectRatio} ${className}`} 
      style={{ paddingBottom: `${(1 / ratio) * 100}%` }}
    >
      <div className={styles.aspectRatioContent}>
        {children}
      </div>
    </div>
  );
};

// Collapsible Component
export interface CollapsibleProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

export const Collapsible: React.FC<CollapsibleProps> = ({ 
  open: controlledOpen, 
  onOpenChange, 
  children, 
  className = '' 
}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;

  const handleToggle = () => {
    if (onOpenChange) onOpenChange(!isOpen);
    else setUncontrolledOpen(!isOpen);
  };

  return (
    <div className={`${styles.collapsible} ${className}`}>
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as any, { isOpen, onToggle: handleToggle });
        }
        return child;
      })}
    </div>
  );
};

export const CollapsibleTrigger: React.FC<{ children: React.ReactNode, onToggle?: () => void }> = ({ children, onToggle }) => (
  <div onClick={onToggle} style={{ cursor: 'pointer' }}>{children}</div>
);

export const CollapsibleContent: React.FC<{ children: React.ReactNode, isOpen?: boolean }> = ({ children, isOpen }) => (
  <AnimatePresence initial={false}>
    {isOpen && (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        style={{ overflow: 'hidden' }}
      >
        {children}
      </motion.div>
    )}
  </AnimatePresence>
);
