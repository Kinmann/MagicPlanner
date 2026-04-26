import React, { useRef, useEffect } from 'react';
import { Terminal, Trash2, ChevronDown } from 'lucide-react';
import { useLogStore } from '../../store/logStore';
import styles from './SystemLog.module.scss';

export const SystemLog: React.FC = () => {
  const { logs, clearLogs } = useLogStore();
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className={styles.systemLog}>
      <div className={styles.header}>
        <div className={styles.title}>
          <Terminal size={14} />
          <span>Output</span>
        </div>
        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={clearLogs} title="Clear logs">
            <Trash2 size={14} />
          </button>
          <button className={styles.actionBtn}><ChevronDown size={14} /></button>
        </div>
      </div>

      <div className={styles.logContainer}>
        {logs.map(log => (
          <div key={log.id} className={styles.logLine}>
            <span className={styles.time}>{log.time}</span>
            <span className={`${styles.level} ${styles[log.level.toLowerCase()]}`}>
              [{log.level}]
            </span>
            <span className={styles.message}>{log.message}</span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};
