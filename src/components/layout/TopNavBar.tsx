import React from 'react';
import './TopNavBar.scss';

interface TopNavBarProps {
  onOpenSettings: () => void;
  activeTab?: 'dashboard' | 'workspace';
}

const TopNavBar: React.FC<TopNavBarProps> = ({ onOpenSettings, activeTab = 'dashboard' }) => {
  return (
    <header className="top-nav antialiased tracking-tight">
      <div className="top-nav__left flex items-center gap-8">
        <span className="top-nav__logo text-xl font-bold tracking-tighter">Magic Planner</span>
        <nav className="top-nav__menu hidden md:flex gap-6">
          <a 
            href="#" 
            className={`top-nav__link text-sm font-medium transition-colors ${activeTab === 'dashboard' ? 'is-active' : ''}`}
          >
            Dashboard
          </a>
        </nav>
      </div>
      
      <div className="top-nav__right flex items-center gap-4">
        <button 
          className="top-nav__icon-btn material-symbols-outlined hover:bg-[#31394d] transition-colors p-2 rounded-full scale-95 duration-150" 
          onClick={onOpenSettings}
          title="Settings"
        >
          settings
        </button>
      </div>
    </header>
  );
};

export default TopNavBar;
