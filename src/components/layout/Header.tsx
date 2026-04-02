import React from 'react';
import './Header.scss';

interface HeaderProps {
  label?: string;
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}

const Header: React.FC<HeaderProps> = ({ 
  label = 'MAGIC PLANNER', 
  title, 
  subtitle, 
  children 
}) => {
  return (
    <header className="app-header">
      <div className="header-left">
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
