import React from 'react';
import './SideNavBar.scss';
import Button from '../common/Button';

interface SideNavBarProps {
  projectName?: string;
  activePhase?: 'input' | 'monitoring' | 'archive';
  onPhaseChange?: (phase: 'input' | 'monitoring' | 'archive') => void;
  onNewPipeline?: () => void;
}

const SideNavBar: React.FC<SideNavBarProps> = ({
  projectName = "Project Workspace",
  activePhase = 'input',
  onPhaseChange,
  onNewPipeline
}) => {
  const menuItems = [
    { id: 'input', label: 'Input Phase', icon: 'input' },
    { id: 'monitoring', label: 'Monitoring', icon: 'analytics' },
    { id: 'archive', label: 'Archive', icon: 'archive' },
  ] as const;

  return (
    <aside className="side-nav">
      <div className="side-nav__header">
        <div className="side-nav__brand">
          <div className="side-nav__logo material-symbols-outlined">auto_awesome</div>
          <div className="side-nav__title-group">
            <h2 className="side-nav__title">{projectName}</h2>
            <span className="side-nav__subtitle">Software Planning</span>
          </div>
        </div>
      </div>

      <nav className="side-nav__menu">
        {menuItems.map((item) => (
          <button 
            key={item.id}
            className={`side-nav__item ${activePhase === item.id ? 'is-active' : ''}`}
            onClick={() => onPhaseChange?.(item.id)}
          >
            <span className="side-nav__item-icon material-symbols-outlined">{item.icon}</span>
            <span className="side-nav__item-text">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="side-nav__footer">
        <Button 
          variant="primary" 
          className="side-nav__new-btn"
          leftIcon={<span className="material-symbols-outlined">add</span>}
          onClick={onNewPipeline}
        >
          New Pipeline
        </Button>
      </div>
    </aside>
  );
};

export default SideNavBar;
