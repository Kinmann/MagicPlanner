import React from 'react';
import { ChevronRight, Info, AlertTriangle, XCircle } from 'lucide-react';
import styles from './Misc.module.scss';

// Banner Component
export interface BannerProps {
  message: string;
  variant?: 'info' | 'warning' | 'error';
  icon?: React.ReactNode;
}

export const Banner: React.FC<BannerProps> = ({ 
  message, 
  variant = 'info', 
  icon 
}) => {
  const icons = {
    info: <Info size={14} />,
    warning: <AlertTriangle size={14} />,
    error: <XCircle size={14} />
  };

  return (
    <div className={`${styles.banner} ${styles[variant]}`}>
      {icon || icons[variant]}
      <span>{message}</span>
    </div>
  );
};

// Breadcrumb Component
export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className = '' }) => {
  return (
    <nav className={`${styles.breadcrumb} ${className}`}>
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          <div 
            className={styles.breadcrumbItem} 
            onClick={item.onClick}
            style={{ cursor: item.onClick ? 'pointer' : 'default' }}
          >
            {item.label}
          </div>
          {idx < items.length - 1 && (
            <ChevronRight size={12} className={styles.separator} />
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};
