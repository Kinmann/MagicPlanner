import React from 'react';
import styles from './Badge.module.scss';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ 
  children, 
  variant = 'secondary', 
  size = 'md',
  className = '',
  ...props 
}) => {
  const classes = [
    styles.badge,
    styles[variant],
    styles[size],
    className
  ].join(' ');

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  );
};

export const Separator: React.FC<{ className?: string, vertical?: boolean }> = ({ className = '', vertical = false }) => (
  <div className={`${styles.separator} ${vertical ? styles.vertical : styles.horizontal} ${className}`} />
);
