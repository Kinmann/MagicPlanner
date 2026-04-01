import React from 'react';
import './Badge.scss';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'error' | 'success' | 'outline';
  size?: 'xs' | 'sm' | 'md';
  icon?: string;
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'secondary',
  size = 'sm',
  icon,
  className = ''
}) => {
  const classNames = [
    'badge',
    `badge--${variant}`,
    `badge--${size}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <span className={classNames}>
      {icon && <span className="badge__icon material-symbols-outlined">{icon}</span>}
      <span className="badge__text">{children}</span>
    </span>
  );
};

export default Badge;
