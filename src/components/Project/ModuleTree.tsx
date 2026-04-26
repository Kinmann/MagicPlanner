import React from 'react';
import { 
  CheckCircle2, PlayCircle, 
  Clock, ChevronRight, Layers 
} from 'lucide-react';
import { LocalModule } from '../../types/project';
import styles from './ModuleTree.module.scss';

interface ModuleTreeProps {
  modules: LocalModule[];
  selectedModuleId: string | null;
  onSelectModule: (moduleId: string) => void;
}

const ModuleTree: React.FC<ModuleTreeProps> = ({ modules, selectedModuleId, onSelectModule }) => {
  const getStatusInfo = (state: string) => {
    switch (state) {
      case 'COMPLETED': return { icon: CheckCircle2, style: styles.completed };
      case 'ACTIVE': return { icon: PlayCircle, style: styles.active };
      default: return { icon: Clock, style: styles.pending };
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Layers size={14} className="opacity-60" />
        <span>Module Explorer</span>
      </div>
      <div className={styles.list}>
        {modules.map((mod, idx) => {
          const { icon: Icon, style } = getStatusInfo(mod.module_state);
          const isSelected = selectedModuleId === mod.module_id;
          
          return (
            <button
              key={mod.module_id}
              className={`${styles.item} ${isSelected ? styles.selected : ''}`}
              onClick={() => onSelectModule(mod.module_id)}
            >
              <div className={`${styles.itemIcon} ${style}`}>
                <Icon size={16} />
              </div>
              <div className={styles.itemInfo}>
                <span className={styles.itemName}>{mod.module_name}</span>
                <span className={styles.itemOrder}>#{mod.priority_order || idx + 1}</span>
              </div>
              {isSelected && <ChevronRight size={14} className="text-primary opacity-60" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ModuleTree;
