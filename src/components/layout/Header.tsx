import React from 'react';
import './Header.scss';

interface HeaderProps {
  label?: string;
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  onBack?: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  label = 'MAGIC PLANNER', 
  title, 
  subtitle, 
  children,
  onBack
}) => {
  return (
    <header className="app-header">
      <div className="header-left">
        {onBack && (
          <button className="header-back-btn" onClick={onBack}>
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        )}
        <span className="header-label">{label}</span>
        <div className="header-divider"></div>
        <div className="header-info">
          <span className="header-title">{title}</span>
          {subtitle && (
            <span className="header-subtitle">
              {subtitle}
            </span>
          )}
        </div>
      </div>
      
      <div className="header-right">
        {children}
      </div>
    </header>
  );
};

export default Header;
