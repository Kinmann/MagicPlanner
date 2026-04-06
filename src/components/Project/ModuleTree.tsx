import React from 'react';
import { LocalModule } from '../../types/project';
import './ModuleTree.scss';

interface ModuleTreeProps {
  modules: LocalModule[];
  selectedModuleId: string | null;
  onSelectModule: (moduleId: string) => void;
}

const ModuleTree: React.FC<ModuleTreeProps> = ({ modules, selectedModuleId, onSelectModule }) => {
  const getStateIcon = (state: string) => {
    switch (state) {
      case 'COMPLETED': return 'check_circle';
      case 'ACTIVE': return 'play_circle';
      default: return 'pending';
    }
  };

  const getStateClass = (state: string) => {
    switch (state) {
      case 'COMPLETED': return 'completed';
      case 'ACTIVE': return 'active';
      default: return 'pending';
    }
  };

  return (
    <div className="module-tree">
      <div className="module-tree__header">
        <span className="material-symbols-outlined">account_tree</span>
        <span>모듈 목록</span>
      </div>
      <div className="module-tree__list">
        {modules.map((mod, idx) => (
          <button
            key={mod.module_id}
            className={`module-tree__item ${getStateClass(mod.module_state)} ${selectedModuleId === mod.module_id ? 'selected' : ''}`}
            onClick={() => onSelectModule(mod.module_id)}
          >
            <div className="module-tree__item-icon">
              <span className={`material-symbols-outlined state-${getStateClass(mod.module_state)}`}>
                {getStateIcon(mod.module_state)}
              </span>
            </div>
            <div className="module-tree__item-info">
              <span className="module-tree__item-name">{mod.module_name}</span>
              <span className="module-tree__item-order">#{idx + 1}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ModuleTree;
