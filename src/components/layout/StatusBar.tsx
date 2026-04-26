import React from 'react';
import { GitBranch, XCircle, CheckCircle2, Settings, Bell } from 'lucide-react';
import styles from './StatusBar.module.scss';

export const StatusBar: React.FC = () => {
  return (
    <div className={styles.statusBar}>
      <div className={styles.leftSection}>
        <div className={styles.item}>
          <GitBranch size={12} />
          <span>main</span>
        </div>
        <div className={styles.item}>
          <XCircle size={12} className={styles.mutedItem} />
          <span className={styles.mutedItem}>0</span>
          <CheckCircle2 size={12} className="ml-1" />
          <span>0</span>
        </div>
      </div>

      <div className={styles.rightSection}>
        <div className={styles.item}>UTF-8</div>
        <div className={styles.item}>Magic-Script</div>
        <div className={styles.item}>
          <Settings size={14} />
        </div>
        <div className={styles.item}>
          <Bell size={14} />
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
