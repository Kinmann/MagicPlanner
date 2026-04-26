import React from 'react';
import { 
  Box, 
  Minus, 
  Square, 
  X, 
  Search, 
  PanelLeft, 
  PanelRight,
  Menu,
  ChevronDown
} from 'lucide-react';
import { safeWindow } from '../../utils/tauri';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import styles from './Header.module.scss';

export const Header: React.FC = () => {
  const { 
    isSidebarOpen, 
    isRightPanelOpen, 
    toggleSidebar, 
    toggleRightPanel,
  } = useUIStore();

  const { currentProject } = useProjectStore();

  const handleMinimize = () => safeWindow()?.minimize();
  const handleMaximize = () => safeWindow()?.toggleMaximize();
  const handleClose = () => safeWindow()?.close();

  return (
    <div className={styles.header} data-tauri-drag-region>
      <div className={styles.leftSection}>
        <Menu size={16} className={styles.menuIcon} />
        <div className={styles.logoWrapper}>
          <Box size={14} className="text-[#10b981]" />
          <span className={styles.logoText}>
            {currentProject?.project_name || 'Magic Planner Hub'}
          </span>
          <ChevronDown size={14} className={styles.chevron} />
        </div>
      </div>

      <div className={styles.searchContainer}>
        <div className={styles.searchBox}>
          <Search size={14} className="text-gray-500" />
          <input 
            type="text" 
            placeholder="Search nodes..." 
          />
        </div>
      </div>

      <div className={styles.rightSection}>
        <div className={styles.panelToggles}>
          <div 
            className={`${styles.toggleBtn} ${isSidebarOpen ? styles.active : ''}`}
            onClick={toggleSidebar}
            title="Toggle Left Sidebar"
          >
            <PanelLeft size={14} />
          </div>
          <div 
            className={`${styles.toggleBtn} ${isRightPanelOpen ? styles.active : ''}`}
            onClick={toggleRightPanel}
            title="Toggle Right Sidebar"
          >
            <PanelRight size={14} />
          </div>
        </div>

        <div className={styles.windowControls}>
          <div className={styles.controlBtn} onClick={handleMinimize}>
            <Minus size={14} />
          </div>
          <div className={styles.controlBtn} onClick={handleMaximize}>
            <Square size={12} />
          </div>
          <div className={`${styles.controlBtn} ${styles.closeBtn}`} onClick={handleClose}>
            <X size={14} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;
